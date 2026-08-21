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

`profiles` is the one mutable table — a profile is current state, not a log.

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

## Changing the schema later

Add a new numbered file in `migrations/`; never edit one that has been applied.
Run `npm run db:verify` — it applies every migration from scratch, so a change
that breaks an invariant fails locally rather than in production.
