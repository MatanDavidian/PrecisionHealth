# Feature spec — a new visitor's first photo

**One line:** a signed-out visitor takes a photo, is asked to sign in at
that moment with the photo kept, and comes back to it being analysed, with
no dead end.

Status: **built 2026-11-17** (option B, chosen by the owner the same day).
Tests: `e2e/first-photo.spec.ts` (held, sign-in with the photo waiting,
nothing sent before consent, read by itself after, words as well as photos,
the Android app without the own-key link, Hebrew). Found while building:
the Android app was remembered only if a screen asked while `?source=twa`
was still in the address; it is now stored at start-up (`main.tsx`).
Epic 1 in [`../ROADMAP.md`](../ROADMAP.md). Mock-ups: a clickable design
canvas of eight screens, five in English and three in Hebrew, kept with the
owner.

---

## The problem, as seen on the live site (2026-11-17)

A new visitor, signed out, on the website:

1. **Before the photo:** the only explanation is a "One-time setup" card
   below the camera, off the first screen, and it opens with "your own
   OpenAI key", not with the 10 free analyses.
2. **After the photo:** the photo is shown with a red **"No API key
   configured"**, a **"Try again"** that can never succeed, and nothing about
   signing in or the free analyses. A dead end, on the most important tap in
   the app.

## The two options, and the choice

- **A. One or two free analyses before any sign-up**, then ask. The best
  first minute, but an anonymous account per browser, a robot check and
  per-device limits against abuse, a consent step without an account, and a
  Privacy Policy change: about 3–4 days.
- **B. Ask at the right moment and keep the photo.** About a day, with no
  new cost, abuse or legal surface. **Chosen.** If real visitors drop off at
  the sign-in step in numbers, A can be built on top later; B's screen stays
  useful as the step after the free analyses.

## What it does

1. **Before** (mock-up 1): under the camera, one line in place of the
   off-screen card: "10 free analyses come with a free account. Take the
   photo first; we'll ask for your email when it's time to read it." Logging
   by hand is said to be always free.
2. **The photo is ready** (mock-up 2): the photo, and one card: "Your photo
   is ready. Sign in with your email to analyse it. 10 analyses are free: no
   card, no password, we email you a code." The main button is **Continue
   with email**; then "Log it by hand" and "Discard photo"; and, on the
   website only, a small "Have an OpenAI key? Use your own instead". **No
   analysis is attempted**, so there is no wait and no error.
3. **Sign in** (mock-up 3): the existing sign-in screen, with the photo as a
   small thumbnail at the top: "Your photo is waiting. It is analysed as
   soon as you're signed in." After the code: "Sign in and analyse my
   photo".
4. **Back** (mock-up 4): the consent step comes first for a new account (as
   today: the photo goes to the model only after the Privacy Policy is
   agreed to). Then the Log screen, "Signed in. 10 free analyses, and this is
   the first.", and the photo is already being read, with no extra tap.
5. **A meal in words** (mock-up 5): the same, with what was written kept in
   place of the photo.

**Android app:** the same, without the own-key link (Google Play's payment
rules), as the app already does elsewhere.

**Hebrew:** mock-ups 6–8, in the app's own wording ("התמונה מוכנה",
"המשך עם אימייל", "שלחו לי קוד במייל").

## Code design

- **The decision before analysing:** signed out and no own key means the
  photo (or text) is held, not sent: the hold the app already has for
  "auto-analyse off" (`held` in `Log.tsx`), with the new card in place of
  the Analyse button.
- **Keeping the photo through sign-in:** already built for an expired
  session (`e2e/trial.spec.ts`, "a session that ended mid-analysis"): the
  photo and its details survive the round trip to `/signin?next=/log`. This
  reuses it, and adds a flag so that coming back **starts** the analysis
  instead of only offering it.
- **The dead end goes:** the "No API key configured" error can no longer be
  reached by a signed-out visitor; if it is reached some other way, it says
  what to do and offers the same sign-in.
- **Tests:** a browser test for each step (photo held, sign-in with the
  thumbnail, analysis started on return, the consent step in between for a
  new account), for words as well as photos, in both languages, and in the
  Android app (no own-key link). The accessibility scan on the new card.

Size: about 1 day.
