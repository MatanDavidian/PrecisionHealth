# Browser tests

```sh
npm run test:e2e        # headless, both viewports
npm run test:e2e:ui     # the picker, for writing new ones
```

Runs against `vite preview` — the production build, not the dev server, because
the bugs worth catching are the ones that reach a user.

## Why these exist

Vitest covers 330 cases and caught **none** of the defects found while building
this app. Every one of them was invisible to it:

| Defect | Why a unit test could not see it |
| --- | --- |
| Photo taken, nothing happened until you tapped elsewhere | a state update gated behind a decode that stalls |
| React #310 — hooks after an early return | render order, not logic |
| `setState` inside a `setState` updater | the write silently did nothing |
| Language came back `undefined` | an IndexedDB read whitelist |
| Day/Week switch jumped 209px | identical DOM, different layout |
| Settings tabs stepped 20px | text length, in one language only |
| The "this number moved" mark had **never** rendered | two CSS utilities, resolved by stylesheet order |

The specs here cover the last three, plus Refill, past-day logging, leftovers,
the week numbers, the weight goal, and — since there is now an account to sign
into — auth and the free trial.

## The rule these follow

**Assert computed values, not pixels.** Positions, colours, field contents. A
screenshot baseline rots into "just re-approve it"; a measured position does
not. `documentBox` in `app.ts` measures against the document rather than the
viewport, because viewport coordinates let a test pass when the page happened to
scroll by exactly the amount an element moved — which really happened while
these were being written, reporting a control as stable at `y=0` while it was
being pushed off the top of the screen.

**A new spec has to fail on the old code.** These were checked by rolling
`Today.tsx` and `Settings.tsx` back to the commit before the fix: 5 of 6 failed,
and the one that passed was the desktop settings-tab case — which is right,
because that bug only ever affected the phone. A test that cannot fail is
decoration.

**Switch language through the UI.** `switchToHebrew` clicks the control. An
earlier attempt to seed `localStorage.lang` did nothing at all — the language
lives in IndexedDB — and the tests ran in English while reporting on Hebrew.

## Fixtures

`?fake=1` swaps in a fixed day and a fake estimator, so no test touches Supabase
or OpenAI. That is what lets the numbers be asserted exactly. `&slow=6000` slows
the fake estimator down when a waiting state needs to be visible.

### An account, without an account

`supabase.ts` stands a whole project up inside the browser tab: `page.route`
answers every `auth/v1`, `rest/v1` and `functions/v1` call, and anything
Supabase-shaped that it does not recognise is **aborted rather than fulfilled**,
so a missing stub shows up as a broken screen instead of passing quietly. It is
also why no run can reach the real project by accident, even though the build
carries its URL.

The seam is the network on purpose. A `?signedIn=1` flag would have been less
code and would have covered less: `readTrialStatus` reads its count out of a
PostgREST `content-range` header, and a fake that skips the request can never
catch that header being read wrong. Here the app really builds the URL, sets the
headers, parses the reply and reacts — only the far end is ours.

`signIn(page, options)` fills the real form rather than seeding a session, for
the same reason `switchToHebrew` clicks the real control. `options` chooses what
the far end says: how much trial is spent, whether the code is rejected, whether
the analysis endpoint refuses or cannot be reached at all.

**Read the store, not just the screen.** `weight-goal.spec.ts` opens IndexedDB
to check a goal's `direction`, which is drawn nowhere — a page-only test would
have watched every weight goal being written as unattainable and said nothing.
When you do that, order by what the domain orders by: `getAll` returns rows in
key order, the keys are random ids, and taking the last row was right about two
thirds of the time.
