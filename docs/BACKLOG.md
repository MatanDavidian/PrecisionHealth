# The pool

Bugs, tasks and decisions that are real but not next. Started on 2026-11-15,
when the owner closed Phase 1 as a plan and moved what was left of it here,
so the work could go to the epics in [`ROADMAP.md`](ROADMAP.md).

How to use it:
- Something found along the way that is not worth stopping for goes here,
  with a line saying why it matters.
- Before starting an epic, read the pool once: an item that the epic touches
  anyway is cheapest done then.
- An item leaves by being done, by moving into an epic, or by being struck
  out with the reason. Nothing is deleted quietly.

Sizes: **S** under half a day · **M** one to two days · **L** three to five.
Who: **C** = Claude in the repo · **M** = Matan.

## Bugs

None known. Found and fixed on 2026-11-15: the site's security policy
blocked Google Play's purchase sheet; Play subscriptions said "Lemon
Squeezy" on their buttons; and on a tester's phone "Take a photo" did
nothing, because the browser was not allowed to use the camera and Android
says nothing when that happens (the app now notices and offers the photo
picker).

## Tasks for Claude

| Item | Size | Why, and where it came from |
| --- | --- | --- |
| Contract tests on a local Supabase | M | They run against production today and grow the test account (2,066 meals). Needs a 2 GB download, so with the owner around (`PHASE-1-FINISH.md`, open item 6) |
| Motion | M | Totals counting up after a save, rows arriving in turn, all off under reduced motion (`PHASE-1-FINISH.md`, P3) |
| Chargebacks handled automatically | M | They are only logged and flagged today. Waits for a real one, because Lemon Squeezy's documents do not describe what a dispute event carries |
| The onboarding's "has logged recently" case under test | S | The new-account notice is tested for an empty account, not for one with a meal in the last month (`e2e/onboarding.spec.ts`) |
| Refund on Google Play, tried once | S | Purchase, renewal, cancel and expiry were verified on 2026-11-15; a refund from Play Console's order management was not |
| Watch sync logic under test, beyond the simulator probe | M | Low priority; the watch app changes rarely |
| Export written without indentation | S | Only if real export files grow large (50,000 meals is about 70 MB today) |
| An admin screen | L | When answering questions from the SQL Editor becomes annoying, and never one that shows a person's meals (D19) |

## Tasks for the owner

| Item | Size | Why |
| --- | --- | --- |
| The onboarding design pass in Claude Design | M | A first version is built (2026-11-15); the roadmap asked for a designed one |
| The Dial logo, then icons everywhere | M | The dot stays until the public launch (decided 2026-10-17). Also listed as Epic 1.7 |
| Confirm the GPT-6 prices on OpenAI's own page | S | Ours came from news coverage and price trackers, GPT-6.1 Terra's included |
| The Supabase data processing agreement | S | The Privacy Policy names Supabase as a processor |
| A restore drill | M | Supabase takes backups; nobody has restored one |
| The `www` → apex redirect | S | `www.vimetry.app` should land on the site |
| The trademark search for "Vimetry" | M | Classes 9 and 44, in Israel, the EU and the US |
| Google Play's 15% service fee enrolment | S | A free form in the payments profile; subscriptions are at 15% already, one-time purchases would be at 30% without it |
| A Gmail filter on `to:support@vimetry.app`, never spam | S | One support message has already landed out of sight |
| The leftover test subscription on `davidianmatan+phtest` | S | Refund it, or keep it for testing as a subscriber |

## Decisions waiting

| Decision | What depends on it |
| --- | --- |
| Decode iPhone (HEIC) photos in the browser, or keep naming the format | A 3 MB decoder under the LGPL, and `worker-src blob:` in the security policy |
| Logging offline: accept online-first (D16), or build a queue | Epic 6.6 in the roadmap |
| What to do with a real chargeback | The automatic handling above |
| An age gate for under-16s | The Terms say no; nothing enforces it |
| A limit on free accounts per person | Only if the daily counts show it happening; the daily ceiling caps the cost meanwhile |

## Set aside by the owner

Not to be raised again unless something changes.

- **Rotating the OpenAI key** that was pasted into a chat at the start of
  the project. Deferred on 2026-10-09; raise it only if unexpected OpenAI
  usage appears.
- **Two-factor sign-in on Lemon Squeezy.** Declined on 2026-11-12, for now.
- **A "choose from library" photo button.** Declined on 2026-10-17.
- **Changing the brand orange and green** to pass contrast. Declined on
  2026-10-17; the greys were darkened instead.
