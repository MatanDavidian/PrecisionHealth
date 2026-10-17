# Android app on Google Play — roadmap

Decided 2026-10-10:
- Vimetry goes to the **Play Store** as an Android app.
- Inside that app, it sells the subscription through **Google Play Billing**:
  a second payment system beside Lemon Squeezy, kept in sync on one account.
- The Play Store and the Garmin app are the **next two Phase 1 steps**
  (`docs/PHASE-1-FINISH.md`).

Sizes: **S** under half a day · **M** one to two days · **L** three to five.
Owner: **C** = Claude in the repo · **M** = Matan, in an account only he holds.

---

## The shape of it

**One web app, wrapped.** The Android app is a Trusted Web Activity (TWA):
Chrome showing vimetry.app full-screen, with no browser bar, under the app's
own name and icon. It is built with Google's Bubblewrap.
- There is no second codebase. A website deploy updates the app too, with no
  store review for ordinary changes.
- Play Billing works inside a TWA through two browser APIs:
  - the **Digital Goods API** lists purchases
  - the **Payment Request API** runs the purchase, with Google Play as the
    payment method

  Enabled with Bubblewrap's `playBilling` feature; requires Chrome 101 or
  later on the phone.
  Source: developer.chrome.com → Trusted Web Activity → "Receive payments
  via Google Play Billing".

**One subscription per account, from either store.** The account is what
pays, not the device:
- Someone who subscribed on the website signs in to the Android app and has
  their plan there.
- Someone who subscribed on Android signs in on the website and has it there
  too.

The allowances, the rules (cancel → end of month, refund → at once, delete →
billing stops) and the screens stay the same; only who sells it differs.

**Who sells where:**

| Where the person is | Subscribe button | Manage button |
| --- | --- | --- |
| Android app (TWA) | Google Play Billing | Google Play's subscription page |
| Website, any browser | Lemon Squeezy | Lemon Squeezy portal, or Google Play's page if the plan came from Play |

Play's payments policy is the reason for that split: digital subscriptions
bought inside a Play app go through Play Billing. The app must therefore
never show a Lemon Squeezy checkout inside the TWA. Check the policy again at
step 4 below, because it has been changing (court rulings, the user-choice
billing programmes).

**Money.** Google takes **15%** on subscriptions and handles sales tax and
VAT. At $8.99 that leaves about $7.64, against about $7.99 through Lemon
Squeezy. The allowance stays affordable (`docs/ops/payments.md`). Prices per
country are set in the Play Console; keep the US price at $8.99.

---

## Steps

### 0. Start the clocks now · M · calendar

Google's checks take days to weeks and run while the code is written.

- **Play Console developer account:** play.google.com/console, $25 once,
  then identity verification, which takes a few days.
  - Choose *personal* or *organisation*. An organisation account needs a
    D-U-N-S number. A personal account must run a **closed test with at
    least 12 testers for 14 days in a row** before it may publish
    (re-check both numbers at signup).
- **A Google payments (merchant) profile** linked to the Play Console. This
  is what lets the app sell anything.
- **Find 12 testers with Android phones.** Friends and family count. Each
  needs a Google account.

> **Open question, 2026-10-17: personal or organisation account?**
>
> The account was created as **Personal** (2026-10-10). Google's
> requirements say organisations must register for "Health apps, such as
> Medical apps and Human Subjects Research apps", and a Google email warns
> that health apps are not permitted on Personal accounts.
>
> Vimetry tracks nutrition and activity. It is not medical and not
> research, but Google's health declaration counts "Nutrition and weight
> management" and "Activity and fitness" as health categories.
>
> The plan:
> 1. Ask Play support in writing whether a Personal account may publish it.
> 2. Meanwhile, start a **D-U-N-S number** (free, slow), which an
>    Organisation account needs. It requires a registered business.
>
> The code does not depend on the answer.

### 1. Make vimetry.app installable (a PWA) · M · C — built 2026-10-10

