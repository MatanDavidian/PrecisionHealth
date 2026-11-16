# Feature spec — coaches and nutritionists

**One line:** a client can let their nutritionist or trainer read their food
log, the coach can comment on it, and the client can end it in one tap.

Status: **design only, nothing built** (2026-11-16). Epic 4 in
[`../ROADMAP.md`](../ROADMAP.md). This page is the plan, the architecture, the
code design and the screens. It ends with the decisions the owner has to make
before any code is written.

Words used here: the **client** is the person logging meals. The **coach** is
whoever they share with: a nutritionist, a dietitian, a trainer. A **grant** is
one client's permission to one coach.

---

## 1. What it is, and what it is not

Dana logs her meals in Vimetry. Noa is her nutritionist. Today Dana sends
screenshots over WhatsApp before each session, and Noa scrolls back through a
chat to find last Tuesday's dinner.

With this feature: Noa sends Dana a link. Dana opens it, sees who is asking
and exactly what would be shared, and agrees. From then on Noa opens Vimetry,
picks Dana from her list, and sees Dana's days and weeks as Dana sees them,
read-only. She writes a comment under Thursday's lunch. Dana sees it next to
that lunch and replies. When they stop working together, Dana taps "Stop
sharing" and Noa's access ends that second.

What it is **not**, in the first version:

- **Not a way for the coach to change anything.** A coach never adds, edits
  or deletes a client's records. They write comments, and nothing else.
- **Not a chat.** Comments belong to a meal, a day or a week. There is no
  free-floating conversation and no "online now".
- **Not meal plans.** A coach setting targets or menus for a client is a
  later feature, after the pilot says it is wanted.
- **Not a clinic system.** No appointments, no invoices, no teams of coaches
  sharing one client list.
- **Not medical advice from Vimetry.** What a coach writes is the coach's
  own professional word, and the Terms have to say so.

## 2. The rules the design must not break

1. **The client decides.** Nothing is shared until the client has seen the
   coach's name and the exact list of what is shared, and agreed. A coach
   can ask; only the client can grant.
2. **Scoped.** A grant says which kinds of data, and from which day. Anything
   outside it does not exist as far as the coach is concerned.
3. **Read-only.** See above.
4. **Ends at once.** Stopping is one tap and takes effect in the database
   immediately. It cannot erase what the coach already saw, and the app says
   so plainly.
5. **Visible.** The client can always see who has access and when they last
   looked.
6. **Enforced by the database, not by the screens.** A coach who skips the
   app and calls the server directly gets exactly what the grant allows.
7. **The owner still never sees anyone's food** (D19). No admin view is added.
8. **Comments go nowhere else.** They are not sent to the AI model, not put
   in emails, and not counted in any analytics.

## 3. The plan

Six slices. Each leaves the app working and is useful on its own.

| # | Slice | What exists at the end | Size | Who |
| --- | --- | --- | --- | --- |
| A | **Find out** | Three conversations with working coaches (questions in section 8); clickable mock-ups of the screens in section 6; the decisions in section 7 made; one hour of legal advice | S–M | M, C for the mock-ups |
| B | **Subject refactor** | No visible change. The day and week screens can show "a person's data" instead of always "my data" (section 5.3). Every existing test still passes | M | C |
| C | **Sharing, read-only** | A coach profile and link; the client's agree screen; the client's list with "Stop sharing"; the coach's client list and read-only day and week; the access log. No comments yet | L | C |
| D | **Comments** | Comments and replies on a meal, a day and a week; unread marks for both sides | L | C |
| E | **Being told** | A quiet email, at most once a day, saying only "you have new comments" with no health detail; the 90-day "still sharing?" reminder | M | C |
| F | **Pilot, then price** | Three coaches and their clients using it free for a month; then the decision on who pays | calendar | M |

Before the pilot starts: a security review of slice C and D by someone other
than their author (a fresh review pass with the attack tests in section 5.6),
the new Privacy Policy and Terms versions, and Google's Data safety form.

