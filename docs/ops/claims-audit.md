# Product claims, audited against the code

For the Lemon Squeezy store description. Every row was checked against the
repository on 2026-09-11, not recalled.

**Three states, deliberately:** *implemented* means the code exists and is
tested; *deployed* means it is also live in production; *unverified* means
nobody has exercised it end to end against a real account.

| Claim | State | Evidence |
| --- | --- | --- |
| Confidence shown per food item | **implemented** | `EstimateCard.tsx:121` renders a per-item percentage |
| Disagreeing sources surfaced | **implemented** | `ConflictNotice` rendered at `Today.tsx:334`; the string is "Two sources disagree" (`strings.ts:323`) |
| Export everything as one file | **implemented** | `AccountData.tsx:44` → `collectPersonalExport`; assembled in the browser, no server round trip |
| Permanent account deletion | **deployed, unverified** | `AccountData.tsx:76` → `deleteAccount` → the `delete-account` function, which answers 401 to an anonymous caller so it is live. **No real account has been deleted with it.** |
| English and Hebrew | **implemented** | `strings.ts:25-28`; both dictionaries are complete, enforced by the type |
| Meal photographs not stored *by us* | **implemented, but not the whole truth** | No photo store exists in the IndexedDB schema; only a sha256 is kept as an inference reference (`estimatedMeal.ts:196, 239`). **OpenAI retain API inputs for up to 30 days**, so an unqualified "never stored" is a claim about a pipeline we do not control. |
| Garmin Connect IQ integration | **works, not published** | `garmin/README.md:265` still has a "Before publishing to the Store" section. It is sideloaded onto one watch. |
| "Personal health record" | **do not use** | A term of art in health IT that reads as a regulated product, and contradicts the same document's "not a medical device" |

## What that means for the description

Two claims are safe to make plainly, two need qualifying, and one should be
dropped:

- **Say without qualification:** confidence per item, disagreeing sources
  surfaced, export, both languages.
- **Qualify:** photographs — "we do not store" is true; "never stored" is not.
- **Qualify:** Garmin — "in development" until it is in the Store.
- **Hold back:** permanent deletion, until one real account has been deleted
  with it. The code is deployed and the invariant is tested at the database
  level, but a merchant description is the wrong place for a feature nobody
  has run once.

## Mail

`vimetry.app` has **no MX records at all** (checked 2026-09-11). Neither
`support@vimetry.app` nor `privacy@vimetry.app` can receive anything today.
That matters twice over: the published privacy policy already names
`privacy@vimetry.app` as the controller contact, and a merchant application
with an unreachable support address fails its own verification correspondence.
