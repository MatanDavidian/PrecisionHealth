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

To verify against a real database instead:

```bash
PG="postgres://postgres:[password]@db.[ref].supabase.co:5432/postgres" \
  ./supabase/test/run.sh
```

## Setting up the project (needs your account)

1. Create a project at [supabase.com](https://supabase.com) — pick the region
   closest to you; free tier is ample for a family.
2. **SQL Editor** → paste `migrations/0001_initial_schema.sql`, run it → then
   `migrations/0002_rls_and_grants.sql`. Order matters.
3. **Authentication → Providers** → enable **Email**, and turn on
   "Confirm email". Magic links / OTP need no password (D16).
4. **Project Settings → API** → copy the **Project URL** and the **anon**
   public key into `.env.local`:

   ```
   VITE_SUPABASE_URL=https://[ref].supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ…
   ```

   Both are safe in a client bundle by design — the anon key only grants what
   RLS allows, which is why the policies above are the actual security boundary.
   **Never** put the `service_role` key in the app: it bypasses RLS entirely.

5. Confirm it took: `PG="…" ./supabase/test/run.sh` against the project should
   print the same PASS lines.

## Changing the schema later

Add a new numbered file in `migrations/`; never edit one that has been applied.
Run `npm run db:verify` — it applies every migration from scratch, so a change
that breaks an invariant fails locally rather than in production.
