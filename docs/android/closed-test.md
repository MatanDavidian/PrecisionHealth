# The closed test

Google requires a closed test with at least 12 testers, opted in for 14 days
in a row, before a personal account may apply for production. This page
holds what the owner sends to testers, what to do when a tester is stuck,
and the notes Google asks for afterwards.

State (2026-11-15): the Alpha track is live (version 2, 1.0.1), in Israel
only, with the email list `testers1`. License testing covers the same list,
so testers are never charged.

## What to send a tester

Replace `[link]` with the "Join on the web" link from Play Console →
Vimetry → Test and release → Closed testing → Alpha → Testers.

**English**

> Hi! I'm about to launch an Android app, Vimetry, and Google asks for a
> group of testers first. It takes two minutes:
>
> 1. Send me the Gmail address you use on your Android phone, so I can add
>    you.
> 2. Open this link on the phone, signed in with that address: [link]
> 3. Tap "Become a tester", then the Google Play link on that page, and
>    install.
> 4. Keep the app installed for 14 days, and open it a few times.
>
> Subscribing inside the app is free for testers: Google shows a test card
> and charges nothing. If anything looks wrong or confusing, tell me. That
> is exactly what the test is for.

**עברית**

> היי! אני עומד להשיק אפליקציית אנדרואיד, Vimetry, ו-Google דורשת קודם
> קבוצת בודקים. זה לוקח שתי דקות:
>
> 1. שלחו לי את כתובת ה-Gmail שבה אתם משתמשים בטלפון האנדרואיד, כדי שאוסיף
>    אתכם.
> 2. פתחו את הקישור הזה בטלפון, כשאתם מחוברים עם אותה כתובת: [link]
> 3. לחצו על "Become a tester", אחר כך על הקישור ל-Google Play באותו עמוד,
>    והתקינו.
> 4. השאירו את האפליקציה מותקנת 14 יום, ופתחו אותה כמה פעמים.
>
> מנוי בתוך האפליקציה הוא בחינם לבודקים: Google מציגה כרטיס בדיקה ולא
> מחייבת כלום. אם משהו נראה לא נכון או מבלבל, ספרו לי. בדיוק בשביל זה
> הבדיקה.

## When a tester is stuck

| What they see | Cause | Fix |
| --- | --- | --- |
| "App not available … hasn't been published yet or isn't available for this account" | The Google account signed in on that browser is not in `testers1`, or the link was opened within a few hours of the list changing | Check the address under the avatar against the list, letter for letter. With several accounts on the phone, open the link in an incognito tab and sign in with the invited one. Otherwise wait a few hours |
| The Play page says the app is not available in their country | Their Play account is set to a country other than Israel | Nothing to do on their side. Adding countries to the closed test is the owner's choice; never the EEA or UK while declared non-trader (`store-listing.md`, "Trader status and countries") |
| "Your subscription has ended" half an hour after subscribing | A test subscription renews every 5 minutes and ends after 6 renewals | Expected. They can subscribe again |
| Asked to agree to the Terms again | The Terms changed on 2026-11-14 (the price) | Expected, once |

Adding a tester: Play Console → Vimetry → Closed testing → Alpha → Testers
→ the list `testers1` → add the address → Save. License testing follows the
list by itself.

The count that matters is on the app's dashboard: "testers opted in". The
14 days run only while it is 12 or more, so recruit 15 or 16.

## Notes for the production application

Google's form asks about the test in the owner's own words. Fill this in as
the test goes, so the answers are facts and not memories.

| Date | Who (first name) | What they reported | What was done |
| --- | --- | --- | --- |
| | | | |

The form's questions, as last seen (they may have changed):

1. **How did you recruit testers?** (friends and family, a community, a
   paid service)
2. **How easy was it to recruit them?**
3. **Describe the engagement you received:** how often they used the app,
   which features.
4. **Summarise the feedback and how you collected it:** the table above;
   feedback reaches support@vimetry.app and the owner directly.
5. **Who is the app for, and what value does it give them?** Adults who
   want to see what they eat beside their activity: meals logged by photo,
   in words or by hand; a weekly view with general suggestions. Not a
   medical device.
6. **How many installs do you expect in the first year?**
7. **What did you change because of the test?** From the table, plus what
   was already fixed during it: version 1 crashed on launch and was
   replaced by 1.0.1 before the closed test began; the price was lowered to
   US$4.99; a first-visit welcome and a where-to-start notice were added
   (2026-11-15).
8. **Why is the app ready for production?** The 14 days passed without a
   crash or a billing fault (check Play Console → Android vitals, and the
   daily health check, which since 2026-11-15 also verifies that purchases
   can be read from Google Play).