> **Built:**
> - `public/manifest.webmanifest`
> - icons from `scripts/make-icons.mjs`, a stand-in mark until the logo
>   exists
> - `public/sw.js`: pages network-first with an offline copy; the build's
>   scripts precached. Supabase and OpenAI are never touched.
> - proved by `e2e/installable.spec.ts`
>
> **Found on the way, for step 4:** `Permissions-Policy: payment=()` in
> `public/_headers` blocks the Payment Request API that Play Billing uses.
> It must become `payment=(self)` when billing is built.


Worth doing on its own: Chrome and Safari can then "Add to Home screen"
today. On iPhone that also stops Safari clearing a signed-out person's data.

- `manifest.webmanifest`: name, short name, start URL, colours, display
  `standalone`, icons.
- Icons: 192 and 512 px, maskable versions, and the 512 px Play Store
  icon. **This needs the logo**, so Phase 1 item "Logo, home-screen icon"
  moves up. A temporary mark will do for the closed test.
- A service worker. It caches the app shell so the app opens offline and
  meets Chrome's install criteria. It does not cache data: the app stays
  online-first (D16).
- CSP: allow the manifest and the service worker. Test under the enforced
  policy, as `e2e/security-headers.spec.ts` does.
- Tests: the manifest is valid, the app is installable (Lighthouse's PWA
  check), and it opens offline to a clear "you're offline" screen.

### 2. The Android package · S · C + M

- Bubblewrap `init` from the manifest:
  - package name `app.vimetry` (permanent once uploaded — decide carefully)
  - `playBilling` enabled
- **Signing:** use Play App Signing. Google holds the app key; we keep only
  the upload key. Losing the upload key is recoverable; losing an app key is
  not.
- `/.well-known/assetlinks.json` on vimetry.app, so Android trusts that the
  app and the site belong together. Without it the TWA shows a browser bar.
  Served from `public/.well-known/` (check Cloudflare serves the dot
  folder, and its content type).
- Build the AAB in CI next to the website, or by hand to start with. The
  keystore never goes in the repo.

### 3. Sign-in that a Google reviewer can use · S · C — built 2026-10-10

> **Built:** on the sign-in card, the link "App reviewer? Sign in with a
> password" (`signInWithPassword` in `src/data/session.ts`,
> `e2e/reviewer-signin.spec.ts`). It is on screen rather than behind a URL,
> because the Android app has no address bar.
>
> **Still to do:**
> - **Owner:** Supabase → Authentication → Add user: `review@vimetry.app`,
>   a long random password, Auto Confirm. The password goes in the Play
>   Console's App access section, and nowhere else.
> - **C:** a script that fills that account with a sample week.


Reviewers need a working login, and they cannot read our email codes.
- A reviewer account (`review@vimetry.app`) with a password.
- A password sign-in path that only that account can use. The rest of the
  world keeps email codes.
- The account holds a realistic sample week, and **no real person's data**.

### 4. Google Play Billing · L (5–7 days) · C, with M for the console parts — code built 2026-10-10

> **Built and tested against a fake Google; waiting on the consoles.**
>
> **Server:**
> - migration 0016 (`provider`, `linked_purchase_token`)
> - `_shared/playState.ts`, `_shared/googlePlay.ts`,
>   `_shared/playSubscriptions.ts`
> - `play-billing` and `play-rtdn`
> - Play cancellation in `delete-account`, and Play's own page in `billing`
>
> **App:** `src/data/playBilling.ts`.
> - Detects the Android app by its start URL `/?source=twa`.
> - Subscribe runs Play's sheet, at Play's local price.
> - On every start it reports any purchase the server was not told about.
> - Inside the app, Lemon Squeezy is never offered or linked.
> - `Permissions-Policy` now allows `payment=(self)`.
>
> **Tests:** `supabase/test/play-billing.ts`, `play-rtdn.ts`, Play cases in
> `delete-account.ts` and `billing.ts`, `src/data/__tests__/playState.test.ts`,
> SQL checks for 0016, `e2e/android-billing.spec.ts`.
>
> **One difference from the plan:** inside a TWA, Play cannot carry our
> account id, so a purchase is bound to the first account that verifies it
> (`play-billing`, signed in), and refused to any other.
>
> **Owner, when the console is ready:**
> - Create the product `vimetry_monthly`.
> - Create the service account. Its JSON key goes in the
>   `GOOGLE_PLAY_SERVICE_ACCOUNT` secret.
> - Create the Pub/Sub topic, with a push subscription to
>   `…/functions/v1/play-rtdn?token=<GOOGLE_PLAY_RTDN_TOKEN>`.
> - Then run `./scripts/deploy-functions.sh`. It applies 0016 and deploys
>   the two new functions.