Order of work for Claude: B → C → D → E, about three weeks in all. Slice A
runs first and can overlap with Epic 3's Health Connect spike.

Left for later, on purpose: targets and plans set by a coach, a coach
inviting by email in bulk, push notifications, several coaches in one
practice, summaries across clients, and anything involving photos (the app
stores none today).

## 4. Architecture

### 4.1 The one decision that shapes the rest

Every health table is protected today by one rule: a row is readable only by
its owner (`user_id = auth.uid()` in each table's row-level policy).
`PHASES.md` warned that this feature means replacing that rule.

**The design here does not replace it. It leaves it exactly as it is.**

A coach gets no access to the health tables at all. Instead there is one
narrow door: a small set of database functions that a coach can call. Each
one checks the grant, cuts the answer down to the grant's scope and dates,
writes a line in the access log, and only then returns rows.

```
client's own app ──► health tables            (rule unchanged: owner only)

coach's app ──► coach_range(grant, from, to)  ──► checks the grant is active
                                                  keeps only shared kinds and days
                                                  logs the read
                                              ◄── rows, in the tables' own shape
```

Why a door and not wider table rules:

- **The blast radius stays small.** A mistake in the new code can expose at
  most what one function returns, not a table.
- **Reads can be logged.** Table rules cannot record that someone looked; a
  function can. Rule 5 depends on this.
- **Scope is one piece of code.** "Weight yes, sleep no, nothing before
  12 November" is a few lines in a function, against five tables' worth of
  policies that must all agree.
- **Everything already tested stays tested.** The existing database tests
  that prove one account cannot read another keep their meaning.

The cost: the coach's screens need their own way of loading data (section
5.2), because they cannot use the ordinary table reads.

### 4.2 Tables

All new, in one migration (`0018_coaching.sql`). Names are proposals.

**`coach_profiles`** — a user becomes a coach by having a row here.

| Column | Notes |
| --- | --- |
| `user_id` | primary key, the coach's account |
| `display_name` | what clients see: "Noa Levi" |
| `profession` | free text the coach writes: "Clinical dietitian". Shown as their own description, never verified by us |
| `link_code` | a long random code for their invitation link. The coach can replace it, which kills the old link |
| `created_at` | |

**`care_grants`** — one row per client-and-coach permission. Never edited
except to end it; changing the scope ends the row and writes a new one, in
keeping with append-only records (D4).

| Column | Notes |
| --- | --- |
| `id` | |
| `client_id`, `coach_id` | the two accounts |
| `client_name` | the name the client chose to show this coach |
| `coach_name` | copied from the profile at the time, so the client's history still reads properly if the coach later leaves |
| `shares_meals`, `shares_body`, `shares_activity` | what is shared (section 4.3) |
| `from_day` | the earliest day the coach may see |
| `created_at` | |
| `ended_at`, `ended_by` | empty while active. `CLIENT`, `COACH`, or `ACCOUNT_CLOSED` |
| `policy_version`, `document_sha`, `locale` | the words the client agreed to, recorded the way `consents` records the policies |

At most one active grant per client-and-coach pair, enforced by a unique
index over rows with no `ended_at`.

**`care_comments`** — a comment or a reply.

| Column | Notes |
| --- | --- |
| `id`, `grant_id`, `client_id` | whose log it is about |
| `author_id`, `author_role` | `COACH` or `CLIENT` |
| `target` | `MEAL`, `DAY` or `WEEK` |
| `meal_id`, `day` | the meal's stable id (the same across its versions, D15), and the day or the week's first day |
| `body` | plain text, up to 2,000 characters |
| `created_at`, `read_at`, `removed_at` | read by the other side; taken back by its author |

**`care_access_log`** — one row per grant per calendar day on which the
coach looked: first time, last time, and how many reads. Enough to tell the
client "Noa last looked yesterday at 14:02" without recording every click.

