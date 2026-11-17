# Performance and load

**One line:** the app is fast on a slow phone, and the servers are nowhere
near their limits. What limits how many people Vimetry can serve on a busy
day is money, not machines: the daily spend ceiling on AI analyses, which is
set by hand and can be raised in a minute.

Measured 2026-11-17, against vimetry.app at `e32795d`.

---

## How the app is built, for speed

- **A static site on Cloudflare's edge.** The app is HTML, one script and one
  stylesheet, served from the nearest of Cloudflare's data centres. Script
  and style files have content-hashed names and are cached for a year; the
  page itself is re-checked on every visit, so a deploy is seen at once.
- **Offline-first.** Everything a person logs is written to the browser's own
  database first and synced after, so logging never waits for the network,
  and the screens read from the device.
- **Installed, it starts from the cache.** The service worker keeps the app on
  the phone; a second visit downloads almost nothing.
- **The server SDK loads on demand** (`src/data/supabase/client.ts`), only
  when an account is signed in.

## The app on a phone

Three cold visits per profile to `/today`, on an emulated Pixel 7.

| Network | Downloaded | First paint | Screen ready | Second visit |
| --- | --- | --- | --- | --- |
| Fast (Wi-Fi) | 224 KB | 0.3 s | 0.4 s | 0.1 s |
| Slow 4G (1.6 Mbit/s, 150 ms) and a CPU 4× slower | 224 KB | 1.4 s | 2.2 s | 0.25 s |

Time to first byte was 40–110 ms from Cloudflare's edge. Google's guidance
for a good first paint is under 1.8 s; the slow-phone run is inside it.

**The build** (`vite build`):

| File | Size | Compressed |
| --- | --- | --- |
| The app (`index-*.js`) | 551 KB | 164 KB |
| The server SDK, on demand | 215 KB | 56 KB |
| Styles | 36 KB | 8 KB |

The app is one script. The build warns above 500 KB; splitting off the
screens a first visit does not need (Settings, the week's charts, sign-in)
would take a third or so off the first download. Worth doing before the
script grows much further, not urgent at 2.2 s on a slow phone.

## Analysing a meal

The slow step anywhere in the app, and it is the AI model's time, not
Vimetry's. From [`../ops/model-evaluation.md`](../ops/model-evaluation.md):
a photo takes about 4.5 s on `gpt-6.1-sol` (the default) and 2.8 s on
`gpt-6.1-terra`; the screen says "usually about 15 seconds" to leave room for
a slow connection and a large photo. The server adds two small database
calls around the model call (reserve, then settle), each a few milliseconds.

Requests do not queue behind each other: each analysis is its own server
function call. At the volume the daily ceiling allows (a few hundred
analyses a day, below), OpenAI's per-minute rate limits are not the
constraint; they are worth checking in OpenAI's dashboard before raising the
ceiling a long way.

## How many people at once

| Layer | What it can take | What Vimetry asks of it |
| --- | --- | --- |
| The site (Cloudflare Pages) | Static files from a global cache; no practical limit on visitors | Every visit after the first is mostly served from the phone |
| Logging, reading, syncing (Supabase) | Postgres behind PostgREST; each request is a single indexed query by user and date | Most of it happens on the device; the server sees a sync now and then |
| Analyses (server functions, then OpenAI) | Each call independent, scaled by Supabase | **Bounded on purpose by the daily ceiling** |
| Data per person | Tested to 50,000 meals (25 years at 5 a day): the export reads every row, past PostgREST's 1,000-row pages, and still builds on a phone (`src/data/__tests__/exportAtScale.test.ts`) | The largest account today, the test account, has about 2,000 |

### The real ceiling: the daily AI budget

- **Free trials share $10 a day** (the function secret `DAILY_BUDGET_MICROS`,
  in millionths of a dollar; $10 when unset). At about
  $0.11 an analysis on the default model, that is **about 90 analyses a
  day**, roughly 9–10 new people trying all 10 of their free ones. Past it,
  free analyses are refused for the rest of the day (UTC); logging by hand
  and everything else keep working.
- **Subscribers have their own $50 a day** (`PLAN_DAILY_BUDGET_MICROS`), so a
  rush of trials never blocks someone who pays: about 450 analyses a day.
- **On a launch day, or after a post that brings visitors,** raise the trial
  ceiling first: it is a function secret, changed in the Supabase dashboard,
  no deploy. Lower it again after. The daily health check reports the day's
  spend against it.

This is deliberate: open sign-up with free analyses has no other upper bound
on cost. It is also the first thing to watch as testers grow.

## What was not measured, and how to

**A load test against production was not run.** Each analysis costs real
money and real rate limit, and a synthetic flood would land in production's
tables. The safe way, when it is worth doing (before a public launch, or at a
few hundred active people):

1. A second Supabase project as staging, with the same migrations and the
   fake model in place of OpenAI.
2. A load tool (k6, or Postman's performance runner) driving sign-in, sync
   and analysis at 10×, then 50×, the busiest real hour.
3. Watch the p95 response time, the error rate and the database's connection
   count; the first to bend is the limit to plan around.

**Not measured here either:** Supabase's own quotas for the project's plan
(database size, egress, function invocations). They are in the Supabase
dashboard, under Usage; at today's size they are far from any limit, and the
dashboard is the place to check before they are not.

## Keeping it fast

- The browser tests already guard the slow paths that matter to people: the
  analysis wait is shown and can be left open, sync never blocks the screen.
- Re-measure this page's two tables before each major release, the same way:
  three cold visits, a fast and a slow-4G profile.
- Anything that adds a large library should load on demand, as the server
  SDK does.
