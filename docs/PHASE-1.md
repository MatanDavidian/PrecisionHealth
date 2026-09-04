# Phase 1 — from a personal tool to something a stranger can pay for

Everything built so far assumes one user, one watch, one machine, and a
developer on hand. Phase 1 is the work that stops being true.

**Done means:** someone who has never met you can sign up, understand what
happens to their data, connect their Garmin, pay, and use it — and if they ask
what you hold about them, or ask you to delete it, there is an answer that does
not involve a SQL editor.

That single sentence is what everything below serves.

---

## Where it stands

| | |
| --- | --- |
| Domain model | mature — append-only, provenance, conflicts, canonical units |
| Nutrition | photo, text, manual, repeat, edit, leftovers, per-day, per-week |
| Garmin | reads and writes, foreground and background, established on hardware |
| AI | photo, text, follow-up questions, week insights, trial accounting |
| Hebrew / RTL | complete |
| Tests | 362 unit, 40 browser, 10 simulator |
| **Accounts** | **sign-in only — no export, no deletion, no consent record** |
| **Payments** | **none** |
| **Legal** | **no privacy policy, no terms, no DPAs** |
| **Operations** | **no error monitoring, no rate limiting, no alerting** |

The product is further along than the business around it. Phase 1 closes that
gap rather than adding features.

---

## The honest coverage gap

40 browser tests sound like a lot until you ask what they cover. They cover the
things that broke recently, because that is when they were written.

| Area | Browser coverage |
| --- | --- |
| Week view, navigation, arithmetic | good |
| Meal editing, Refill, leftovers | good |
| Past-day logging, describe-a-meal | good |
| Layout stability | good |
| The Log screen — photo, write, again | **now covered** |
| Confirming an estimate | **now covered** |
| Deleting a meal, and undo | **now covered** |
| Conflict resolution (D6) | **now covered** |
| Week insights, end to end | **now covered** |
| Settings — goal, language | **now covered** (key and model still open) |
| **Sign in and sign out** | none |
| **Trial exhaustion and quota states** | none |
| **Error and offline states** | none |

**The Log screen was the largest hole and the most-used screen in the app.** It
is also where the bug reported first — a photo taken and nothing happening until
you touched the background — actually lived.

**Covered as of Sep 2026** (`e2e/log-screen.spec.ts`): the waiting state
appearing the instant a photo is taken, which is the regression guard for that
exact bug; photo to estimate to save; the follow-up question producing a
revision; words to estimate; and Again logging a usual.

That is the shape of the risk: the tests protect what has already gone wrong
once, and nothing else.

---

## Epics

### E1 — Repeat a meal onto another day

*The immediate feature. Small, and worth doing first because it finishes a
story already half-told.*

The Log screen has **Again**, which repeats a usual meal onto *today*. The
Nutrition sheet has **Manual** and **Describe** for any day. The obvious third
option is missing: repeat a usual onto **the day you are looking at**.

- **S1.1** — A third mode in the add-meal sheet, beside Manual and Describe,
  listing the same usuals the Log screen offers, filed on the selected day.
- **S1.2** — The usuals list is ranked for that day's context (a breakfast
  repeated onto a morning), not for now.
- **S1.3** — Browser tests: repeat onto yesterday, confirm it lands there and
  not on today, confirm the day total moves by the right amount.

**Architecture:** none. `mealSignature`/usuals already exist, `addMeal` already
takes a day, and the sheet already has a mode toggle. This is composition.

**Known wrinkle:** Q12 — a usual is identified by its item names, so switching
language splits one meal into two usuals. Repeat makes that more visible.
Worth deciding whether Phase 1 fixes it or documents it.

---

### E2 — Cover what exists

*Nothing new ships until the existing thing is defensible.*

- ~~**S2.1** — Log screen, photo path~~ ✅ done
- ~~**S2.2** — Log screen, write path and the follow-up exchange~~ ✅ done
- ~~**S2.3** — Log screen, again path~~ ✅ done
- ~~**S2.4** — Confirm an estimate~~ ✅ done
- ~~**S2.5** — Delete a meal and undo it~~ ✅ done
- ~~**S2.6** — A conflict surfaced and resolved~~ ✅ done
- ~~**S2.7** — Week insights end to end~~ ✅ done
- ~~**S2.8** — Settings: goal, language, API key and model picker~~ ✅ done
- ~~**S2.9** — Sign in, sign out, and what an unauthenticated visitor sees.~~ ✅ done
- ~~**S2.10** — Trial exhausted, and the offline/unavailable states.~~ ✅ done

