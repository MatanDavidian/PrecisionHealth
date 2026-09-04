# Phase 1 Roadmap — Launch-Ready Personal Health App

## Product Direction

Phase 1 should now be defined as a **launch-ready wellness MVP**, not just a first UI version.

The goal is not merely to make the core app work for one user. Phase 1 should end when the product is stable enough for real users, can accept payment, has a proper domain and privacy posture, and at least the Garmin companion app can be distributed publicly.

Apple Watch and Samsung / Galaxy Watch support should remain in the roadmap, but they should **not block Phase 1 launch**. Phase 1 should instead ensure the architecture is ready for them.

---

# Wearable Strategy

## Garmin, Apple Watch, and Samsung Watch

The long-term architecture should use one shared backend and normalized health model, with a dedicated adapter per wearable platform.

```text
                         ┌─ Garmin Connect IQ
                         │     Monkey C
                         │
Watch / Health Sources ──┼─ Apple Watch / HealthKit
                         │     Swift / SwiftUI
                         │
                         └─ Wear OS / Galaxy Watch
                               Kotlin / Compose
                                      │
                                      ▼
                           Wearable Ingestion API
                                      │
                                      ▼
                              Observation Model
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
                 Dashboard         Analytics            AI
```

### Apple

Apple Watch and iPhone integrations can use **HealthKit**.

HealthKit can expose health and fitness information with fine-grained user permissions by data type.

### Samsung / Galaxy Watch

For Samsung watches, the preferred first route is **Wear OS Health Services**, rather than immediately depending on Samsung-specific sensor SDKs.

Useful metrics include:

- Steps
- Heart rate
- Distance
- Calories
- Exercise data

More advanced Samsung-specific sensor access can be evaluated later.

### Phase recommendation

```text
Phase 1:
Garmin implementation

Phase 2+:
Apple Health / Apple Watch
Wear OS / Galaxy Watch
```

The backend should be wearable-provider-agnostic from the start.

---

# Phase 1 Exit Definition

Phase 1 should end when the following statement is true:

> A stable, secure, monetizable personal-health web application is ready for real customers, with Garmin integration, production-grade testing, privacy/security foundations, a branded domain, and controlled public release capability.

We should not define Phase 1 success as "zero bugs."

A better release gate is:

```text
No known P0/P1 defects

All critical user journeys covered by automated tests

Production monitoring enabled

Security/privacy release checklist passed

Payment works end-to-end

Account deletion/export works

Garmin production authentication works

Garmin Store submission accepted or ready

Custom domain live

Public beta ready
```

---

# Phase 1 Epic Roadmap

| Epic | Goal | Priority |
|---|---|---:|
| **P1.1 Meal Repeat** | Add the `"Repeat / שוב"` flow | **NOW** |
| **P1.2 Quality & E2E Audit** | Establish release confidence | Critical |
| **P1.3 Garmin Productionization** | Turn personal Garmin POC into real integration | Critical |
| **P1.4 Privacy, Security & Compliance** | Prepare for storing other users' health data | Critical |
| **P1.5 Branding & Domain** | Give product a permanent identity/domain | High |
| **P1.6 Payments & Entitlements** | Make paid subscriptions possible | High |
| **P1.7 Public Beta / Publishing** | Put the product in front of real users | High |
| **P1.8 Wearable Portability Foundation** | Prepare Apple/Samsung without building them yet | Medium |

---

# P1.1 — Meal Repeat / "שוב"

This is the first feature to implement.

## Desired User Flow

```text
Add Meal
   │
   ├── Add manually
   ├── Add from photo
   │
   └── Repeat / שוב
            │
            ▼
       Recently logged meals
            │
        ┌───┼─────────┐
        ▼   ▼         ▼
     Breakfast   Lunch   Dinner
       today     yesterday  ...
            │
            ▼
         Preview
            │
            ▼
          Add
```

If the user is currently viewing a previous date, for example:

```text
September 2
```

and selects:

```text
Add meal → Repeat
```

the repeated meal must be created on **September 2**, regardless of when the original meal was logged.

## Architecture Decision

Do **not** reuse the old meal record directly.

Create a new independent meal as a snapshot/deep copy.

Example:

```text
Original meal
id = meal-123

Chicken 200g
Rice 180g
Salad 100g
```

becomes:

