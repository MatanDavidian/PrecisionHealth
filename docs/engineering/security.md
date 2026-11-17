# Security

**One line:** Vimetry is safe to use for what it is today. People's data is
walled off per account by the database itself, nothing that costs money can
be triggered by a stranger, and no secret has ever been committed. Seven
improvements are listed at the end; none is urgent, and the most important
is the owner's own accounts.

Reviewed 2026-11-17, against the code at `e32795d`. Not a penetration test:
a reading of every table rule, every server function and the browser's
defences, plus a scan of the dependencies and of the whole git history.

---

## What is worth protecting

| What | Where it lives | Why it matters |
| --- | --- | --- |
| Food logs, weight, activity | Supabase (Postgres), and the browser's own storage | Health data: the most sensitive thing here (see [`../ops/compliance.md`](../ops/compliance.md)) |
| A person's own OpenAI key | Only on their device | Spending it costs them money |
| The owner's OpenAI keys | Supabase function secrets | Spending them costs the owner money |
| Subscriptions | Supabase, written only by the server | A forged row would be free paid analyses |
| The Play signing key, the Lemon Squeezy and Google secrets | The owner's machine and Supabase secrets | Whoever holds them can ship or bill as Vimetry |

## How each layer holds

### 1. The database: one person cannot read another's data

- **Every table has row-level security on**, 16 of 16. A user's rows are
  readable and writable only where `user_id = auth.uid()`: the database
  checks it, not the app, so a modified app or a hand-made request gets the
  same answer.
- **Records are append-only.** No user may delete or update a meal or a
  measurement; a correction is a new version (D4 in
  [`architecture.md`](architecture.md)). A stolen session can add rows, not
  destroy history. Deleting an account is its own server function.
- **What the server writes, users cannot.** Subscriptions, billing events,
  usage, error and AI reports have no insert grant for users at all.
- **The privileged functions** (`reserve_analysis`, `settle_analysis`,
  `release_analysis`, `health_missing`, `record_client_error`,
  `record_ai_report`) run as the owner, have a fixed `search_path`, and have
  execute revoked from every browser role.