**Architecture:** the fake needs to express more situations. It gained a partial
week for the week card; it will need an exhausted trial, a conflict, an
unconfirmed estimate. **Every fixture gap is a test that cannot be written**,
which is exactly how the week-card bug reached a phone.

The trial and the account arrived as `e2e/supabase.ts`, which answers Supabase's
network calls inside the tab rather than adding a test-only branch to the
composition root. That choice is the reason S2.10 covers anything: the count it
asserts is parsed from a PostgREST header by the real `readTrialStatus`, which a
`?signedIn=1` flag would have stepped straight over. Remaining fixture gaps are
the conflict and the unconfirmed estimate.

`e2e/openai.ts` does the same for the own-key path, and covering it turned up a
real bug: `loadModels` sat below `if (!settings) return`, so the mount effect
closed over a binding that render had never reached. The throw went into a
floating promise and nothing on screen changed — the model list just never
loaded, and anyone who had saved a key was told to save it again every time they
opened Settings. Second time a hooks-after-an-early-return mistake has bitten
this file.

**E2 is done.** What the fake still cannot express is a conflict and an
unconfirmed estimate; both have UI, and neither is reachable from a test.

---

### E3 — A name and an address

The app calls itself **Timeline** on screen. The repository is
**PrecisionHealth**. Before anything is published, those need to be one thing.

- **S3.1** — Decide the product name. This gates the domain, the Store listing,
  the privacy policy and every email that will ever be sent.
- **S3.2** — Acquire a domain. `precisionhealth.com` is a generic two-word
  `.com` and is almost certainly held; treat availability as unknown until
  checked at a registrar. Realistic options: a coined name, or `.app` / `.health`
  / `.io` on the name you actually want.
- **S3.3** — Custom domain on the hosting, TLS, and the redirect from the
  current `pages.dev` address.
- **S3.4** — Email on that domain, since account recovery and any legal notice
  has to come from somewhere that is not gmail.

---

### E4 — Per-device authentication, and the Store

*This is the gate on publishing at all, and it is bigger than the privacy work.*

The Garmin credential is compiled into the `.prg`. That works for exactly one
watch and cannot be published.

- **S4.1** — **Issue a device token from the web app.** Settings → Garmin →
  Create device token, shown once, listed and revocable afterwards. Replaces
  `scripts/mint-device-token.mjs`. The table already supports it; what is
  missing is an endpoint that mints and a screen that shows.
- **S4.2** — The watch reads it from Connect IQ settings. **Already works** —
  `Cfg` reads `Properties` before the compiled-in value precisely for this.
- **S4.3** — Regenerate the manifest UUID, once, and never again.
- **S4.4** — Store listing: description, screenshots, supported devices, the
  privacy policy URL from E5.
- **S4.5** — Later, and separately: replace token-paste with a pairing code.
  Better UX, same ingestion.

**Architecture:** one new endpoint (mint), one new screen, one new column
(`device_type`) if we ever have a second kind of device.

---

### E5 — The legal floor

*Detail in [`COMPLIANCE.md`](COMPLIANCE.md). The engineering consequences are
here.*

- **S5.1** — Privacy policy and terms, published, versioned, and linked from
  sign-up. Must name every sub-processor: Supabase, OpenAI, the host, the
  payment provider.
- **S5.2** — **Consent capture.** Which policy version, agreed when. Health data
  in the EU needs explicit consent, and "explicit" means recorded.
- ~~**S5.3** — **Export.** Everything held about a person, in a machine-readable
  file.~~ ✅ done. Assembled from `account.everything`, a read with no window
  over it — the day- and range-scoped reads the screens use would have made
  completeness depend on guessing dates. The API key is deliberately excluded
  and the file says so. Building it against a real project found that PostgREST
  caps a response at 1000 rows, so the first version silently truncated the
  export for exactly the accounts with the most to lose; it pages now.
- ~~**S5.4** — **Delete my account.**~~ ✅ done, as `supabase/functions/delete-account`.
  It removes the auth user and lets the existing cascade take the rows in one
  transaction, then counts what should be gone and reports anything that is
  not. Deployment is still outstanding — see `supabase/README.md`.