**`coach_invites`** — pilot only: codes the owner hands to the coaches he
has chosen. Creating a coach profile needs one. Removed, or replaced by
payment, when the feature opens up.

### 4.3 What a coach can see

| Shared kind | What it includes | In the first version |
| --- | --- | --- |
| **Meals** | Every meal on a shared day: foods, amounts, calories and nutrients, the time, the meal's own note, and whether a number is the client's own or an AI estimate. The client's calorie and protein goals come with it, because a food log cannot be judged without them | always on: it is the point |
| **Weight and body** | Weight and body fat | the client chooses |
| **Activity** | Calories burned, steps, workouts | the client chooses |
| **Sleep and recovery** | Sleep, HRV, resting heart rate | not offered yet |

Never shared, whatever is chosen: the client's email address, anything about
their subscription or payments, their conversations with the AI model, their
connected devices, their consent records, and days before `from_day`. Photos
are not stored by the app, so there are none to share.

How far back: the client picks one of "from today", "the last 30 days too"
(the suggested choice, so the coach has a baseline), or "everything".

### 4.4 The functions (the door)

Database functions with fixed, minimal jobs, in the style of
`reserve_analysis`. All refuse anyone who is not signed in.

| Function | Who calls it | What it does |
| --- | --- | --- |
| `coach_by_link(code)` | a client | Returns the coach's name, profession and email address for the agree screen. Nothing else, and no way to list coaches |
| `grant_access(code, scope, from_day, client_name, consent…)` | a client | Creates the grant for the caller. Ends an older active grant to the same coach first |
| `end_grant(grant_id)` | either side | Ends it. The caller must be the grant's client or coach |
| `coach_clients()` | a coach | The coach's active grants: client name, scope, since when, the last day the client logged, unread replies |
| `coach_range(grant_id, from, to)` | a coach | The shared rows for those days, already cut to scope, in one answer for a whole week. Writes the access log |
| `create_coach_profile(invite, name, profession)` | a user | Becomes a coach (pilot: needs an invite code) |

Comments use ordinary row-level rules, because both sides read and write
them: the client sees every comment about their own log; a coach sees and
writes comments only on a grant that is theirs and still active. The moment
a grant ends, the coach can no longer read the thread, their own comments
included. The client keeps all of it.

### 4.5 When accounts close

- **The client deletes their account:** grants, comments and the access log
  go with it. The coach's list simply no longer shows them.
- **The coach deletes their account:** each of their grants is ended first
  (`ACCOUNT_CLOSED`). The client keeps the comments, shown under the name
  copied into the grant, marked as a closed account. `delete-account` gains
  this step before it removes the user, the way it already cancels billing
  first.
- **The client's data export** gains three things: who they shared with and
  when, when each coach looked, and every comment on their log.

## 5. Code design

### 5.1 Layers, as the architecture already has them

| Layer | New | Rule it follows |
| --- | --- | --- |
| Database | `0018_coaching.sql`: the tables, the functions, the comment rules. The health check's list of expected functions and tables grows with it | the database enforces (D16) |
| Domain | `src/domain/coaching.ts`: `Grant`, `Scope`, `Comment`; pure functions such as "is this kind shared", "which days are visible", "group comments into threads" | no framework imports (D2) |
| Repositories | `CoachingRepository` (section 5.2) | the UI depends on an interface, never on Supabase (D3) |
| Screens | section 6 | strings in both languages, right-to-left checked |

No new server function (edge function) is needed for slices B to D. Slice E
adds one, for the email.

### 5.2 The repository

One new interface beside the existing ones in `src/data/repositories.ts`:

```
CoachingRepository
  // as a client
  coachByLink(code)                      → who is asking
  grant(code, scope, fromDay, name)      → Grant
  myGrants()                             → Grant[]  (with "last looked")
  endGrant(grantId)

  // as a coach
  myCoachProfile() / createCoachProfile(invite, name, profession) / newLink()
  clients()                              → the client list
  readClient(grantId)                    → ReadOnlyHealthRepositories

  // both
  comments(clientId, range)              → Comment[]
  addComment(grantId, target, body) / markRead(ids) / removeComment(id)
```

