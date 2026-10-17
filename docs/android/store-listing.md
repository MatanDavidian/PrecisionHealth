# Google Play: the store listing and Google's forms

Drafts for step 5 of `docs/ANDROID-APP.md`, written 2026-10-10. Everything
here is pasted into the Play Console by the owner, who should read it first:
the forms are declarations made in the owner's name.

**Check these against the Privacy Policy before submitting** (`/privacy`,
`src/policy/documents.ts`). Google compares the Data safety form with the
policy, and so do careful users. The answers below were written from the
policy as it stands on 2026-10-09.

**The listing claims only what the app does.** A Garmin watch sends calories
burned, steps, distance, resting heart rate, stress, respiration and VO₂ max
(`garmin/source/Sync.mc`) — **not sleep**. The Privacy Policy's "Sleep — from
the same source" describes data the app can hold but does not yet receive;
consider rewording it at the next policy change.

**Before release, the Privacy Policy and the Terms need a paragraph about
Google Play:**
- Google as a second seller, holding the payment details for in-app
  subscriptions
- Play's refund route: refunds of Play purchases go through Google

That is a version bump, so signed-in users re-consent once.

---

## Store listing

**App name** (30 characters at most): `Vimetry`

**Short description** (80 at most):
- EN: `Log meals by photo or in words, and see them beside your activity.` (67)
- HE: `רישום ארוחות בתמונה או במילים, לצד הפעילות שלכם.`

**Full description, EN** (4,000 at most):

```
Vimetry is a personal health log that puts what you eat beside how much you move.

Photograph a meal, or describe it in a sentence, and get an estimate of its calories, protein, carbs and fat — with how confident the estimate is, item by item, and the assumptions behind it. Adjust any number before you save. Nothing you log is ever silently overwritten: corrections are new entries, so your record stays honest.

LOG IN THREE WAYS
• Photo — the default. Take a picture or choose one; add a note like "no oil" if it helps.
• Write — "two eggs on toast and a black coffee".
• Again — repeat something you eat often in one tap. No AI, no waiting.

SEE THE DAY AND THE WEEK
• Today: calories and macros against your goal, beside your activity.
• The week: what you ate against what you burned, day by day — and a plain account of days with no figures, rather than a guess.
• Missed a day? Fill it from your own average, marked as an estimate.
• Ask for insights on your week: what stands out in the numbers, and one to three small changes worth trying — general habits, not medical advice. Any AI answer can be reported from inside the app.

WITH YOUR GARMIN
Connect a Garmin watch (Forerunner 265 and 265S, more to come) for calories burned, steps, distance, resting heart rate, stress and VO₂ max.

YOUR DATA IS YOURS
• Meal photos are not stored. A photo is sent for analysis once and then discarded.
• Use it without an account, kept in this phone only — or sign in to keep it in your account across devices.
• Export everything, any time. Delete your account and all of it, from the app.
• No ads. Your data is never sold.

FREE, WITH A SUBSCRIPTION FOR MORE
Logging by hand, the week view and exporting are free. New accounts get 10 AI analyses free. Vimetry Monthly includes 100 photo analyses and 200 written ones a month; cancel any time from Google Play.

Vimetry is not a medical device and does not diagnose, treat, cure or prevent any medical condition. Its suggestions are general habits, not medical advice — consult a healthcare professional for medical advice, diagnosis or treatment.

In English and Hebrew.
```

**Full description, HE:**

