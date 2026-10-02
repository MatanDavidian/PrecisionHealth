# Operations setup — the one-time steps only the owner can do

The code for P0 in `docs/PHASE-1-FINISH.md` is in the repository. These steps
connect it to the accounts it runs in. **Do them in this order** — each one
depends on the one before.

Time: about an hour, mostly waiting on dashboards.

---

## 1. Rotate the OpenAI key (P0.1)

1. platform.openai.com → **API keys** → **Create new secret key**. Copy it.
2. Set it where the functions read it:
   ```bash
   npx supabase secrets set OPENAI_TRIAL_KEY=sk-…new…
   ```
3. Open vimetry.app signed in and analyse one meal — it must work.
4. Back in **API keys**: **delete** the old key — the one that was pasted into
   a chat. If several keys exist and you are unsure which, delete every key
   except the new one.

## 2. Sign-in email for strangers (P0.2)

Supabase's built-in email only reaches members of your Supabase organization.

1. resend.com → sign up → **Domains** → add `vimetry.app` → add the DNS
   records it shows in **Cloudflare → vimetry.app → DNS**. Wait for "Verified".
2. Resend → **API Keys** → create one.
3. Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
   host `smtp.resend.com`, port `465`, user `resend`, password = the API key,
   sender `no-reply@vimetry.app`, name `Vimetry`.
4. Test: open vimetry.app in a private window → **Sign in** → use
   `support@vimetry.app` (it forwards to your Gmail). A code must arrive.

## 3. GitHub: the values CI needs — **before the next push**

github.com/MatanDavidian/PrecisionHealth → **Settings → Secrets and variables
→ Actions**.

**Variables** tab (public values — they are in the website's JavaScript anyway):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | the same value as in `.env.local` |
| `VITE_SUPABASE_ANON_KEY` | the same value as in `.env.local` |

Without these, CI's browser tests have no Supabase project to point at and
the sign-in tests fail.

## 4. The health token

```bash
./scripts/create-health-token.sh
```

It generates the token, sets it as the Supabase function secret, adds it to
`.env.local`, and copies it to the clipboard — it is never printed. Then:
GitHub → **Secrets** tab → **New repository secret** → name `HEALTH_TOKEN` →
paste.

## 5. Migration history (P0.5) — once

Checked on 2026-10-02 with read-only probes: production has 0001–0012 (applied
by hand in the SQL editor) and not 0013. The CLI's own history knows none of
them, so record them:

```bash
./scripts/record-migration-history.sh
```

It asks for the **database** password (Supabase → Project Settings →
Database), shows the history before and after, and asks before changing
anything. Expect 0001–0012 on both sides afterwards and 0013 only under
Local. If the CLI rejects the version names (`0001` rather than a timestamp),
stop there and tell Claude.

## 6. Push, then deploy every function

1. Tell Claude "push" (or push yourself) — the deploy script refuses function
   code that is not on `main`.
2. Run:
   ```bash
   ./scripts/deploy-functions.sh
   ```
   It applies migration 0013, deploys all five functions with the right flags
   — **this is also the `device-sync` deploy owed since 21 Sep** — and ends by
   checking every function answers with the new version.

## 7. The monitoring account

The daily check runs one real analysis through an admin account, so it never
spends a trial and is never refused by the ceiling. On the cheapest model it
costs well under a cent a day.

1. Supabase → **Authentication → Users → Add user → Create new user**:
   email `monitor@vimetry.app`, a long random password, **Auto Confirm User**
   on. (The address never needs to receive mail.)
2. Copy its **User UID**, then in the SQL editor:
   ```sql
   insert into public.app_admins (user_id, note)
   values ('<the UID>', 'daily health check — not a person');
   ```
3. GitHub **Secrets**: `MONITOR_EMAIL` = `monitor@vimetry.app`,
   `MONITOR_PASSWORD` = the password.

## 8. The dead-man's switch

1. healthchecks.io → sign up (free) → **Add Check**: name "Vimetry daily",
   period **1 day**, grace **3 hours**.
2. Copy its **ping URL** → GitHub **Secrets**: `HC_PING_URL`.
3. Its email integration is on by default, to your sign-up address.

## 9. Turn on the email, and run it once

1. github.com → your avatar → **Settings → Notifications → Actions** →
   email, **"Only notify for failed workflows"**.
2. Repository → **Actions → Daily health check → Run workflow**.
3. It should finish green. If it does not, its log says what is wrong — in
   names and counts, never secrets.

## 10. Deploy through CI only (P0.7)

Until now Cloudflare publishes every push to `main` itself, tests or not.

1. Cloudflare → **My Profile → API Tokens → Create Token** → template
   **"Edit Cloudflare Workers"**, or a custom token with **Account →
   Cloudflare Pages → Edit**. GitHub **Secrets**: `CLOUDFLARE_API_TOKEN`.
2. Cloudflare dashboard URL contains your account id
   (`dash.cloudflare.com/<account id>/…`) → GitHub **Secrets**:
   `CLOUDFLARE_ACCOUNT_ID`.
3. Push something small and watch **Actions → CI**: the **deploy** job
   publishes and checks the live site.
4. Only once that works: Cloudflare → **Workers & Pages → precisionhealth →
   Settings → Builds** → turn off **automatic production deployments**. From
   then on, a red build cannot reach production.

## 11. In a week: enforce the security policy

The Content-Security-Policy ships as report-only. If a week of the daily
check and normal use shows no violations, tell Claude to switch it to
enforced — a one-line change in `public/_headers`.