The important one is `readClient`. It returns an object with the **same
reading methods the screens already use** (`meals.listByDay`,
`observations.listByDay`, `goals.listActive`, and so on), implemented on top
of `coach_range`, and with **no writing methods at all**. The type has no
`add`, `save` or `retract`, so a coach screen that tried to change a
client's data would not compile. The rows come back in the tables' own
shape, so the existing code that turns a row into a `Meal` is reused as it
is.

### 5.3 The subject refactor (slice B)

Today every screen assumes the data on screen belongs to the signed-in
person: `useDay` calls `getRepositories()` and `currentUserId()` directly.

Slice B introduces a **subject**: whose data this part of the screen shows.

```
subject = { kind: 'self' }                                  ← everywhere today
subject = { kind: 'client', grantId, name, scope, fromDay } ← inside /coach/…
```

A small provider supplies it, and the data hooks (`useDay`, the week
loader, the nutrition list) ask the subject for their repositories and user
id instead of reaching for the globals. A second value, `readOnly`, switches
off every control that writes: Add meal, edit, the calorie nudge, Fill the
week, the weight field.

Slice B ships with only the `self` subject, so nothing visible changes and
the whole existing test suite is its test. That is deliberate: the risky
part of this feature for existing users is touching the screens they use
every day, and this isolates it from everything new.

After it, the coach's view of a client is the same Today, Nutrition and Week
components, mounted under a different subject. No second copy of the screens
to keep in step.

### 5.4 Routes

| Route | Screen |
| --- | --- |
| `/c/:code` | The client's agree screen, from the coach's link |
| `/settings?tab=sharing` | The client's list of who can see their log |
| `/coach` | The coach's client list (and "become a coach" if they are not one) |
| `/coach/:grantId/today`, `/coach/:grantId/nutrition` | A client's day, week and meals, read-only, with comments |

Sharing needs an account on both sides. A signed-out visitor who opens a
coach's link is taken to sign in and brought back to the same screen. What
they logged before signing in moves into the account by the existing
"bring your data" step.

### 5.5 Inside the Android app

All of this is the website, so it reaches the Android app with no new
version. A coach's link should open the installed app when it is installed
and the website otherwise; whether the current Android package claims every
`vimetry.app` link or only its start page is to be checked in slice C.

### 5.6 Tests

- **Attack tests in the database** (`supabase/test/01_verify.sql`), written
  before the functions: a stranger calls `coach_range` with someone else's
  grant; a coach asks for days before `from_day`; a coach asks for weight
  when only meals are shared; a coach reads after the grant ended; a coach
  reads the health tables directly; a client ends another client's grant; a
  guessed link code; a comment written on an ended grant.
- **Domain tests** for scope and thread grouping.
- **Browser tests** for each flow in section 6, in both languages, and the
  accessibility scan on every new screen.
- **The health check** learns the new tables and functions, so a deploy that
  misses the migration turns it red, as on 25 September.

### 5.7 What can go wrong, said plainly

| Risk | What the design does |
| --- | --- |
| Someone pretends to be a coach | The agree screen shows the coach's sign-in email, which we did verify, beside the name they typed, which we did not. The client is asked to check it is their coach |
| A coach's account is taken over | One breach would open every client of that coach. Sign-in is by emailed code already; the access log lets each client see reads they did not expect; the 90-day reminder trims forgotten grants; the health check counts unusual reading (one account reading many clients in a short time) |
| A coach keeps a copy | Nothing technical prevents a screenshot. The coach terms forbid keeping or passing on client data, and "Stop sharing" says honestly that it cannot unsee |
| A comment that harasses | The client can stop sharing at once; "Report" reuses the reporting already built for AI answers |
| A bug shows the wrong client | The functions take a grant id and derive the client from it; the coach never supplies a client id. Attack tests cover it |
| A coach changes a client's log | No function writes health data, and the read-only repository has no method that could |