```text
New meal
id = meal-987
repeatedFromMealId = meal-123

Chicken 200g
Rice 180g
Salad 100g
```

If the user later edits the new meal:

```text
Rice 180g → 250g
```

the original meal must remain unchanged.

## Why Keep `repeatedFromMealId`

It becomes useful later for AI and personalization.

For example:

> This is a meal the user eats frequently.

That can support:

- Frequent meals
- Favorites
- Quick logging
- Personalized meal suggestions
- AI habit analysis

## Suggested User Stories

### US-MEAL-01
As a user, when adding a meal, I can select `"Repeat / שוב"` and see previously logged meals.

### US-MEAL-02
As a user, I can select one of my previous meals and add an independent copy to the currently selected date.

### US-MEAL-03
As a user, I can modify the copied meal without modifying its source meal.

### US-MEAL-04
As a user, I can see enough information—meal name, foods, macros, and date—to identify which meal I am repeating.

### US-MEAL-05
The system must never expose another user's meals in the repeat picker.

## Initial Scope

For Phase 1:

```text
Show last 20–30 meals
Order by most recent
Allow selecting one
Copy into current target date
```

Later:

```text
Frequently used
Favorites
Search
Suggested repeats
```

---

# P1.2 — Quality and E2E Audit

After Meal Repeat, the next priority is release confidence.

The correct approach is **not simply adding more tests**.

Create a:

> Feature → Test Traceability Matrix

Example:

| Feature | Unit | Integration | E2E | Status |
|---|---:|---:|---:|---|
| Manual meal | ✅ | ✅ | ✅ | covered |
| Food photo | ✅ | ✅ | ✅ | covered |
| Edit meal | ✅ | ? | ✅ | inspect |
| Delete meal | ✅ | ? | ? | gap |
| Repeat meal | ✅ | ✅ | ✅ | new |
| Previous-day logging | ✅ | ✅ | ✅ | critical |
| Weight | ✅ | ✅ | ✅ | covered |
| Manual energy | ✅ | ✅ | ✅ | covered |
| Garmin precedence | ✅ | ✅ | ? | gap |
| Garmin supersede | ✅ | ✅ | ? | gap |
| Conflict >100 kcal | ✅ | ✅ | ✅ | verify |
| Account deletion | ? | ✅ | ✅ | critical |
| Subscription | — | — | — | future |

The number of tests alone is not enough.

A project can have hundreds of tests and still miss a critical user journey.

## Critical E2E Flows for Phase 1

### Authentication / Account Lifecycle

- Sign up
- Sign in
- Sign out
- Password/account recovery if supported
- Account deletion
- Authorization isolation between users

### Meals

- Manual meal
- AI/photo meal
- Edit meal
- Delete meal
- Previous-date meal
- Repeat meal
- Daily nutrition totals
- Weekly nutrition totals

### Body

- Weight entry
- Edit weight
- Delete weight
- Trend display

### Energy

- Manual energy entry
- Garmin ingestion
- Source precedence
- Supersede chain
- Conflict handling

### Garmin

- Device token association
- Authorized ingestion
- Unauthorized request rejection
- Re-sync
- Catch-up
- Completed-day-only behavior

### Billing

- Subscribe
- Cancel
- Expire
- Webhook retry
- Entitlement update

### Privacy

- Data export
- Account deletion
- Deletion cascades to related data

### Timezone / Day Boundary

This deserves dedicated tests because daily health data is especially sensitive to timezone mistakes.

Scenarios:

- UTC vs local day
- Daylight saving transitions
- Previous-day logging
- Garmin completed-day records
- User changing timezone

## Phase 1 Release Gate

```text
0 known critical/high release bugs

100% of release-critical journeys mapped to automated tests

All CI suites green

No known flaky critical-path E2E

Cross-user authorization tests pass

Production database backup + restore tested

Dependency/security scan clean of unresolved critical issues
```

---

# P1.3 — Garmin Productionization

The Garmin proof of concept already validated the main technical path.

The remaining goal is to convert:

```text
POC
 ↓
Personal watch integration
 ↓
Production multi-user integration
```

## P1.3A — Complete Physical Validation

Validate on the real FR265:

- `History.calories` semantics
- Background morning wake
- Completed-day-only sync
- Catch-up after missed days
- Supersede behavior
- Foreground rich sync
- Timezone/day correctness

Once verified, update the Garmin documentation from **expected** to **established** behavior.

