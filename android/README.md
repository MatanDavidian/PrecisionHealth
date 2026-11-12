# The Android app

Vimetry on Android is vimetry.app in a **Trusted Web Activity** (TWA): Chrome
showing the site full-screen, under the app's own name and icon. This folder
holds only its configuration. The Android project is generated from it by
Google's **Bubblewrap**, and nothing generated is committed. The plan is in
`docs/ANDROID-APP.md`.

`twa-manifest.json` holds the choices, already made:

| Setting | Value | Why |
| --- | --- | --- |
| `packageId` | `app.vimetry` | **Permanent** once uploaded to Play |
| `startUrl` | `/?source=twa` | How the site knows it is the app: Play Billing instead of Lemon Squeezy (`src/data/playBilling.ts`) |
| `features.playBilling` | on (with `alphaDependencies`) | Google Play Billing through the Digital Goods and Payment Request APIs |
| icons | `/icons/icon-512.png`, `/icons/maskable-512.png` | From `scripts/make-icons.mjs`; replace when the logo exists |
| `minSdkVersion` | `24` (Android 7.0) | The lowest the libraries allow: Google's TWA helper needs 24, its billing module 23. Billing needs Chrome 101+ anyway |
| `enableNotifications` | on | **Required by Play Billing** (Bubblewrap refuses to build without it: the billing bridge runs through the same Android service). The app sends no notifications |
| `signingKey.path` | `../vimetry-android-upload.keystore` | Relative to the build folder `~/Projects/vimetry-android`, so the key is `~/Projects/vimetry-android-upload.keystore`: **outside the repository** |

## Building it

First built 2026-11-12 with Bubblewrap 1.27.0, the JDK 17 already on the
Mac (`~/.bubblewrap/config.json` → `jdkPath`) and the Android SDK Bubblewrap
downloaded to `~/.bubblewrap/android_sdk`.

```bash
npm install -g @bubblewrap/cli@1.27.0
mkdir -p ~/Projects/vimetry-android && cp android/twa-manifest.json ~/Projects/vimetry-android/
cd ~/Projects/vimetry-android
bubblewrap update --skipVersionUpgrade    # generates the Android project from the manifest
BUBBLEWRAP_KEYSTORE_PASSWORD=… BUBBLEWRAP_KEY_PASSWORD=… bubblewrap build --skipPwaValidation
# → app-release-bundle.aab (upload this) and app-release-signed.apk
```

Build 1 (versionCode 1, versionName 1.0.0) was made on 2026-11-12. The
upload key's SHA-256 (public; goes into `assetlinks.json`):
`DD:22:7D:E2:B7:6A:F8:42:30:5E:A9:2E:5F:2C:97:16:A7:C5:4B:80:38:34:01:0C:36:E9:86:FE:D4:6C:85:E6`

The **upload key** is `~/Projects/vimetry-android-upload.keystore` (PKCS12,
alias `upload`, one password for store and key, valid ~27 years). It was
created with `keytool`, its generated password written only to
`~/Projects/vimetry-android-upload-PASSWORD.txt` (mode 600) — the owner moves
it into a password manager, backs up the keystore, then deletes the text
file. Never commit either: `*.keystore` is ignored.

Losing the upload key is recoverable, because Google resets it on request
under **Play App Signing**, which holds the real app-signing key. So enrol in
Play App Signing when uploading the first bundle.

## Digital Asset Links: proving the app and the site belong together

**Done 2026-11-12:** `public/.well-known/assetlinks.json` holds the app
signing key (from Play Console → Protected by Play → App signing,
`38:B1:DC:91:…:CB:66`) and the upload key (`DD:22:7D:E2:…:85:E6`);
`public/_headers` serves it as JSON. Tested locally in
`e2e/installable.spec.ts` and live in `e2e-live/live.spec.ts`. The steps
below are how it was done, for when a key changes.

Without this file the app shows a browser address bar. Once the bundle is
uploaded:

1. Play Console → the app → **Test and release → App integrity → App
   signing** → copy the **SHA-256 certificate fingerprint** of the *app
   signing key*.
2. Also copy the upload key's fingerprint, printed by `bubblewrap
   fingerprint list`, so a sideloaded test build is trusted too.
3. `public/.well-known/assetlinks.json` gets both:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "app.vimetry",
       "sha256_cert_fingerprints": ["<app signing SHA-256>", "<upload SHA-256>"]
     }
   }]
   ```
4. `public/_headers` gets `Content-Type: application/json` for
   `/.well-known/assetlinks.json`. Deploy, then check
   `https://vimetry.app/.well-known/assetlinks.json` returns that JSON (not the
   app's HTML).

## Updating the app

A website deploy updates the app's content at once, with no store review.
A new bundle is needed only when this manifest changes (name, icons,
colours, features):
1. Raise `appVersionCode` (and `appVersionName`).
2. Run `bubblewrap update && bubblewrap build`.
3. Upload the new bundle.