**Owner, in the consoles:**
- Play Console → Monetise → Subscriptions:
  - product `vimetry_monthly`
  - base plan: monthly auto-renewing at $8.99, local prices from that
  - grace period on
  - account hold on
- Google Cloud project: a service account with access to the Play Developer
  API (invited in Play Console → Users and permissions). Its key becomes a
  Supabase secret.
- Real-time developer notifications (RTDN): a Pub/Sub topic, with an
  authenticated push subscription to our new webhook.
- License testers: their purchases are free and renew every few minutes,
  which is how renewal and expiry get tested.

**Code:**
- Migration: `subscriptions.provider` (`lemonsqueezy` | `google_play`) and
  the fields Play needs:
  - purchase token, as the id
  - `linkedPurchaseToken`, for a resubscribe or plan change
  - expiry time
  - acknowledged

  Entitlement keeps one rule set. Play states map onto ours:

  | Play state | Our status |
  | --- | --- |
  | `ACTIVE` | active |
  | `IN_GRACE_PERIOD` | `past_due` (access continues) |
  | `ON_HOLD`, `PAUSED` | no access |
  | `CANCELED` | cancelled, until the expiry time |
  | `EXPIRED` | expired |
  | voided / revoked | refunded, access ends at once |

- **`play-billing` function** (user JWT). The app sends the purchase token
  after a purchase. The server:
  1. checks it with the Play Developer API (`purchases.subscriptionsv2.get`)
  2. checks `obfuscatedExternalAccountId` is this account (set at purchase,
     like Lemon Squeezy's custom data)
  3. **acknowledges it** (Google refunds unacknowledged purchases after three
     days)
  4. stores it

  It refuses a second subscription when one is already active from either
  store.
- **`play-rtdn` function** (no user JWT; verifies Google's signed push
  token):
  - every notification carries only a token, so it **re-reads the state
    from the API** rather than trusting the message
  - duplicate and out-of-order handling, as with the Lemon Squeezy webhook
  - voided-purchase notifications are refunds
- **delete-account:** cancels a Play subscription through the API, as it
  does Lemon Squeezy's, and refuses to delete if that fails.
- **The app:**
  - Inside the TWA, Subscribe opens Play's purchase sheet and Manage opens
    Play's subscriptions page. The Lemon Squeezy checkout never appears
    there.
  - On the website, a Play subscription shows "Manage on Google Play".
  - On start, `listPurchases()` finishes any purchase whose acknowledgement
    was missed.
- **Tests**, at the same depth as Lemon Squeezy:
  - handler tests with a faked Play Developer API and faked RTDN pushes:
    renew, cancel, grace, hold, expire, refund, deleted account, wrong
    account, replayed token
  - SQL checks
  - e2e with a faked Digital Goods API
- **Terms and Privacy Policy:**
  - Google as a second seller and processor (it holds the payment details)
  - the Play refund route (refunds go through Google)

### 5. The store listing and Google's forms · M · M + C drafts

- **Listing:**
  - short and full descriptions, in English and Hebrew (C drafts)
  - phone screenshots and a feature graphic (C makes these with Playwright)
  - category Health & Fitness
- **Data safety form:** what is collected, why, encrypted in transit,
  deletable in the app. It must match the Privacy Policy line by line.
- **Health apps declaration**, plus the target audience (adults; the Terms
  say no under-16s) and the content rating questionnaire.
- **App access:** the reviewer account from step 3.

### 6. Closed test → production · calendar, at least 14 days · M

- Internal testing first (a few people, immediate). Then the **closed test
  with 12 or more testers for 14 days**, using Play's test cards and license
  testers for the subscription.
- Then apply for production access and submit for review. A first review of
  a health app can take a week or more.

---

## Timeline

| Week | Code (C) | Owner (M) |
| --- | --- | --- |
| 1 | PWA: manifest, service worker, icons from a temporary mark; assetlinks; reviewer sign-in | Play Console account + verification; payments profile; recruit testers |
| 2 | Bubblewrap package; Play Billing server and webhook | Console: product, service account, Pub/Sub; upload to internal testing |
| 3 | Billing in the app, tests, policy and listing drafts | Forms; start the closed test |
| 4–5 | Fixes from testers | Closed test runs 14 days; then apply for production |

About **two weeks of code**, and **four to six weeks of calendar** before
the first public release, most of it Google's clocks. The Garmin submission
(`docs/PHASE-1-FINISH.md`) runs in parallel: its review clock is also
measured in weeks, so start its owner steps in week 1 too.

## Risks

- **Play's payments policy changes.** Re-read it at step 4, and again
  before submitting.
- **The TWA depends on Chrome** being installed and up to date on the
  phone. Most Android phones have it; billing needs Chrome 101 or later.
- **Two sellers for one plan.** The rules are the same; the risk is drift.
  One entitlement function (`_shared/plan.ts`) for both, and tests that run
  every scenario against both providers.
- **Refund paths differ.** Google refunds without asking us. We learn it
  from the voided-purchase notification, and must end access then.

---

## iPhone, later

Recorded 2026-10-10 as a possible next step after Android, **not** part of
Phase 1. Nothing in the Android plan blocks it.

**How it would be built.** iOS has no equivalent of a TWA, so the app would
be a **Capacitor** shell: a native iOS app showing the web app in a
WKWebView.
- Apple's review rejects apps that are only a website in a frame (App Store
  guideline 4.2, minimum functionality), so the app needs real native
  features.