## P1.3B — Remove Compiled-In Credentials

Before Store publication:

```text
compiled fallback token
        ❌
```

Each installation should use a revocable per-device credential.

Suggested model:

```text
DeviceCredential
    id
    userId
    deviceType
    tokenHash
    createdAt
    lastUsedAt
    revokedAt
```

Suggested value:

```text
deviceType = GARMIN_CONNECT_IQ
```

## P1.3C — Pairing

### MVP Option

```text
Web:
Create Garmin token

Connect IQ settings:
Paste token
```

### Better Future Flow

```text
Watch displays:
381729

Web:
Connect Garmin
Enter 381729

Backend pairs installation
```

The backend should already think of the credential as a device credential so replacing manual token entry with pairing does not change ingestion.

## P1.3D — Garmin Store

Garmin Store release requires:

- Stable manifest UUID
- Supported device list
- `.iq` package
- Screenshots
- Description
- Privacy policy
- Per-user authentication
- Production API endpoint
- No embedded shared secret

The Garmin companion app should likely be **free**, with payment handled by the main health platform.

---

# P1.4 — Privacy, Security, and Compliance

This should be a first-class Phase 1 epic before public signup.

The main areas are:

```text
Product compliance
Privacy/data protection
App-store compliance
AI / medical regulatory boundary
Security
```

## Israel — Initial Launch Jurisdiction

Health information should be treated as highly sensitive personal information.

Before public/commercial launch, create:

```text
Privacy Policy

Terms of Service

Data inventory

Database/security definition document

Access-control policy

Data retention policy

Deletion process

Data export process

Security incident response plan

Third-party processor list

AI-provider data-flow description
```

Important:

- Get Israeli privacy/legal counsel before commercial launch.
- Do not rely on AI-generated interpretations of legal thresholds as final legal advice.
- Validate obligations under current Israeli privacy legislation and regulations.

## United States

Do not model the strategy as:

```text
Not HIPAA → no compliance requirements
```

That is incorrect.

For a direct-to-consumer health product:

- HIPAA may not apply if the app is not acting for a covered entity/business associate.
- FTC health-data rules may still apply.
- State privacy laws can be important.
- Some states impose additional consumer-health-data requirements.

Before nationwide US launch:

```text
Create a state-law/privacy matrix
Review consumer-health-specific laws
Review breach notification rules
Review consent/deletion obligations
```

A qualified US privacy lawyer should validate the final launch posture.

## European Union

Health information is treated as a special category of personal data under GDPR.

The product should be designed for:

```text
explicit granular consent

withdraw consent

download data

delete data

purpose limitation

data minimization

processor contracts

EU data transfer analysis

retention rules
```

For a mature public product, also evaluate whether a DPIA is required.

## AI / Medical Boundary

For Phase 1, position the product as:

> health, nutrition, fitness, and wellness tracking

Avoid positioning it as:

> diagnosis, treatment, or medical decision-making

Potentially problematic future examples:

```text
"You have disease X"

"Change medication Y"

"This blood result proves Z"

"This AI treatment plan should replace medical care"
```

These features may introduce medical-device or higher-risk AI regulatory questions.

Phase 1 AI should focus on:

- Data organization
- Wellness summaries
- Nutrition support
- Fitness planning
- Goal tracking
- Non-diagnostic insights

---

# P1.5 — Branding and Domain

The app should move from a temporary development URL to a permanent product identity.

Do not lock onto one domain name before checking:

- Availability
- Existing companies/products
- Trademarks
- App stores
- Social handles

## Recommended Process

```text
20 candidate names
        ↓
.com availability
        ↓
.app / .health / .ai alternatives
        ↓
Apple/Google/Garmin Store search
        ↓
trademark search
        ↓
final shortlist
```

## Domain Migration Architecture

```text
temporary-domain.com
        ↓ 301
finalbrand.com
```

Update:

- DNS
- TLS
- Auth callback URLs
- CORS
- Email sender domain
- Payment webhooks
- Garmin API endpoint config
- Canonical SEO URLs
- Redirects

Domain selection should happen before final billing/public launch, but it does **not** need to block Meal Repeat or QA.

---

# P1.6 — Payments and Entitlements

Do not scatter billing-provider logic throughout the application.

Bad:

```text
if LemonSqueezyPaid
```

Better:

```text
EntitlementService
```

