# Finishing Phase 1

Written 2026-10-02, after a week in which photo analysis was broken in
production for every signed-in user and nobody knew. That week is the best
summary of what is left: the product works; the machinery that keeps it
working, and tells someone when it stops, does not exist yet.

**Done means** (unchanged from `PHASE-1.md`): someone who has never met you can
sign up, understand what happens to their data, connect their Garmin, pay, and
use it — and when something breaks, you hear about it before they do.

Sizes: **S** under half a day · **M** one to two days · **L** three to five.
Owner: **C** = Claude in the repo · **M** = Matan, in an account only he holds.

---

## Where it stands (2026-10-11)

| | |
| --- | --- |
| Product | nutrition (photo, words, manual, repeat, adjust, fill a missed day), week view, insights, Garmin sync, Hebrew; GPT-6.1 Sol and GPT-6 Luna only; installable, opens offline; the sample day is labelled |
| Accounts | sign-in, consent, export, deletion (cancels billing first), data moved in on first sign-in; signed out, the browser is asked to keep the data |
| Legal | Terms and Privacy Policy live (both 2026-10-09: subscription terms, error reports); OpenAI DPA signed; privacy@ and support@ forward |
| Payments | Lemon Squeezy connected in **test mode**, every flow passed end to end on 2026-10-10 (purchase, both allowances, cancel, refund, account deletion). **Live mode deliberately not yet** — owner's decision |
| Tests | 525 unit, 318 browser, 11 server handler suites (every function), DB invariants on Postgres, a race test, a live-site check |
| Operations | CI deploys; migrations tracked (0001–0017); one deploy script; daily health check with email — schema, versions, both spend ceilings, every OpenAI key against every model, browser errors, reported AI answers, payment disputes, payments key expiry |
| Android | Play Billing (server and app), the TWA configuration, listing drafts, screenshots, a reviewer sign-in and sample data — built; waiting on Google's account verification (`docs/ANDROID-APP.md`) |
| Garmin | renamed Vimetry; a Store build with no token; listing and checklist (`docs/garmin/store-listing.md`) — waiting on the owner's developer account |

---

## What is left to finish Phase 1 (2026-10-10)

Done since 2026-10-02: all of P0; the GPT-6 switch; payments (in test mode);
HEIC photos named instead of a spinner; Safari storage; error monitoring;
handler tests for every function.

### Open, in order