- Vimetry has an obvious one: **Apple Health (HealthKit)**, reading steps,
  sleep, weight and workouts from the phone. That is useful for anyone
  without a Garmin.
- Native camera and notifications add to it.

**Payments: a third seller.** Digital subscriptions bought inside an iPhone
app go through Apple's In-App Purchase (StoreKit). That is 15% under the
Small Business Program.

On the server it is a third provider in `subscriptions`, beside Lemon
Squeezy and Google Play:
- the App Store Server API, to verify a purchase
- App Store Server Notifications V2, for renewals, cancels and refunds

The rules and the one-subscription-per-account design stay the same. This
is why the Android work keeps `provider` generic and keeps one entitlement
function: Apple should slot in, not need its own rule set.

**Check at the time:**
- **US link-outs.** Apple currently must allow US apps to link to paying on
  the website. That is the result of litigation still in motion.
- **The App Review Guidelines** on HealthKit use and on subscriptions.

**What it takes:**
- **Owner:** the Apple Developer Program ($99 a year, the same legal
  identity as the other stores) and a Mac with Xcode.
- **Testing:** TestFlight, with no 12-tester rule. Review usually takes a few
  days, so the calendar is shorter than Google's.
- **Code (C):** about **2–3 weeks**:
  - the iOS shell
  - StoreKit in the app, with its server and webhook
  - HealthKit
  - the store forms and screenshots
  - Terms and Privacy Policy, naming Apple as a seller, and HealthKit data
    if added

**The decision this affects now, and how it was made.** Building Android on
Capacitor too would give one native shell for both stores. It would cost
about a week more up front, and Play Billing would then need a native plugin
instead of the web APIs. **Decided: keep the TWA for Android** — it is the
fastest way into the Play Store, and it does not block iPhone later. If iPhone
becomes certain before the Android app ships, revisit this choice.
