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

The specs here cover the last three, plus Refill and past-day logging.

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