- **Device tokens** (the watch's way in) are stored hashed, the hash column
  is not even readable by its owner, and the only thing a user may change is
  revoking their own.
- **Admin views** run with the caller's rights (`security_invoker`), so they
  show nothing to anyone who is not in `app_admins`.

### 2. The server functions: each one checks who is calling

| Function | Who may call | How it is checked |
| --- | --- | --- |
| `estimate-food`, `billing`, `play-billing`, `delete-account`, `issue-device-token` | A signed-in user | The session token is verified with Supabase (`auth.getUser()`); the plan, admin status and allowance are read from the database, never from the request |
| `lemonsqueezy-webhook` | Lemon Squeezy | HMAC signature of the raw body, compared in constant time |
| `play-rtdn` | Google Pub/Sub | A secret in the push URL, compared in constant time; and the message is never trusted: the subscription state is re-read from Google, a refund believed only when Google's list confirms it |
| `play-billing` | A signed-in user | The purchase is verified with Google, and refused if Google says it was made for another account |
| `health` | The daily check | A secret header, constant time |
| `device-sync` | A watch | A hashed device token; rate-limited (429) and capped in entries and days |
| `report-error`, `report-ai` | Anyone, signed out too | Size-capped (16 KB, 4 KB), at most 500 distinct errors a day, no user id stored, keys and emails scrubbed |

Cross-origin requests are allowed from anywhere (`*`). That is safe here:
the functions are authorised by a token in a header, not by cookies, so
another site cannot borrow a visitor's session.

### 3. Money: nothing a stranger does can run up a bill

- An analysis on the owner's keys needs an account, and each account gets
  10 free ones, counted in the database (`reserve_analysis`).
- **A daily spend ceiling** is the circuit breaker for many accounts: $10 a
  day for free trials, $50 for subscribers, measured in the database, with
  analyses still running counted at their worst-case cost so that a burst
  cannot overshoot it. Both are function secrets, changeable without a
  deploy.
- A model added without a price is booked at the worst case, never at zero
  (a unit test enforces a price for every model).

### 4. The browser

- **A strict Content-Security-Policy** (`public/_headers`, tested in
  `e2e/security-headers.spec.ts`): scripts only from the app itself, no
  inline scripts, no `eval`, and the page may connect only to itself,
  Supabase, OpenAI and Google Play. Even if an attacker found a way to inject
  script, it could not send anything anywhere else.
- No raw HTML is ever written into the page (no `dangerouslySetInnerHTML`,
  no `innerHTML`).
- Framing is refused (`frame-ancestors 'none'`, `X-Frame-Options: DENY`),
  HTTPS is enforced (HSTS), and the referrer is trimmed.
- **The sign-in redirect** (`?next=`) accepts only an in-app path (a `/`
  followed by a letter), so `//evil.com` or `/\evil.com` cannot send someone
  off-site after signing in.
- **A person's own OpenAI key** stays on their device, is never synced to the
  server, and is scrubbed from error reports and exports (tests for each).

### 5. Secrets and the supply chain

- **The whole git history was scanned** for OpenAI, Supabase, Google and
  webhook secrets and for private keys. Nothing real: the matches are test
  values (`sk-test-perfectly-good-key`) and a test that generates a
  throwaway key while it runs.
- `.env` files, the keystore and service-account files are not in the
  repository. The Supabase URL and anon key in the built app are public by
  design; the database rules above are what protect the data.
- **Dependencies** (`npm audit`, 2026-11-17):
  - In what ships to users: **2 moderate**, both in `react-router` (an
    open-redirect pattern and a server-rendering issue). Neither applies as
    the app is written: it does no server rendering, and its only redirect
    from user input is the validated `next` above.
  - In the test and build tools only: 5 high and 2 critical, in `vitest` 2
    and `vite`'s development server. They matter on a developer's machine
    running those servers, never in the app people download.

## What to improve, in order

| # | What | Why | Who | Size |
| --- | --- | --- | --- | --- |
| 1 | **Two-factor sign-in on every account that can ship or bill:** GitHub, Supabase, Cloudflare, Google Play Console, Google Cloud, OpenAI (Lemon Squeezy was set aside by the owner on 2026-11-12) | The most likely way this app is ever breached is not the code but a stolen password to one of these. GitHub alone can deploy to production | Owner | 1 hour |
| 2 | **Upgrade the test tools** (`vitest` 2 → 4, `vite` 6 patch) | Clears all 7 high and critical findings | Claude | S |
| 3 | **Upgrade `react-router`** to the fixed version | Clears the 2 moderate findings, before anything ever uses user input in a link | Claude | S–M (a major version) |
| 4 | **Automatic dependency updates** (GitHub's Dependabot, weekly) | So the next advisory arrives as a pull request instead of waiting for a review like this one | Claude, owner approves | S |
| 5 | **Check the sign-in rate limits** in the Supabase dashboard (emails and code attempts per hour) | Code sign-in is only as strong as the limit on guessing codes; the defaults are reasonable, but they are set outside the repository and were not checked here | Owner, with Claude | S |
| 6 | **HSTS for subdomains** (`includeSubDomains`) | Once `www` redirects to the apex over HTTPS (still owed), every subdomain can be held to HTTPS too | Claude | S |
| 7 | **An outside penetration test** before the coaches feature, or before handling another person's data in any new way | A second pair of eyes; sharing data between accounts is where row-level security is easiest to get wrong | Owner | M + C |

## Keeping it true

- Every new table: row-level security on, a policy per action, and a
  contract test that a stranger sees nothing
  (`src/data/__tests__/contract.ts`).
- Every new server function: verify the caller first, read entitlements from
  the database, cap the body size. If it must run without a session, say why
  at the top of the file, as the existing ones do.
- Every new external address the app talks to goes into `connect-src` in
  `public/_headers`, and nowhere else.
- Run `npm audit` and this checklist again before each major release.