```
Vimetry הוא יומן בריאות אישי ששם את מה שאתם אוכלים לצד כמה שאתם זזים.

צלמו ארוחה, או תארו אותה במשפט, וקבלו הערכה של הקלוריות, החלבון, הפחמימות והשומן — עם מידת הביטחון בהערכה, פריט אחר פריט, וההנחות שמאחוריה. אפשר לתקן כל מספר לפני השמירה. שום דבר שתרשמו לא נדרס בשקט: תיקונים הם רשומות חדשות, כך שהרישום שלכם נשאר נאמן.

שלוש דרכים לרשום
• תמונה — ברירת המחדל. צלמו או בחרו תמונה; הוסיפו הערה כמו "בלי שמן" אם זה עוזר.
• כתיבה — "שתי ביצים על טוסט וקפה שחור".
• שוב — חזרה על משהו שאתם אוכלים לעיתים קרובות בנגיעה אחת. בלי בינה מלאכותית, בלי המתנה.

היום והשבוע
• היום: קלוריות ומאקרו מול היעד שלכם, לצד הפעילות שלכם.
• השבוע: מה אכלתם מול מה ששרפתם, יום אחר יום — ותיאור כן של ימים בלי נתונים, במקום ניחוש.
• פספסתם יום? אפשר למלא אותו מהממוצע שלכם, מסומן כהערכה.
• בקשו תובנות על השבוע שלכם: מה בולט במספרים, ואחד עד שלושה שינויים קטנים שכדאי לנסות — הרגלים כלליים, לא ייעוץ רפואי. אפשר לדווח על כל תשובה של הבינה המלאכותית מתוך האפליקציה.

עם ה־Garmin שלכם
חברו שעון Garmin (Forerunner 265 ו־265S, ועוד בהמשך) לקלוריות שנשרפו, צעדים, מרחק, דופק במנוחה, מתח ו־VO₂ max.

הנתונים שלכם שייכים לכם
• תמונות ארוחות לא נשמרות. תמונה נשלחת לניתוח פעם אחת ואז נמחקת.
• אפשר להשתמש בלי חשבון, בטלפון הזה בלבד — או להיכנס לחשבון ולשמור את הנתונים בין מכשירים.
• ייצוא של הכול, בכל רגע. מחיקת החשבון וכל מה שבו, מתוך האפליקציה.
• בלי פרסומות. הנתונים שלכם לעולם לא נמכרים.

חינם, עם מנוי למי שרוצה יותר
רישום ידני, תצוגת השבוע וייצוא — בחינם. חשבונות חדשים מקבלים 10 ניתוחי בינה מלאכותית בחינם. Vimetry Monthly כולל 100 ניתוחי תמונה ו־200 ניתוחי טקסט בחודש; אפשר לבטל בכל רגע מ־Google Play.

Vimetry אינו מכשיר רפואי, ואינו מאבחן, מטפל, מרפא או מונע שום מצב רפואי. ההצעות שלו הן הרגלים כלליים ולא ייעוץ רפואי — לייעוץ, אבחון או טיפול רפואי, פנו לאיש מקצוע בתחום הבריאות.

באנגלית ובעברית.
```

**Category:** Health & Fitness. **Tags:** nutrition, calorie counter, food
diary, fitness tracker.

**Contact:**
- email: support@vimetry.app
- website: https://vimetry.app
- privacy policy: https://vimetry.app/privacy

**Graphics**, from `node scripts/store-screenshots.mjs` (with the test build
previewing; see the script) into `android/store-screenshots/`, which git
ignores:

| Asset | Size | Files |
| --- | --- | --- |
| App icon | 512×512 | `public/icons/play-store-512.png` |
| Feature graphic | 1024×500 | `feature-graphic.png` |
| Phone screenshots | 1080×1920 | `en-US/` and `he-IL/`: Today, Log, Nutrition, the week |

**Still missing: a photo-and-estimate screenshot.** It is the app's main
feature, so it should be the first screenshot, and it must be real. Take it
on a phone, as the test account, with a real meal. The test build can only
pair a placeholder image with a canned estimate, which would misrepresent the
app.

---

## Data safety form

Google's wording, our answers.
- **Does the app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected encrypted in transit?** Yes (HTTPS
  everywhere; HSTS).
- **Do you provide a way for users to request that their data is deleted?**
  Yes. In the app: Settings → Account & data → Delete my account.
  - **The web link Google requires:** https://vimetry.app/delete-account.
    It is public (no sign-in, before any consent) and explains:
    - deleting in the app
    - that a subscription is cancelled first
    - an email route for anyone who cannot sign in

**Shared (sent to a third party for its own use):** **none.** Supabase,
OpenAI, Cloudflare, Brevo and Lemon Squeezy act on our behalf as service
providers (processors), which Google's form does not count as sharing. The
Privacy Policy names each one.

**Collected:**

| Category → type | Collected | Optional? | Ephemeral? | Purposes |
| --- | --- | --- | --- | --- |
| Personal info → Email address | yes | optional (only with an account) | no | Account management, App functionality |
| Health and fitness → Health info (meals and their nutrients, weight, body measurements, goals) | yes | optional (only with an account; without one it stays on the phone) | no | App functionality |
| Health and fitness → Fitness info (calories burned, steps, distance, resting heart rate, stress, respiration, VO₂ max — from a Garmin watch) | yes | optional | no | App functionality |
| Photos and videos → Photos (a meal photo, for analysis) | yes | optional | **yes** — sent once, not stored | App functionality |
| Financial info → Purchase history (whether you subscribe, and when it renews) | yes | optional | no | App functionality, Account management |
| App info and performance → Crash logs (error reports: message, page path, app version, browser; no account, no health data) | yes | not optional | no | Analytics |
| App activity → Other user-generated content (a report about an AI answer: the reason, an optional note, the model; no account, no meal, no answer) | yes | optional (only if you report) | no | App functionality; Fraud prevention, security, and compliance |