## 6. Screens

Mobile first, in the app's existing style: the same cards, pills and
type. Every screen in English and Hebrew. Sketches show content and order,
not final layout.

### 6.1 The client

**The agree screen** (`/c/:code`) — the most important screen in the feature.

```
┌──────────────────────────────────────────┐
│  Share your log with                     │
│  Noa Levi                                │
│  Clinical dietitian (in her own words)   │
│  noa@example.com                         │
│  Check this is the person you work with. │
│                                          │
│  WHAT NOA WILL SEE                       │
│  ☑ Meals, and your calorie and protein   │
│    goals                     (always)    │
│  ☐ Weight and body fat                   │
│  ☐ Activity: calories burned, steps,     │
│    workouts                              │
│                                          │
│  FROM WHEN                               │
│  ○ Only from today                       │
│  ● The last 30 days too                  │
│  ○ Everything                            │
│                                          │
│  The name Noa will see:  [ Dana K.    ]  │
│                                          │
│  Noa can read and comment. She cannot    │
│  change anything. She never sees your    │
│  email, your payments or your chats with │
│  the AI. You can stop at any time, in    │
│  Settings → Sharing.                     │
│                                          │
│  [ Share with Noa ]        Not now       │
└──────────────────────────────────────────┘
```

**Settings → Sharing**

```
┌──────────────────────────────────────────┐
│  SHARING                                 │
│  Noa Levi · since 12 November            │
│  Sees: meals, weight · from 13 October   │
│  Last looked: yesterday, 14:02           │
│  [ Change ]   [ Stop sharing ]           │
│                                          │
│  Have a link from your coach? Open it on │
│  this phone, or paste it here: [      ]  │
└──────────────────────────────────────────┘
```

"Stop sharing" asks once: *"Noa will stop seeing your log from this moment.
What she has already seen stays seen. Her comments stay with you."*

With nobody shared, the card explains the feature in two sentences and shows
only the paste field.

**Knowing it is on.** While any grant is active, Today and Nutrition carry a
small quiet label, "Shared with Noa", that opens Settings → Sharing. Sharing
should never be something a person forgot they switched on.

**Comments, where the food is.** On Nutrition, a meal with comments shows a
small mark and a count; opening the meal shows the thread under it, with a
reply box. On Today, new comments appear as one card at the top:

```
┌──────────────────────────────────────────┐
│  FROM NOA                         2 new  │
│  Thursday's lunch                        │
│  "Good protein here. Try adding a        │
│   vegetable next time."                  │
│  [ Reply ]            [ See the meal ]   │
└──────────────────────────────────────────┘
```

### 6.2 The coach

**Becoming a coach** (`/coach`, first visit): the name clients will see, what
they do in their own words, the coach terms to agree to, and during the
pilot an invite code. Then their link, with Copy, a QR code, and a ready
message to send:

> "Hi, I use Vimetry to follow food logs. Open this link to share yours
> with me: vimetry.app/c/…"

**The client list** (`/coach`)