| # | What | Who | Note |
| --- | --- | --- | --- |
| 1 | **Android app on the Play Store**, selling through Google Play Billing | M + C | **Code done 2026-10-10** (steps 1–4 and 5's drafts of `docs/ANDROID-APP.md`). Waiting on the owner: Google's verification, then the console setup, the package build, the 14-day closed test |
| 2 | **Publish the Garmin app** | M + C | **Ready to submit 2026-10-10.** Owner: developer account, upload, simulator screenshots, submit (`docs/garmin/store-listing.md`) |
| 3 | **Chargebacks** — handle `dispute_created` / `dispute_resolved` | M + C | **Visible since 2026-10-10:** the webhook logs them and the daily check turns red on any in 30 days. Lemon Squeezy's docs do not describe their contents, so automatic handling waits for a real one. Owner: tick both events on the webhook. Then decide the rule — end access while disputed, as a refund does? |
| 4 | **Logo and home-screen icon** | M + C | Moved up: the Android app and the installable website need icons. A temporary mark will do for the closed test; motion and the accessibility scan stay P3 |
| 5 | **Onboarding for a first-time visitor** | M + C | The sample-day label is done (2026-10-11). The first-visit cards and the signed-in empty state are designed first in Claude Design, then built (section below) |
| 6 | **Contract tests on a local Supabase** | C | Needs the local stack (~2 GB download) — run with the owner around |
| 7 | **Model quality check** on real meal photos | M (+ C script) | GPT-6.1 Sol is the baseline (`docs/ops/model-evaluation.md`). When there are photos, C writes a script that runs them through both models and scores them |
| 8 | **Re-measure the cost per analysis**, update `docs/ops/pricing.md` | C | After a few weeks of real usage, from the ledger — and with Play's 15% in it |
| — | **Go live with payments** | M | When the owner decides: `docs/ops/payments.md` step 4 — copy the product to live, longest key expiry, `set-billing-secrets.sh live` |

### Small things waiting on the owner

- **Support email on receipts:** send a test to support@vimetry.app from an
  address other than the Gmail it forwards to. If it arrives, set it as the
  Lemon Squeezy store's contact email (today it shows the personal Gmail).
- **OpenAI prices:** confirm the GPT-6 prices in the OpenAI dashboard. Ours
  came from third-party trackers (`docs/ops/model-evaluation.md`).
- **HEIC decoding:** decide whether to decode iPhone photos in the browser.
  That needs a 3 MB LGPL decoder and `worker-src blob:` in the CSP; today the
  app names the format and says how to send a JPEG.
- **Older owner tasks:**
  - the Supabase DPA
  - a restore drill
  - the `www` → apex redirect
  - the trademark search
- **Tidy-up (optional):** the test account `davidianmatan+phtest` still holds
  an active test-mode subscription from testing. Refund it, or keep it for
  testing as a subscriber.

**Next (decided 2026-10-10):** the Play Store and the Garmin app, side by side. Week 1 is mostly the owner starting Google's and Garmin's clocks (accounts, verification, testers) while C makes the website installable.

---

## P0 — Before anything else (week 1)

Small, protective, and each one would have prevented something that already
happened or is happening now.

> **Status, 2026-10-02.** The code for P0.3–P0.8 is in the repository and
> tested. What connects it to the live accounts — and P0.1, P0.2 — is a
> one-time checklist for the owner: **`docs/ops/operations-setup.md`**.
>
> | | |
> | --- | --- |
> | P0.1 key rotation, P0.2 SMTP | owner — setup steps 1–2 |
> | P0.3 fake gate | done: absent from production builds; check:live guards it |
> | P0.4 versions + deploy script | done: `x-vimetry-version` on every response; `scripts/deploy-functions.sh` |
> | P0.5 migration tracking | owner, once — setup step 5; then automatic |
> | P0.6 health check | done: `health` function, migration 0013, `check-health.mjs`, daily workflow; owner wires secrets (steps 4, 7–9) |
> | P0.7 CI | done: `.github/workflows/ci.yml`; deploy job waits for the Cloudflare token (step 10) |
> | P0.8 headers | done, CSP report-only; enforce after a clean week (step 11) |

### P0.1 Rotate the OpenAI key · S · M
The key pasted into a chat at the start of the project has never been revoked.
If it is the one Supabase uses, it is live. Create a new key → set it as the
function secret → confirm an analysis works → **delete** the old key in the
OpenAI dashboard.

### P0.2 Custom SMTP for sign-in emails · S · M
Supabase's built-in email only delivers to members of the Supabase
organization, at about two an hour. A stranger asking for a sign-in code gets
"Email address not authorized" — so **today, nobody but you can sign up**, and
your own sign-ins working is exactly what hides it.

Check: Supabase → Authentication → SMTP Settings. If custom SMTP is off, set it
up with Resend (free tier is plenty at launch), sending from
`no-reply@vimetry.app` — Resend gives the DNS records to add in Cloudflare.
Then sign up with an address that is not yours (`support@vimetry.app` works:
it forwards to you) and confirm the code arrives.

### P0.3 Gate fake mode out of production · S · C
`vimetry.app/log?fake=1` swaps in the test estimator for anyone, signed in or
not, and a signed-in user can save its canned numbers into a real account.

Fix: honour `?fake` only when the build sets `VITE_ENABLE_FAKE=1`. Playwright's
build sets it; Cloudflare's does not, so the fake is not even in the
production bundle. `check:live` gains an assertion that the live JavaScript
contains no `fake-vision`.

### P0.4 Version stamps and one deploy script · S · C (then M runs it)
Nobody can say which version of a server function is live — `device-sync` may
still be the old one. And deploying is four commands, one of which silently
breaks the watch if a flag is forgotten.

- Every function answers with an `x-vimetry-version: <commit>` header.
- `scripts/deploy-functions.sh` writes that commit into the bundle, refuses to
  deploy uncommitted function code, applies pending migrations first (P0.5),
  deploys every function with its correct flags (`device-sync` needs
  `--no-verify-jwt`), then calls the health check (P0.6) to confirm.
- **Then run it once** — that is also the `device-sync` deploy that has been
  owed since 21 September.

### P0.5 Migration tracking · S · C + M once
Migrations are pasted into the SQL editor and nothing records which ones
production has. That is how `estimate-food` went live ahead of 0011 and 0012.

Move to the Supabase CLI's own history: `supabase link`, then
`supabase migration repair --status applied` for 0001–0012 (already applied
by hand), after which `supabase db push` applies only what is new, in order,
and `supabase migration list` shows any drift. The deploy script runs it before
any function. The health check's schema test (P0.6) is the second line.

### P0.6 Daily health check, with an email when it fails · M · C + M setup

Planned in full below, because it is the piece that turns "broken for a week"
into "broken until the next morning".

### P0.7 CI · M · C + M setup
No `.github/` folder exists: tests run when someone remembers, and a push to
`main` deploys to production whether they pass or not.

- **On every push and pull request:** typecheck, unit tests, build, browser
  tests, `deno check`, the device-sync harness, and `db:verify` against a
  throwaway Postgres (GitHub's runners have Docker).
- **Deploy only when green.** Turn off Cloudflare Pages' automatic production
  deploy and let CI publish `dist/` with `wrangler pages deploy` after every
  check passes, then run `check:live`. Needs a Cloudflare API token and account
  id as GitHub secrets (M).
- The repository is public, so CI logs are public: no step may print a token,
  an email address or a response body containing either.

### P0.8 Security headers · S · C
`public/_headers` sets caching only. The app keeps health data, and for some
users an OpenAI key, in the browser — a Content-Security-Policy is a cheap
second wall behind React's escaping.

- `Content-Security-Policy`: scripts from self only; connections to self,
  the Supabase project (https and wss) and `api.openai.com` (own-key users);
  fonts and styles from Google Fonts; images from self, `data:` and `blob:`;
  `frame-ancestors 'none'`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, a `Permissions-Policy` denying what the app
  never uses, HSTS from Cloudflare.
- **Ship it as `Content-Security-Policy-Report-Only` for a week first.** A
  wrong policy blanks the site for everyone, and `vite preview` does not apply
  `_headers`, so the local browser suite cannot catch it. `check:live` asserts
  the headers are present.

---

## The daily health check, planned

### What it checks

| Check | How | Would it have caught… |
| --- | --- | --- |
| The site serves `main` and starts | existing `check:live` | a failed or stale deploy |
| No secret and no fake in the bundle | `check:live` (+ P0.3) | a leaked key, the test seam |
| Server functions are the expected version | `x-vimetry-version` vs the last commit touching `supabase/functions` | the owed `device-sync` deploy |
| The database has everything the code calls | `health` function → `health_check()` SQL listing missing functions, tables and allowed outcomes | **the 25 Sep outage** |
| A real analysis works end to end | sign in as a monitoring account, analyse "one banana" through `estimate-food` | a revoked key, a retired model, a broken prompt, the outage |
| Spend and errors in the last 24 hours | `health` returns aggregate counts only: spend vs the daily ceiling, `PROVIDER_ERROR` and `UNREADABLE` counts | a quietly failing provider, a cost spike |
| Sign-in email reaches strangers | **not automated** — a function cannot read Supabase's auth settings, and a real test would send mail daily; checked once by hand (operations-setup step 2) | P0.2 |

### The parts

1. **A `health` function.** Not public: it requires an `x-health-token`
   header matching a function secret, compared in constant time. Returns only
   booleans, counts and names of missing objects — never a user, an email or a
   record.
2. **Migration 0013, `health_check()`**: a service-role-only SQL function that
   lists any expected object that does not exist. The expected list lives in
   the repository next to the code that needs it.
3. **A monitoring account**, separate from the test account, added to
   `app_admins` so the daily analysis spends no trial and is not refused by
   the ceiling. On the cheapest model with a one-line text prompt, it costs
   well under a cent a day.
4. **A scheduled GitHub Actions workflow**, 07:00 Israel time daily, plus a
   "run now" button: runs `check:live` and `scripts/check-health.mjs`.
5. **The email.** GitHub emails the owner when a scheduled workflow fails
   (Settings → Notifications → Actions → failed workflows only) — no mail
   service to build.
6. **A dead-man's switch.** GitHub disables scheduled workflows in public
   repositories after 60 days without a commit, and a check that silently
   stops running is the same failure as no check. On success the job pings
   healthchecks.io (free); if a day passes without a ping, healthchecks.io
   emails you.

Secrets (GitHub, M): `HEALTH_TOKEN`, `MONITOR_EMAIL`, `MONITOR_PASSWORD`,
`HC_PING_URL`. Daily is enough at this scale; hourly costs the same and can
come later.

---

## P1 — The model upgrade (week 2)

> **Status 2026-10-09: switched, not yet evaluated.** On the owner's decision,
> the server offers only **GPT-6.1 Sol** (the default) and **GPT-6 Luna**.
> Done:
> - the gpt-5.6 models are gone
> - the sol sub-allowance and the "switched to balanced" notice are gone
> - every model the server runs has a price, with a test
>
> Still to do:
> - the evaluation on real meal photos, with GPT-6.1 Sol as the baseline
>   (`docs/ops/model-evaluation.md`)
> - re-measuring the cost per analysis
> - updating pricing
>
> The text below is the plan as it was written.

The app runs on the **gpt-5.6** family: terra by default, sol metered as the
"most accurate" tier, luna offered as "Fastest" in the trial's model picker. On 22 September OpenAI released **GPT-6 Sol**
at $2 / $10 per million tokens (input/output) and **GPT-6 Luna** at
$0.10 / $0.50. There is no GPT-6 Terra and no GPT-6.1; GPT-6 Astra exists but
is limited-access.

GPT-6 Sol is now **cheaper than the terra we default to** ($2 / $12). So the
upgrade is likely better *and* cheaper — but "likely" is not "measured", and a
model that reads plates differently changes every number a user sees.

1. **Confirm the exact API model ids** from `/v1/models` on the master key.
   (The prices above come from news coverage, not OpenAI's own page.)
2. **Add them to the price table first** — and a unit test that every model
   the server may call has a price. An unpriced model is invisible to the
   spend ceiling.
3. **Evaluate before switching** (`scripts/eval-models.mjs`, M): fifteen real
   plates, ideally with weighed portions, through gpt-5.6-terra, GPT-6 Sol and
   GPT-6 Luna with the production prompt. Compare calorie error, foods found,
   latency, cost, and how often each asks a question. Include a non-food photo
   and a crowded plate.
4. **Then simplify.** If GPT-6 Sol wins, the "accurate but expensive" tier
   stops existing: one default model, the sol sub-allowance and the "switched
   to balanced" notice go, and the pricing arithmetic gets better. Luna may be
   enough for text descriptions and week insights.
5. Make sure own-key users see the new models in their picker.
6. Re-measure cost per analysis and update `docs/ops/pricing.md` before
   payments go live — the allowance was sized on the old prices.

The daily check (P0.6) is what will tell us when OpenAI retires gpt-5.6.

---

## P1 — Edge scenarios

Thought through rather than waited for. Most of the serious ones are already
handled; the gaps are marked.

| Scenario | Today | Action | Priority |
| --- | --- | --- | --- |
| A stranger signs up | **fails** — default email cannot reach them | P0.2 | P0 |
| Analysis server or OpenAI down | slot released, photo kept, retry offered | — | ✓ |
| Trial runs out mid-analysis | full stop with two ways forward | — | ✓ |
| Two devices edit one meal | conflict shown, not silently resolved | — | ✓ |
| A slow request settles after its slot was retaken | counted once (0012) | — | ✓ |
| Watch unsynced for a week | fixed, **deploy owed** | P0.4 | P0 |
| A real meal logged on a filled day | replaces the estimate | — | ✓ |
| **Account deleted with an active subscription** | ~~billing would continue~~ **done 2026-10-09**: cancelled first, deletion refused if that fails | — | P1 (payments) |
| **Refund or chargeback** | **refund done 2026-10-09**, tested live in test mode 2026-10-10: a full refund ends access and cancels billing. Chargebacks: Lemon Squeezy sends `dispute_created` / `dispute_resolved`, not handled yet | open item 1 above | P1 (payments) |
| **A subscriber hits the daily spend ceiling** | **done 2026-10-09**: their own ceiling and their own message | — | P1 (payments) |
| **Safari clears a signed-out browser's data** | **done 2026-10-09**: the first local save asks the browser to keep it (once), and Settings says whether it agreed, with the sure ways — sign in, Home Screen, export | — | P1 |
| **iPhone photo picked on Android or desktop (HEIC)** | **done 2026-10-09**: recognised by its bytes and named, with how to send a JPEG (it used to spin for ever) | decoding it in the browser needs a 3 MB LGPL decoder and `worker-src blob:` in the CSP — owner's call | P1 |
| **Israel's clocks go back, 25 Oct** | ✅ tested on both real dates; the browser suite passes in those weeks (`E2E_TODAY`) | — | done 2026-10-09 |
| Offline while signed in | the save fails with a banner (D16, online-first) | accept for Phase 1; revisit with real usage | P2 |
| Session expires mid-analysis | "sign in again" | check the photo survives | P2 |
| Years of history exported | paged reads; size untested | a bounded test at ~50k records | P2 |
| Many free accounts from one person | the daily ceiling caps total cost | watch it in the daily counts; limit later if it happens | P3 |
| Under-16s | the terms say no; no age gate | accept for Phase 1 | P3 |

---

## P2 — The rest of Phase 1

### Payments · L · C + M
> **Built 2026-10-09:**
> - checkout and portal (`billing`)
> - the signed webhook
> - `subscriptions`
> - 100 photo and 200 written analyses a month
> - cancel to the end of the month; refund ends access at once
> - deletion cancels billing
> - tests at every layer
>
> Setup: `docs/ops/payments.md`.

Once Lemon Squeezy approves: a webhook with signature verification and
duplicate-safe handling, a `subscriptions` table under row-level security, the
monthly allowance on the existing reservation (`p_period_start` already
exists for it), cancel and refund revoking access, a "manage subscription"
link, and the balance and reset date in the app. **Tests are designed in, not
added after** (see below). No public checkout link before this is live.

### Error monitoring · M · C
> **Built 2026-10-09, the minimal option:**
> - What is reported: uncaught errors, unhandled rejections, and screens that
>   fail to render (a fallback replaces the blank page).
> - Where it goes: the `report-error` function, into `client_errors`
>   (migration 0015). One counted row per error per day, at most 500 a day,
>   kept 90 days.
> - What is removed: emails, keys, tokens, photos and query strings, on both
>   sides.
> - Alerting: the daily check prints the top three and turns red at 25 a day.
> - The Privacy Policy (2026-10-09) says so.
> - CSP violations (added 2026-10-17): whatever the policy blocks is reported
>   as an error, by origin and rule only; browser extensions' are ignored.

Nothing reports an exception today. Two options:

- **Our own, minimal (recommended first):** a `report-error` function writing
  message, stack, route, version and browser to a `client_errors` table —
  no user id, no health data — with counts in the daily email. No new data
  processor, so nothing changes in the Privacy Policy.
- **Sentry:** better grouping and source maps, an EU data region and a free
  tier — but it is another processor to name in the policy, and it must be
  configured to send nothing personal.

The CSP report endpoint (P0.8) can post to the same function.

### Onboarding for a first-time visitor · M · C (design via Claude Design)
Today a stranger lands on a sample day with no explanation.

- Three short first-visit cards: what Vimetry is; where your data lives; "look
  around with sample data" or "sign in for 10 free analyses".
- ~~A visible **Sample data** label wherever the sample day is shown (Q5).~~
  Done 2026-10-11: `SampleDayLabel` on Today and Nutrition.
- After first sign-in, an empty state that says what to do: photograph your
  next meal; connect a Garmin.

### Publishing the Garmin app · M work, weeks of calendar · M + C
> **Ready to submit, 2026-10-10:**
> - the app is renamed Vimetry (it was "Garmin Data POC")
> - `garmin/build.sh --store` builds the Store package with no device token
>   and the production address
> - the listing, the setup steps and the owner's checklist are in
>   `docs/garmin/store-listing.md`
>
> The UUID was made permanent on 2026-09-06. Left for the owner: the Connect
> IQ developer account, the upload, the simulator screenshots, and the
> submission.

The code is ready: the watch reads its server address and token from a
settings page before the compiled-in values, so a Store build needs no code
change. Remaining:

- Regenerate the manifest UUID once, **before** the first upload, and never
  again.
- A Connect IQ developer account; listing text, screenshots, the supported
  devices (FR265 proven on hardware, others in the simulator), the privacy
  policy URL (now exists).
- The pairing flow for strangers: "Create a token" in the web app → copy →
  Garmin Connect app → Vimetry settings → paste. A short code can replace
  pasting later.
- Submit early: review takes calendar time nobody controls.

### Smaller owner tasks
- **Supabase DPA** — the Privacy Policy names Supabase as a processor; sign it
  from the dashboard, as with OpenAI's.
- **A restore drill** — confirm what your Supabase plan backs up, and restore
  once into a scratch project.
- ~~**Delete one throwaway account**~~ — done 2026-10-10 (`davidianmatan+phdelete`,
  with a test subscription, which was cancelled first).
- The `www` → apex redirect.

---

## P3 — Polish: design, logo, motion, sound

| Item | Recommendation |
| --- | --- |
| **Logo** | Needed in five places now: Lemon Squeezy store, Garmin listing and launcher icon, favicon, home-screen icon, emails. Today it is an orange dot. Explore directions in the existing Claude Design canvas, then either finish one there or hand the chosen direction to a designer for a clean vector. It must read at 16 px and on a round watch face, and be checked alongside the trademark search for the name. |
| **Home-screen app (PWA)** | ✅ **Done 2026-10-10:** manifest, icons, and a service worker that opens the app offline (app files only, never data). |
| **Design pass** | First visit, empty states and the Log screen, in Claude Design: the screens a stranger sees in their first minute. |
| **Motion** | Purposeful and short (150–250 ms): totals counting to their new value after a save, estimate rows arriving in turn, week bars growing, the striped estimate filling in. Everything off under `prefers-reduced-motion`. Nothing decorative. |
| **Sound** | **No.** People log meals in restaurants, at work and in bed, and a health app that makes noise announces itself. A short vibration on save on Android (iOS does not support it from the web) gives the same confirmation silently. |
| **Accessibility** | An automated axe scan of the main screens in the browser suite; check the muted grey text against the cream background for contrast. |

---

## Tests to add

| Priority | Test | Why |
| --- | --- | --- |
| High | ✅ **Handler test for `estimate-food`** (`supabase/test/estimate-food.ts`, 45 checks, 2026-10-09) with a fake PostgREST and a fake OpenAI, like the device-sync harness | 600 lines of money-critical logic — reservation, ceiling, free follow-ups, model downgrade — with no direct test |
| High | ✅ **Deep health check** — P0.6, and since 2026-10-10 every OpenAI key against every model | Would have caught the outage the next morning |
| High | ✅ **Payment flow**, both sellers: signatures, redeliveries, out-of-order events, refunds, deletion cancelling billing, e2e with faked stores (`lemonsqueezy-webhook.ts`, `billing.ts`, `play-billing.ts`, `play-rtdn.ts`, `subscription.spec.ts`, `android-billing.spec.ts`) | The first code where a bug costs a customer money |
| High | ✅ **Every callable model has a price** (`modelRates.test.ts`) | An unpriced model is invisible to the spend ceiling |
| Medium | ✅ **DST and travel** (`clockChanges.test.ts`, 2026-10-09; found and fixed an ambiguous-hour bug): day keys and the week across 25 Oct and the spring change | The clocks change in three weeks |
| Medium | ✅ Handler tests for `delete-account` and `issue-device-token` (2026-10-09/10) | Deletion is irreversible |
| Medium | Contract tests against a local Supabase instead of production | Stops growing the test account (2,066 meals so far), and lets CI run them without production credentials |
| Medium | ✅ A HEIC photo (`heic-photo.spec.ts`), a double-tapped Save (`double-save.spec.ts`); a non-food photo (needs a real model — part of the evaluation) | Edge scenarios above |
| Low | Accessibility scan (axe); watch sync logic beyond the existing simulator probe | Useful, not urgent |

---

## Sequencing

The plan as written on 2026-10-02 ran week by week. By 2026-10-11, P0, the
model upgrade, payments (test mode), error monitoring, storage persistence,
HEIC, the PWA, and the Android and Garmin code are done. What remains is
mostly other people's clocks:

```
Now, in parallel (calendar time)
         Google: identity verification → console setup → package → 14-day closed test → review
         Garmin: developer account → upload → review

Owner decisions that unblock code
         Google Play policy wording → C applies it (version bump)
         chargeback rule → C automates disputes once a real one is seen
         going live with payments → step 4 of docs/ops/payments.md

When designed in Claude Design
         onboarding cards and the signed-in empty state · the logo → icons everywhere

Later
         model evaluation on real photos (script ready) · cost re-measure → pricing
         contract tests on a local Supabase · motion · accessibility pass
```

## Decisions needed

1. ~~**Error monitoring**~~ — decided: our own table (built 2026-10-09).
2. ~~**Deploys through CI**~~ — decided: CI only, Cloudflare's own deploys off (2026-10-03).
3. **The default model** — GPT-6.1 Sol for now (2026-10-09); confirm after the evaluation on real photos.
4. **Logo** — finish it in Claude Design, or hand a chosen direction to a
   designer.
5. **Offline logging** — accept online-first (D16) for Phase 1, or build a
   queue now.

---

## Handover — next steps (2026-10-17)

**State:**
- **Live and green:** everything is pushed and deployed. The 10-day deploy
  gap is closed: a time-zone flaw in three tests had failed CI since 10 Oct,
  and CI now runs the unit tests in two extreme zones so it cannot recur.
- **Cloudflare Web Analytics is off.** Its injected script was blocked by
  our CSP; the policy promises no analytics, so it stays off.
  Cloudflare's server-side traffic analytics are unaffected.
- **Google account type:** a support ticket was sent on 2026-10-17 and is
  pending. Google's AI assistant answered that a Personal account may
  publish a non-medical nutrition and fitness app, because organisations
  are required only for medical and human-subjects-research apps. Wait
  for the human answer before uploading anything.

**Done — before the first Play upload** (Google's own requirements,
confirmed by its support assistant; built 2026-10-17, tested in
`e2e/play-readiness.spec.ts`; pushed and deployed the same day):
1. **Privacy Policy and Terms links in Settings**, on every tab, with
   "Vimetry is not a medical device" and the account-deletion link.
2. **The medical disclaimer** under the week's suggestions: "General
   suggestions, not medical advice — for medical questions, talk to a
   healthcare professional."
3. **"Report this answer"** under every AI estimate (including a refusal)
   and under the week's insights. The report holds only the reason, an
   optional note (scrubbed), the model and the build — not the meal, the
   photo, the answer or the account. It is stored in `ai_reports`
   (migration 0017, function `report-ai`), at most 500 a day, kept a year.
   The daily health check counts them and turns red on any offensive or
   harmful one: read them in Supabase → Table editor → `ai_reports`.
4. **No own-OpenAI-key option inside the Android app** (`?source=twa`):
   signed out, it offers sign-in for the free analyses; with the trial
   spent, the plan. The website is unchanged.
5. **Listing wording:** the disclaimer is now in Google's words ("does not
   diagnose, treat, cure or prevent … not medical advice"), and the
   week's suggestions and in-app reporting are described
   (`docs/android/store-listing.md`).

**Next for Claude — when the owner approves:**
- the Google Play wording for the Privacy Policy and Terms
  (`docs/android/store-listing.md`, open work 3), together with fixing the
  Terms' "does not … advise", which should say no *medical* advice. One
  version bump, one re-consent. (Reporting an AI answer is already in the
  Privacy Policy, added 2026-10-17 without a bump.)
- `public/.well-known/assetlinks.json`, once the first Play upload exists
  (`android/README.md`).

**Next for the owner:**
1. **Google:** wait for the ticket's answer.
   - If it confirms Personal: carry on.
   - If it says Organisation: register a business, get a D-U-N-S number,
     open an Organisation account (`docs/ANDROID-APP.md`, step 0).
2. **Testers:** recruit 14–15 people with Android phones.
3. **Garmin:** create the Connect IQ developer account, then run
   `garmin/build.sh --store`, upload, take simulator screenshots, and
   submit (`docs/garmin/store-listing.md`).
4. **Play Console, once the answer is in and verification is done:**
   - payments profile
   - product `vimetry_monthly`
   - service account (`GOOGLE_PLAY_SERVICE_ACCOUNT`)
   - Pub/Sub push to `play-rtdn?token=…` (`GOOGLE_PLAY_RTDN_TOKEN`)
   - (`docs/ANDROID-APP.md`, step 4)
5. **Build the Android package** (`android/README.md`): internal testing,
   then the 14-day closed test.
6. **Read and approve the drafts** in `docs/android/store-listing.md`.
7. **A real photo-and-estimate screenshot**, taken on a phone.
8. **Unchanged, when ready:**
   - go live with payments (`docs/ops/payments.md`, step 4)
   - the support email on Lemon Squeezy receipts
   - confirm the GPT-6 prices in OpenAI
   - the logo and onboarding designs
   - the Supabase DPA, a restore drill, the `www` redirect, the trademark
     search
