# Supabase

The backend for slice 3 (see [`../docs/features/supabase-sync.md`](../docs/features/supabase-sync.md)
and decisions D15/D16).

```
migrations/   the schema — apply these to your project, in order
test/         proves the schema enforces what the architecture claims
```

## What the database enforces

Three architectural decisions live here as database rules rather than client
conventions, because a convention only holds while every client behaves:

| Decision | Enforced by | Effect |
|---|---|---|
| **D4** append-only | `grant select, insert` — no update, no delete | No client, buggy or hostile, can rewrite your history |
| **D15** meal versioning | `unique (meal_id, version)` | Two devices editing the same base: the second insert fails, and the client turns that into the conflict card |
| **D16** isolation | Row-Level Security, `user_id = auth.uid()` | Family members cannot read or write each other's rows |

`profiles` and `user_preferences` are the two mutable tables — current state,
not a log. Everything else is append-only, and D4 is why.

There is deliberately **no `settings` table** (the API key never leaves the
device, D14/Q8) and **no photo storage** (Q10).

## Verifying

```bash
npm run db:verify
```

Spins up a throwaway Postgres in Docker, applies the migrations, and asserts
every rule above — including that one user genuinely cannot see another's rows.
Takes a few seconds and needs no Supabase account, because RLS, grants and
constraints are ordinary Postgres.

`test/00_local_auth_shim.sql` supplies the two things Supabase would otherwise
provide — `auth.users` and `auth.uid()` — and is **never deployed**. The real
`auth.uid()` reads a JWT claim; the shim reads a session setting, so
`set request.jwt.claim.sub = '<uuid>'` impersonates a signed-in user.

### Verifying your live project

**Easiest — no tooling needed.** Paste
[`test/01_verify_web.sql`](test/01_verify_web.sql) into the Supabase **SQL
Editor** and run it. Same seven checks, returned as a table where every row
should read PASS. It writes only to two throwaway user ids and deletes them
afterwards, so it is safe on a live project.

**Or from the terminal**, if you have `psql`
(`brew install libpq && brew link --force libpq`):

```bash
PG="postgres://postgres:[password]@db.[ref].supabase.co:5432/postgres" \
  ./supabase/test/run.sh
```

## Setting up the project (needs your account)