```
┌──────────────────────────────────────────┐
│  CLIENTS                     [ My link ] │
│  ┌────────────────────────────────────┐  │
│  │ Dana K.               1 new reply  │  │
│  │ Logged today · 3 meals             │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ Yossi M.                           │  │
│  │ Nothing logged for 4 days          │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

Sorted by who needs attention: new replies first, then clients who have gone
quiet. A "Clients" item appears in the navigation only for people who have a
coach profile. A coach is also an ordinary user with their own log, and the
two must never be confused, which is what the next screen is careful about.

**A client's log** (`/coach/:grantId/today`)

```
┌──────────────────────────────────────────┐
│ ▌Dana K.'s log · read-only     ← Clients │
│ ▌Shared since 13 Oct: meals, weight      │
│                                          │
│   [ Day ]  Week          ‹  Thursday  ›  │
│                                          │
│  NUTRITION                               │
│  Calories              1,840 / 2,000     │
│  Protein               96 / 120 g        │
│                                          │
│  MEALS                                   │
│  Breakfast   Eggs and oats     420 kcal  │
│  Lunch       Chicken, rice     690 kcal  │
│     💬 1 · Comment                       │
│  Dinner      Pasta (estimate)  730 kcal  │
│     Comment                              │
│                                          │
│  [ Comment on this day ]                 │
└──────────────────────────────────────────┘
```

The coloured band and the client's name stay on screen on every client page,
in a colour the coach's own log never uses. The day and week are the same
components the client sees, with every editing control gone. A kind that is
not shared shows as a line saying so ("Dana does not share weight"), never
as an empty value that looks like missing data. Days before the grant's
start say "not shared before 13 October".

**Writing a comment:** a sheet from the bottom with the meal named at its
top, a text box, and Send. No formatting, no attachments.

### 6.3 The states that are easy to forget

| State | The client sees | The coach sees |
| --- | --- | --- |
| The link's code was replaced or is wrong | "This link no longer works. Ask your coach for a new one" | — |
| The client opens the link of a coach they already share with | Their current sharing, with Change | — |
| Sharing stopped while the coach is on the page | — | "Dana has stopped sharing", and back to the list |
| The coach closed their account | The comments, under the name, marked as a closed account | — |
| The client has not logged in the shared period | — | "Nothing logged yet since sharing began" |
| 90 days of sharing | "Still sharing with Noa?" Keep, or Stop | — |

## 7. Decisions for the owner

Each has a recommendation. None is expensive to change before slice C, and
most are expensive after the pilot.

| # | Decision | Recommendation, and why |
| --- | --- | --- |
| 1 | Who starts: the coach sends a link, or the client makes a code | **The coach's link.** It is how coaches already onboard clients, and each link sent is also an invitation to install the app. The client still makes the grant |
| 2 | What can be shared at first | **Meals and goals always; weight and activity by choice.** Sleep and recovery after the pilot |
| 3 | The suggested history | **The last 30 days**, so the coach has a baseline |
| 4 | May the client reply to a comment | **Yes.** Otherwise replies go to WhatsApp and lose their context |
| 5 | Does sharing end by itself | **No, but ask every 90 days.** Ending silently mid-work would be worse than a reminder |
| 6 | The Hebrew word for "coach" | **"מלווה"**, which fits a trainer and a nutritionist alike and reads the same for a man or a woman. To be tested in the conversations |
| 7 | Who may become a coach during the pilot | **Only people the owner invites**, by code |
| 8 | Who pays | **Nobody during the pilot.** Ask in the conversations; decide from what the pilot shows |
| 9 | Does the coach see which numbers are AI estimates | **Yes.** A professional needs to know which numbers were measured and which were guessed |

To take to the hour of legal advice:

- the sentence in the Terms that makes a coach's comments the coach's own
  professional word, and not Vimetry's advice
- the coach terms: confidentiality, no keeping or passing on client data
- whether inviting "clinical dietitians" by name touches Israel's rules for
  regulated health professions
- the Privacy Policy section on sharing, and whether the coach is a separate
  controller of what they read (the working assumption here)
- Google Play's Data safety form: sharing that the user starts themselves
  is, by Google's definition, not "sharing" to declare, to be confirmed
  against the form

## 8. Questions for the three conversations

For the owner, with working nutritionists or trainers. Listen for what they
do today, not for whether they like the idea.

1. How do your clients show you what they ate today? What is annoying
   about it?
2. How often do you look at a client's food between sessions?
3. When you look, what are you looking for first?
4. What do you write back, and where?
5. Do you need their weight? Their training? Their sleep?
6. How many clients do you follow this way at once?
7. Would your clients install an app because you asked them to? Have they
   before?
8. What do you pay for today to do this job (apps, spreadsheets)? What
   would make this worth paying for, and who should pay: you or the client?
9. What would stop you using it?