**Not collected:**
- location
- contacts
- messages
- audio
- files
- calendar
- web browsing
- device or other IDs (the watch's token is our own credential, not a
  device identifier)
- payment details (Lemon Squeezy and Google hold those)

---

## Health apps declaration

- **Categories:** Nutrition and weight management; Activity and fitness.
- **Not** a medical device, not clinical decision support, and not human
  subjects research. The Terms say so (*"does not diagnose, treat, or
  advise"*), and so does the listing.
- **Health Connect:** not used. Garmin data comes through Vimetry's own
  watch app.

## Content rating questionnaire (IARC)

- **Category:** Reference, News, or Educational, or the closest offered.
  Health & Fitness tools usually land there.
- **No:** violence, sexuality, language, controlled substances, gambling.
- **Users interact, or share content with other users?** No.
- **Shares the user's location with other users?** No.
- **Digital purchases?** Yes (the subscription).

## Target audience and content

- **Target age:** 18 and over. The Terms exclude under-16s; 18+ keeps the
  app out of the Families policy.
- **Ads:** no.
- **News app:** no. **Government app:** no. **Financial features:** none.

## App access (for the reviewer)

**All or some functionality is restricted** → instructions:

```
Vimetry works without an account. To review the signed-in features (subscription, account, sync):
1. Open the app → Settings → Account & data → Sign in.
2. On the sign-in card, tap "App reviewer? Sign in with a password".
3. Email: review@vimetry.app   Password: <from the owner's password manager>
The account is a review account with no real person's data.
To test the subscription, use a license-tester Google account (purchases are free and renew every few minutes).
```

The password goes **only** into this Play Console field, never into the
repository or a chat.

---

## Open work before submitting

1. **The real photo-and-estimate screenshot** — owner, on a phone.
2. ~~A public account-deletion page~~ — **built 2026-10-10:** `/delete-account`
   (`e2e/delete-account-info.spec.ts`). Owner: it promises deletion
   **within 30 days** of an emailed request — the GDPR limit is one month.
   Change the wording if that is not a promise you want to make.
3. **Privacy Policy and Terms: Google Play as a seller.** Drafted below for
   the owner to approve. Once approved, C applies it in
   `src/policy/documents.ts` with a version bump, so signed-in users
   re-consent once.

   **Privacy Policy, "What this app holds"** — the subscription bullet
   becomes:
   > Whether you subscribe — your plan and when it renews. Card and billing
   > details are held by Lemon Squeezy, or by Google Play if you subscribed
   > in the Android app — not by us.

   **Privacy Policy, "Who else sees it"** — one more bullet:
   > Google — if you subscribe inside the Android app, Google Play sells the
   > subscription: it takes the payment, holds your payment details, and
   > tells us whether you subscribed and when it renews. It receives no
   > health data.

   **Privacy Policy, after "When the app breaks"** — a new section, for
   "Report this answer" (built 2026-10-17):
   > **When you report an AI answer.** Under each AI estimate and the
   > week's insights there is "Report this answer". A report holds the
   > reason you chose, the note you wrote if any, which AI model answered,
   > and the app's version. It does not include the meal, the photo, the
   > answer or your account, and email addresses, keys and similar are
   > removed from the note before it is kept. Reports are kept for a year.

   **Privacy Policy, "Why we hold it"** — the error-report bullet becomes:
   > To find and fix what breaks, and what the AI gets wrong, from reports
   > that are not linked to you.

   **Terms, "Subscription"** — after the Lemon Squeezy paragraph:
   > In the Android app, the subscription is sold by Google Play instead, at
   > Google Play's price for your country, and Google Play's terms apply to
   > the payment. You manage and cancel it in Google Play, and refunds of
   > those payments are requested from Google; a refunded subscription ends
   > when the refund is made. One subscription covers the app and the
   > website, whichever you bought it from, and an account cannot hold two
   > at once.
4. ~~A sample week in the review account~~ — **done 2026-10-11**
   (`scripts/seed-review-account.ts`): three weeks of meals, activity
   readings, a workout and goals, all from the app's sample set with fresh
   ids. It refuses any account but the review one, and won't write twice.
