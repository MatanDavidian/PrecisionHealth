# Deploying

The app is a static bundle plus Supabase, so hosting only has to serve files
over HTTPS — and, later, run a function or two for the WhatsApp webhook and
the server-side AI proxy. **Cloudflare Pages** is the choice (see below for
why), on its free tier.

## Why Cloudflare Pages

GitHub Pages would serve the files, but this app needs two things it cannot do:

- **Deep links.** The app uses `BrowserRouter`, so `/today` is a route the
  client resolves — there is no file there. A refresh or a shared link 404s
  without a rewrite rule, and GitHub Pages has none. Here it is one line in
  [`public/_redirects`](../public/_redirects).
- **Server-side code, eventually.** The roadmap parks a WhatsApp webhook and an
  AI proxy so family members do not each need an OpenAI key. Pages serves
  files, full stop; Cloudflare Workers are on the same free tier.

Vercel and Netlify both work equally well, with one caveat: Vercel's Hobby tier
prohibits commercial use, which would bite exactly when this stops being a
personal project.

## One-time setup

1. **[dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages →
   Create → Pages → Connect to Git** → authorise GitHub → pick
   `MatanDavidian/PrecisionHealth`.

2. **Build settings:**

   | Setting | Value |
   |---|---|
   | Framework preset | None (or Vite) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | `/` |

   Node version comes from [`.nvmrc`](../.nvmrc). If a build ever fails on an
   old Node, set `NODE_VERSION` as an environment variable to match.

3. **Environment variables** — Settings → Environment variables → Production
   (and Preview, if you want preview builds to work):

   ```
   VITE_SUPABASE_URL        https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY   sb_publishable_…
   ```

   These are **baked into the bundle at build time**, not read at runtime, so a
   build without them produces an app with no backend — it still runs, but
   signing in is not offered. Both are public by design (D16): the key grants
   only what Row-Level Security allows.

   Do **not** add `SUPABASE_TEST_EMAIL` / `SUPABASE_TEST_PASSWORD`. They exist
   for the contract tests and have no business in a deployed bundle.

4. **Deploy.** Every push to `main` builds and deploys; pull requests get
   their own preview URL.

## Then tell Supabase about the new origin

Sign-in links redirect to whatever Supabase is configured with, so until this
is done the link in your email will bounce you back to `localhost`.

**Authentication → URL Configuration:**

- **Site URL:** `https://<project>.pages.dev` — the deployed app is now the
  real one.
- **Redirect URLs:** add
  - `http://localhost:5173/**` so local development keeps working
  - `https://*.<project>.pages.dev/**` so preview deployments work too

## Checking a deploy

```bash
curl -I https://<project>.pages.dev/today
```

`200` with `content-type: text/html` means the rewrite is working — a `404`
means `_redirects` did not reach `dist`.

Then in the browser: sign in, log a meal, and open the same URL on your phone.
Same account, same data, which is the whole point of slice 3.

## Caching

[`public/_headers`](../public/_headers) caches `/assets/*` forever — Vite
fingerprints those filenames, so each only ever describes one build — while
`index.html` is never cached, because it is the file that points at the current
asset names. A stale copy of it would pin a browser to a previous deploy.
