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

## 2. Sign-in email for strangers (P0.2) — **done 2026-10-03**

Custom SMTP was already on, through **Brevo** (EU, France). Finished on
2026-10-03: `vimetry.app` authenticated in Brevo (DKIM, DMARC `p=none`, its
records added to Cloudflare automatically — the single SPF record untouched);
sender **Vimetry <no-reply@vimetry.app>** (a Cloudflare forwarding rule lets
it receive Brevo's verification and any replies); the Magic Link and Confirm
signup templates carry the code (`{{ .Token }}`) as well as the link.

**Known and accepted:** Brevo adds a List-Unsubscribe header to every
transactional email, and only its Enterprise plan can remove it. A user who
clicks "unsubscribe" may stop receiving sign-in codes — if anyone reports
that, remove them from Brevo's blocked/unsubscribed transactional contacts.
Resend or Postmark avoid this, at the cost of redoing the DNS setup.

Also accepted (owner's decision, 2026-10-03): Brevo **tracks opens and
clicks** on transactional email and does not let a free account turn it off
— sign-in links go through its `sendibt2.com` redirect. The Privacy Policy
(2026-10-03.2) says so. If that ever needs to change: ask Brevo support to
disable tracking, or move to Resend (tracking off unless enabled).

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

Checked on 2026-10-02 with read-only probes: production has 0001–0013, all
applied by hand in the SQL editor. The CLI's own history knows none of them,
so record them:

```bash
./scripts/record-migration-history.sh
```

It asks for the **database** password (Supabase → Project Settings →
Database), shows the history before and after, and asks before changing
anything. Expect 0001–0013 on both sides afterwards, nothing pending. If the CLI rejects the version names (`0001` rather than a timestamp),
stop there and tell Claude.

## 6. Push, then deploy every function

1. Tell Claude "push" (or push yourself) — the deploy script refuses function
   code that is not on `main`.
2. Run:
   ```bash
   ./scripts/deploy-functions.sh
   ```
   It applies any pending migrations, deploys every function with the right flags
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

## 11. Enforce the security policy — **done 2026-10-09**

The Content-Security-Policy is enforced in `public/_headers`; the e2e
security-headers tests run the app under it.