Architecture:

```text
user
   ↓
subscription
   ↓
entitlements
   ├── AI_ANALYSIS
   ├── GARMIN_SYNC
   ├── HISTORY
   └── ...
```

Then payment providers only update subscription state.

```text
               Billing Provider
                       │
                       ▼
                  BillingAdapter
                       │
                       ▼
                  Subscription
                       │
                       ▼
                   Entitlement
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
         Web        Garmin       future mobile
```

Possible future billing providers:

```text
PADDLE
LEMON_SQUEEZY
APPLE_STOREKIT
GOOGLE_PLAY
```

All should produce the same internal:

```text
Subscription
Entitlement
```

model.

This matters especially when native mobile apps arrive because Apple and Google have their own payment rules for digital features.

---

# P1.7 — Public Beta and Publishing

Do not go directly from:

```text
works for me
```

to:

```text
public launch
```

Use staged rollout:

```text
Internal
    ↓
5-user private alpha
    ↓
20–50 user closed beta
    ↓
Israel public beta
    ↓
paid public launch
```

## Before First External User

Require:

```text
privacy policy
terms
support email
delete account
export data
monitoring
backups
error reporting
analytics that do not leak health payloads
```

## Before Paid Public Launch

Require:

```text
billing
refund/cancellation flow
support process
incident process
domain
landing page
pricing
onboarding
```

Then submit/publish the Garmin companion.

---

# P1.8 — Wearable Portability Foundation

Do not build Apple Watch and Samsung Watch during Phase 1.

Instead, ensure Phase 1 leaves a clean integration port.

## Suggested Interface

```text
WearableObservationAdapter

read / receive source data
        ↓
normalize
        ↓
ObservationCommand
```

Example payload:

```json
{
  "provider": "GARMIN",
  "deviceType": "GARMIN_CONNECT_IQ",
  "zone": "Asia/Jerusalem",
  "observations": [
    {
      "day": "2026-09-03",
      "code": "TOTAL_ENERGY",
      "value": 2384
    }
  ]
}
```

Future providers:

```text
GARMIN
APPLE_HEALTH
WEAR_OS
HEALTH_CONNECT
```

All converge on the same write path.

No analytics or UI code should care which wearable produced the observation.

---

# Target Architecture at the End of Phase 1

```text
                        ┌─────────────────────┐
                        │       Web App       │
                        └──────────┬──────────┘
                                   │
             ┌─────────────────────┼────────────────────┐
             │                     │                    │
       Garmin Connect IQ      Future Apple        Future Wear OS
             │                     │                    │
             └────────────┬────────┴─────────┬──────────┘
                          ▼                  ▼
                    Authentication      Wearable Port
                          │                  │
                          └────────┬─────────┘
                                   ▼
                             Application API
                                   │
        ┌──────────────────────────┼────────────────────────┐
        ▼                          ▼                        ▼
    MealService              ObservationService       EntitlementService
        │                          │                        │
    RepeatMeal                  precedence              BillingAdapters
    AI Estimate                 supersedes
        │                          │
        └──────────────┬───────────┘
                       ▼
                    Database
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
       Object storage        Audit/Security
       food/body images      consent/events
```

---

# Recommended Execution Order

```text
NOW
│
├─ 1. Repeat Meal
│
├─ 2. Feature/Test inventory + E2E audit
│
├─ 3. Finish physical Garmin validation
│
├─ 4. Garmin per-user authentication
│
├─ 5. Security/privacy/compliance baseline
│
├─ 6. Brand + domain
│
├─ 7. Billing + entitlement system
│
├─ 8. Closed beta
│
├─ 9. Fix beta issues
│
├─10. Garmin Store submission
│
└─11. Israel paid public launch
```

US and EU launch should come after additional jurisdiction-specific legal review rather than blocking the first Israeli launch.

---

# Immediate Next Implementation

The next implementation should remain:

> **Repeat / שוב**

Recommended implementation order inside that feature:

```text
1. Define data-copy semantics
2. Define service/API contract
3. Implement backend/application logic
4. Implement UI flow
5. Add unit tests
6. Add integration tests
7. Add E2E test
8. Verify previous-day behavior
9. Verify user isolation
```

After Repeat is complete, the next major step should be the **feature-to-test traceability audit** so the project has a concrete view of which existing functionality is protected by E2E tests and which release-critical gaps remain.
