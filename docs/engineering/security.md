# Security

**One line:** Vimetry is safe to use for what it is today. People's data is
walled off per account by the database itself, nothing that costs money can
be triggered by a stranger, and no secret has ever been committed. Seven
improvements are listed at the end, three done the same day; none is
urgent, and the most important is the owner's own accounts. The code, its
libraries and its history are now scanned on every push.

Reviewed 2026-11-17, against the code at `e32795d`. Not a penetration test:
a reading of every table rule, every server function and the browser's
defences, a search of the code for the patterns static scanners look for
(requests to user-chosen addresses, SQL built from strings, redirects,
cross-window messages, weak randomness: none found), plus a scan of the
dependencies and of the whole git history. Since then the same checks run
automatically ("Scanning", below).

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
- **Dependencies** (2026-11-17, after the upgrades the review led to):
  - In what ships to users: **none known.** The review found 2 moderate
    advisories in `react-router` 6; it is now on 7.18.5.
  - In the server functions (`deno audit`): none known. One function
    imported its library from a third-party CDN (`esm.sh`) while the rest use
    JSR with a lockfile; it now uses JSR too.
  - In the test and build tools, which never ship: no critical (the review
    found 2, cleared by `vitest` 4 and `vite` 6.4.6). 5 high remain, all one
    advisory in `picomatch` (a slow regular expression in file matching) that
    has no fixed release yet; Dependabot will offer it when there is one.

## Scanning

Run by `.github/workflows/security.yml` on every push and pull request, and
every Monday, since advisories appear for libraries that have not changed.
A failure turns the workflow red and GitHub emails the owner. It does not
block a deploy: a new advisory should not hold back an unrelated fix.

| Job | Checks | Fails on |
| --- | --- | --- |
| Libraries | `npm audit` on what ships; `npm audit` on the tools; `deno audit` on the server functions | Anything in what ships; critical in the tools; anything in the functions |
| Our code (CodeQL) | GitHub's static analysis of all the TypeScript, app and functions, with the extended security queries: injection, unsafe redirects, weak crypto, leaked data | Findings appear under the repository's Security tab |
| Secrets (Gitleaks) | Every commit in the history, for keys and tokens; the log is redacted | Any match. One test file that builds a throwaway key is allowed in `.gitleaks.toml`, and nothing else |
| New libraries (pull requests only) | What a pull request adds, against GitHub's advisory database | Moderate or worse |

**Dependabot** (`.github/dependabot.yml`) opens pull requests for library
and GitHub Actions updates every Monday, minor and patch together. Each runs
the full CI; one with every check green is safe to merge.

**When it fails:** the job's log names the library or the line. For a
library: upgrade it, or, when no fix exists yet and it does not ship (as
`picomatch` today), note it here and lower the bar for that job only until a
release arrives. For a secret: rotate it first, then remove it from the code;
removing it from history comes last and does not undo the exposure.

## What to improve, in order

| # | What | Why | Who | Size |
| --- | --- | --- | --- | --- |
| 1 | **Two-factor sign-in on every account that can ship or bill:** GitHub, Supabase, Cloudflare, Google Play Console, Google Cloud, OpenAI (Lemon Squeezy was set aside by the owner on 2026-11-12) | The most likely way this app is ever breached is not the code but a stolen password to one of these. GitHub alone can deploy to production | Owner | 1 hour |
| 2 | ~~**Upgrade the test tools**~~ **Done 2026-11-17:** `vitest` 4, `vite` 6.4.6 | Cleared both critical findings | Claude | S |
| 3 | ~~**Upgrade `react-router`**~~ **Done 2026-11-17:** 7.18.5 | Cleared the 2 moderate findings in what ships | Claude | S–M |
| 4 | ~~**Automatic scanning and updates**~~ **Done 2026-11-17:** see "Scanning" above. Still the owner's: turn on **Dependabot alerts** and **secret scanning with push protection** under Settings → Code security (free for a public repository), so a security fix opens at once and a key is refused before it is ever pushed | So the next advisory arrives by itself instead of waiting for a review like this one | Claude, then owner | S |
| 5 | **Check the sign-in rate limits** in the Supabase dashboard (emails and code attempts per hour) | Code sign-in is only as strong as the limit on guessing codes; the defaults are reasonable, but they are set outside the repository and were not checked here | Owner, with Claude | S |
| 6 | **HSTS for subdomains** (`includeSubDomains`) | Once `www` redirects to the apex over HTTPS (still owed), every subdomain can be held to HTTPS too | Claude | S |
| 7 | **An outside penetration test** before the coaches feature, or before handling another person's data in any new way | A second pair of eyes; sharing data between accounts is where row-level security is easiest to get wrong | Owner | M + C |

## Still open (set aside 2026-11-21, for later)

The owner has no time for these now. None is urgent; each is a loose end of
the 2026-11-17 review.

1. **Confirm the first run of the scans.** The `Security` workflow has not
   run yet: it starts with the next push. Gitleaks may raise a false alarm
   on that first run. One test file that builds a throwaway key
   (`supabase/test/_stub.ts`) is allowed in `.gitleaks.toml` in advance, but
   that could not be checked locally. If something else is flagged, read
   the redacted log: a test value goes into `.gitleaks.toml` by its exact
   path; a real key is rotated first, then removed. CodeQL's findings, if
   any, are under the repository's Security tab. (Claude, after the push.)
2. **The two GitHub settings** (#4 above): repository → Settings → Code
   security → **Dependabot alerts** and **Secret scanning with push
   protection**. Free for a public repository. With them on, a security fix
   arrives as a pull request at once, and a pasted key is refused before it
   is ever pushed. (Owner, a few minutes.)
3. **A static scan run locally was not done.** Installing Semgrep and
   Gitleaks on the owner's machine needed a permission that was not given,
   and it was not worked around. The same patterns were searched for by
   hand instead (see the top of this page): nothing found beyond the CDN
   import, since fixed. Once item 1 is green, CodeQL and Gitleaks in CI
   cover this, and a local run is optional. (Claude, only if the owner
   allows the install.)

## Keeping it true

- Every new table: row-level security on, a policy per action, and a
  contract test that a stranger sees nothing
  (`src/data/__tests__/contract.ts`).
- Every new server function: verify the caller first, read entitlements from
  the database, cap the body size. If it must run without a session, say why
  at the top of the file, as the existing ones do.
- Every new external address the app talks to goes into `connect-src` in
  `public/_headers`, and nowhere else.
- The scans above run by themselves; read this checklist again before each
  major release.