- **S5.5** — **Data residency decision.** Which Supabase region, and what that
  means for EU users. This is an architecture decision that is expensive to
  change later and free to make now.
- **S5.6** — **A per-source consent screen.** Activity, Recovery, Body,
  Clinical — enabled separately rather than a blanket grant. Also the honest
  place to say what leaves the device for the AI.
- **S5.7** — Operational floor: error monitoring, rate limiting on public
  endpoints, and an alert when the AI spend runs away.

---

### E6 — Payments

- **S6.1** — Decide the model: subscription, one-off, or AI usage. There is
  already a trial ledger and an entitlement notion to build on.
- **S6.2** — Choose a provider. **A merchant of record** (Paddle, Lemon
  Squeezy) versus Stripe direct. Selling software from Israel to the EU and US
  means VAT and sales-tax registration in places you have never been; a
  merchant of record takes that on in exchange for a larger cut. For a
  one-person product that trade is usually worth it.
- **S6.3** — Subscription state on the account, and entitlement checks in the
  edge function beside the existing trial logic.
- **S6.4** — Billing screen: plan, invoices, cancel. Cancellation must be
  self-service.
- **S6.5** — Failed payments, dunning, and what an expired account can still do
  — reading your own history should survive a lapsed card.

---

## Architecture changes

Most of Phase 1 is not new architecture. These are the exceptions:

1. **Device-token issuance** — an endpoint that mints, and a screen that shows
   a secret exactly once. New surface, and security-sensitive.
2. **Consent records** — a small append-only table. Fits D4 naturally: consent
   is an event, and its history is the point.
3. **Export** — a read path that assembles everything for one user. Touches
   every repository; worth one function rather than a screen that grows.
4. **Subscription state and entitlement** — extends the existing trial ledger
   rather than replacing it.
5. **Data residency** — a decision, not code, but it constrains everything
   after it.
6. **Fixture expansion** — the fake must express trial exhaustion, conflicts,
   and unconfirmed estimates, or E2 cannot be written.

Nothing here disturbs D1–D21. The domain model was built for this.

---

## Sequencing

```
E1  repeat onto another day        ← small, finishes a story, do it first
E2  cover what exists              ← before anything is published
E3  name and domain                ← gates E4 and E5, so decide early
E5  legal floor                    ← privacy policy gates the Store listing
E4  per-device auth, Store         ← needs E3 and E5
E6  payments                       ← last; nothing to sell until the rest works
```

E3 is small but blocks two epics, so decide it early even though the work is
later. E5 before E4 because the Store submission asks for a privacy policy URL.

---

## Decisions needed

1. **The product name** — Timeline, PrecisionHealth, or something else.
2. **Which markets at launch.** Israel only is far simpler than Israel + EU +
   US. Every jurisdiction added is real work, and the EU is the most demanding.
3. **Data residency** — where the database lives.
4. **Payment model and provider.**
5. **Q12** — cross-language usuals: fix in Phase 1 or document as known.

---

## Parked: Apple Watch and Samsung

Feasible, but neither works the way Garmin did, and the difference matters.

Connect IQ let us run code **on the watch** that reads health data and posts it
directly. **Neither Apple nor Wear OS allows the equivalent from a web app.**

- **Apple Watch** — health data lives in HealthKit, reachable only by a native
  iOS app with the entitlement. A web app cannot read it under any
  circumstances. An Apple Watch app also requires an iOS companion. So this
  means shipping an iOS app.
- **Samsung / Wear OS** — data reaches **Health Connect** on Android, readable
  by a native Android app. Samsung Health's own SDK is partner-gated, much like
  Garmin's Health API. So this means shipping an Android app.

So the choice is: **build two native apps**, or **use an aggregator** (Terra,
Vital, Rook, Spike) that covers Apple Health, Health Connect, Garmin and others
behind one API — for money per user, and with health data routed through a third
company that must then appear in the privacy policy.

The ingestion side is already agnostic: `DataSource` includes `APPLE_HEALTH`
and `HEALTH_CONNECT`, and `device-sync` cares about codes and days rather than
about watches. Whichever route opens, it is an adapter.

**Not Phase 1.** Garmin covers the person building it.