1. Create a project at [supabase.com](https://supabase.com) — pick the region
   closest to you; free tier is ample for a family.
2. **SQL Editor** → paste `migrations/0001_initial_schema.sql`, run it → then
   `migrations/0002_rls_and_grants.sql`. Order matters.
3. **Authentication → Sign In / Providers → Email** → make sure it is enabled
   (it is on by default in new projects). Nothing else in there needs
   changing: magic links and one-time codes are part of the email provider, so
   nobody in the family manages a password (D16).

   Leave **Confirm email** on. Turning it off only saves a click while
   testing, and means an unverified address can hold an account.

4. **Authentication → URL Configuration** — this one is easy to miss and
   magic links fail silently without it. The link in the email redirects to
   **Site URL**, so it must point at the app:

   - **Site URL:** `http://localhost:5173` while developing
   - **Redirect URLs:** add the deployed origin too, once it exists

   A link that redirects to the wrong origin lands on a page with no session,
   which looks like broken auth rather than broken configuration.
5. **Project Settings → API** → copy the **Project URL** and the **anon**
   public key into `.env.local`:

   ```
   VITE_SUPABASE_URL=https://[ref].supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ…
   ```

   Both are safe in a client bundle by design — the anon key only grants what
   RLS allows, which is why the policies above are the actual security boundary.
   **Never** put the `service_role` (or `sb_secret_…`) key in the app: it
   bypasses RLS entirely, making every policy decorative.

   Supabase renamed these. Either style works:

   | Newer projects | Older projects | Use it? |
   |---|---|---|
   | `sb_publishable_…` | `anon` (a long `eyJ…` JWT) | **yes** — this is the one |
   | `sb_secret_…` | `service_role` | never in the app |

   Then confirm it works:

   ```bash
   npm run supabase:check
   ```

   It checks the URL and key are accepted, the schema is applied, that a
   signed-out caller sees **no rows**, and that a signed-out write is refused —
   i.e. that RLS is genuinely protecting the tables. It also refuses to
   continue if you have pasted a service-role key by mistake.

6. Confirm it took — see "Verifying your live project" above. Every row should
   read PASS.

## Emailed codes rather than links

Sign-in uses `signInWithOtp`, which sends Supabase's **Magic Link** template.
By default that email contains only a link — fine when you read mail on the
same device, awkward when the app is on a laptop and the mail is on a phone.

To get the six-digit code the sign-in screen asks for, add the token to the
template: **Authentication → Emails → Magic Link**, and include

```
{{ .Token }}
```

Both paths then work from one email: click the link on this device, or type the
code on another.

## Running the contract tests against your project

`npm test` runs the repository contract against IndexedDB always, and against
Supabase only when a test account is configured — so the default suite needs no
network and no account.

To enable the Supabase run, create a dedicated test user:

1. **Authentication → Users → Add user → Create new user**
2. Use an address you control, or any real-looking domain — Supabase rejects
   `example.com` and `.invalid`. Something like
   `contract-test@yourdomain.com` works.
3. **Tick "Auto Confirm User"**, otherwise the account cannot sign in.

Then add it to `.env.local`:

```
SUPABASE_TEST_EMAIL=contract-test@yourdomain.com
SUPABASE_TEST_PASSWORD=…
```

`npm test` will then run the same ten assertions against real Postgres, signed
in as that user — so every row is subject to exactly the Row-Level Security a
real user faces. That is the point: it proves the adapter works under the
policies, not merely that the SQL parses.

Its rows are **left in place**: the schema is append-only by design (D4), so a
test cannot clean up after itself. That shapes the suite in a way worth knowing
about — each run writes to its own stretch of the calendar, derived from the
clock so that later runs always land later than earlier ones. Both properties
are needed: distinct stretches stop runs colliding, and *advancing* stretches
are what make `latest()` (a global "newest day for this user" query) return the
current run's rows rather than an older run's.

A test account slowly accumulating rows is the price of proving that history
cannot be rewritten. Delete the user from the dashboard to remove them all at
once — the foreign keys cascade.

## AI analysis on the owner's key (the trial)

New users get **10 free analyses** on the owner's OpenAI key, so someone can
sign in and photograph a meal before they have ever heard of an API key. It
runs on `gpt-5.6-sol` — the trial is the pitch, so it should show the app at
its best, at roughly 70 cents per person who tries it.

None of it can live in the browser: a master key in the bundle is extracted in
minutes, and a quota the client counts is a suggestion. So the key is a
function secret, the count comes from the `usage` ledger, and the refusal
happens server-side.

### Deploying it

1. **Apply the migrations** (SQL Editor, in order):
   `0003_usage_ledger.sql`, `0004_admin_views.sql`, `0005_admin_key_source.sql`,
   `0006_conversation_followups.sql`, then `0007_user_preferences.sql`.

   `0006` adds `conversation_id` and the `OK_FOLLOWUP` outcome, which is how a
   meal the model asked a question about still costs one analysis rather than
   three. Until it is applied, answering a question fails.

   `0007` adds `user_preferences`, which is where a person's language lives so
   it follows them between devices. Until it is applied the app falls back to
   the device's own copy and never prompts — deliberately, since a table it
   cannot read is not the same as a preference nobody has set.

2. **Set a hard spend cap on the OpenAI organisation** before the key is ever
   used by anyone but you — [platform.openai.com](https://platform.openai.com)
   → Settings → Limits. Per-user quotas bound the normal case; the cap is the
   backstop for everything else, and it is the cheapest insurance there is.

   Sizing it: a trial costs ~$0.70 (10 analyses on sol), so **$10 covers about
   fourteen people trying the app**. Two things follow from that. The cap is
   **organisation-wide**, so trial users exhausting it also stops the owner's
   own key from working — watch `admin_daily_cost` before inviting a crowd.
   And when it is reached, OpenAI fails every call with 429: the function
   recognises that, tells the user free analyses are unavailable and points
   them at their own key, and records the attempt as PROVIDER_ERROR — so a
   budget failure never consumes somebody's trial.

3. **Split the OpenAI account into projects, one per audience.** This is the
   step that actually isolates spend, and it is easy to get wrong: separate
   *keys* in one organisation still share one budget. Separate **projects** do
   not — a project's hard limit applies only to that project's traffic.

   At [platform.openai.com](https://platform.openai.com) → Projects, create:

   | Project | Key | Who spends it |
   |---|---|---|
   | `precisionhealth-trial` | `OPENAI_TRIAL_KEY` | new users' first 10 analyses |
   | `precisionhealth-admin` | `OPENAI_ADMIN_KEY` | you, unlimited, on your own app |
   | `precisionhealth-plans` | (later) | paying users, when plans exist |

   ⚠️ **Set each project's limit as a HARD limit, not a notification.** A
   plain monthly budget on OpenAI only emails you; requests keep going
   through. The hard limit is the one that makes calls fail at the ceiling,
   and it is the entire reason for doing this.

4. **Store the keys as function secrets** — never environment variables the
   client build can see:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-ref>
   npx supabase secrets set OPENAI_TRIAL_KEY=sk-proj-...
   npx supabase secrets set OPENAI_ADMIN_KEY=sk-proj-...
   npx supabase functions deploy estimate-food
   ```

   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
   provided to functions automatically — do not set them. (`OPENAI_MASTER_KEY`
   is still read as a fallback, so an earlier deployment keeps working.)

5. **Check it**: sign in and photograph something. It should simply work, with
   no key configured and nothing on screen about a trial — that is deliberate.
   A row appears in `usage`; the eleventh photo is refused with the explanation.
   The Log screen's **Write** tab exercises the same function with `{ text }`
   instead of `{ photo }` — one input or the other, counted identically.

Anyone listed in `app_admins` analyses on `OPENAI_ADMIN_KEY` with no quota at
all, and their usage is recorded as `MASTER_ADMIN` so it never inflates the
cost-of-trial figures.

If the migrations are not applied, the app quietly stays in bring-your-own-key
mode rather than advertising a trial it cannot honour.

### Watching what it costs

`admin_daily_cost`, `admin_user_summary` and `admin_funnel` (migration 0004)
answer cost, per-user usage and trial conversion from the SQL Editor. Add
yourself to `app_admins` to see other users' rows:

```sql
insert into public.app_admins (user_id, note)
values ('<your auth.users id>', 'owner');
```

That grant covers **usage metadata only**. The health tables have no admin
policy at all, so an admin reading someone's meals is not "denied" — it
returns zero rows (D19).

## Changing the schema later

Add a new numbered file in `migrations/`; never edit one that has been applied.
Run `npm run db:verify` — it applies every migration from scratch, so a change
that breaks an invariant fails locally rather than in production.
