# Deploying

**Live at [vimetry.app](https://vimetry.app)**,
deploying from `main` on every push.

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

- **Site URL:** `https://vimetry.app` — the custom domain, not the
  `pages.dev` one. This is the host Supabase puts in magic-link emails, so a
  stale value signs people in on the wrong origin, against a different local
  store, with nothing on screen to say so.
- **Redirect URLs:** add
  - `http://localhost:5173/**` so local development keeps working
  - `https://vimetry.app/**`
  - `https://*.<project>.pages.dev/**` so preview deployments keep working

## Checking a deploy

```bash
curl -I https://vimetry.app/today
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


## Verified on first deploy (Aug 2026)

| Check | Result |
|---|---|
| `/today`, `/signin`, `/nutrition`, `/log`, `/settings` on a hard load | 200 — the rewrite works |
| `index.html` cache | `max-age=0, must-revalidate` |
| `/assets/*` cache | `max-age=31536000, immutable` |
| Supabase project compiled into the bundle | yes — env vars were set at build time |
| Landing route on a phone viewport | `/log`, camera button present |
| Signed out | local sample day, as designed |
| Signed in | reads from Postgres, no sample day, account shown in Settings |
| Console errors | none |

One thing that looked like a bug and was not: driving the site with a session
minted milliseconds earlier produced `JWT issued at future` and a 401, because
the client validates `iat` against its own clock and sub-second skew between
Supabase's auth server and the browser is enough. Real sign-ins never hit it —
the token arrives through the redirect or `verifyOtp`, not from a script racing
its own request. The machine's clock was checked and is within a second of
internet time; a fresh token gets 200 from PostgREST directly.


## The custom domain

`vimetry.app` is registered at **Porkbun** and its DNS is delegated to
**Cloudflare** — `heidi.ns.cloudflare.com` and `norm.ns.cloudflare.com`, and
those two ONLY. Leaving the registrar's own nameservers alongside them is the
mistake to avoid: nameservers are a set of equally authoritative servers, not a
fallback chain, so a resolver picking a Porkbun one would get the parking page.
The site would then work for some visitors and not others, with no pattern, and
Cloudflare would never finish activating the zone.

**`.app` is on the HSTS preload list.** Browsers refuse plain HTTP for the
entire TLD, so between pointing DNS and the certificate being issued the site
is *unreachable* rather than merely insecure. That is expected, and it is also
a real property worth having: no visitor to this app can ever be downgraded to
an unencrypted connection.

### Still to do

- **Redirect `www` to the apex.** A Cloudflare Redirect Rule,
  `www.vimetry.app/*` → `https://vimetry.app/$1` (301). Both currently serve
  the app, which means two origins, two local stores, two auth origins and
  duplicate content. The apex is canonical.
- **Redirect the `pages.dev` address to the apex** for the same reason, keeping
  the `*.pages.dev` wildcard in Supabase's redirect list so preview
  deployments still work.
