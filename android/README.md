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
| `signingKey.path` | `../../vimetry-android-upload.keystore` | **Outside the repository**, next to it |

## Building it (once the Play Console account is verified)

Bubblewrap installs its own JDK and Android SDK the first time (about 1 GB),
asking before each.

```bash
npm install -g @bubblewrap/cli        # pin the version that is current then
mkdir -p ../vimetry-android && cp android/twa-manifest.json ../vimetry-android/
cd ../vimetry-android
bubblewrap update                     # generates the Android project from the manifest
bubblewrap build                      # → app-release-bundle.aab (+ an APK for testing)
```

The first build asks to create the **upload key**:
- It is a keystore file and two passwords.
- Keep the file and both passwords in a password manager.
- Never commit them: `*.keystore` is ignored.

Losing the upload key is recoverable, because Google resets it on request
under **Play App Signing**, which holds the real app-signing key. So enrol in
Play App Signing when uploading the first bundle.

## Digital Asset Links: proving the app and the site belong together

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
