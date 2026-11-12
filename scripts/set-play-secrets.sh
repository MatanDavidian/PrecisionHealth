#!/usr/bin/env bash
# Connect the functions to Google Play Billing (docs/ANDROID-APP.md, step 4).
#
#   ./scripts/set-play-secrets.sh ~/Downloads/<service-account-key>.json
#
# 1. Checks the file is a service account's JSON key, and prints only the
#    account's email (which is not secret) for Play Console's invite.
# 2. Sets it as GOOGLE_PLAY_SERVICE_ACCOUNT.
# 3. Makes the secret for the Pub/Sub push URL (GOOGLE_PLAY_RTDN_TOKEN) and
#    copies the whole push URL to the clipboard for Cloud Console's
#    subscription form. It is never printed.
#
# Run again with a new key at any time; the push token is kept unless you ask
# for a new one (the Pub/Sub subscription must then be updated too).
# DRY_RUN=1 checks the file and stops before setting anything.
set -euo pipefail
cd "$(dirname "$0")/.."

KEY_FILE=${1:-}
if [ -z "$KEY_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  echo "usage: $0 path/to/service-account-key.json"
  exit 1
fi

EMAIL=$(python3 - "$KEY_FILE" <<'PY'
import json, sys
try:
    key = json.load(open(sys.argv[1]))
except Exception:
    sys.exit("✗ not a JSON file")
if key.get("type") != "service_account" or not key.get("private_key") or not key.get("client_email"):
    sys.exit("✗ not a service account key (Cloud Console → IAM → Service accounts → Keys → Add key → JSON)")
print(key["client_email"])
PY
)
echo "✓ a service account key for: $EMAIL"
echo "  Play Console → Users and permissions → Invite new users → this email,"
echo "  with access to Vimetry: View financial data, Manage orders and subscriptions."
[ "${DRY_RUN:-}" = "1" ] && { echo "(dry run: nothing set)"; exit 0; }

REF=$(cat supabase/.temp/project-ref)
echo "→ setting GOOGLE_PLAY_SERVICE_ACCOUNT"
npx supabase secrets set "GOOGLE_PLAY_SERVICE_ACCOUNT=$(cat "$KEY_FILE")" >/dev/null

NEW_TOKEN=yes
if npx supabase secrets list 2>/dev/null | grep -q GOOGLE_PLAY_RTDN_TOKEN; then
  read -r -p "A push token already exists. Make a new one (the Pub/Sub subscription must then be edited)? [y/N] " answer
  [ "$answer" = "y" ] || NEW_TOKEN=no
fi
if [ "$NEW_TOKEN" = "yes" ]; then
  TOKEN=$(openssl rand -hex 24)
  npx supabase secrets set "GOOGLE_PLAY_RTDN_TOKEN=$TOKEN" >/dev/null
  URL="https://$REF.supabase.co/functions/v1/play-rtdn?token=$TOKEN"
  printf '%s' "$URL" | pbcopy
  [ "$(pbpaste)" = "$URL" ] || { echo "✗ could not put the push URL on the clipboard"; exit 1; }
  echo "✓ the push URL is on the clipboard. Paste it straight away as the Endpoint URL of the"
  echo "  Pub/Sub push subscription (Cloud Console → Pub/Sub → the topic → Create subscription → Push)."
  read -r -p "  Pasted it? Press Enter to clear the clipboard. " _
  printf '' | pbcopy
  unset TOKEN URL
fi
echo "✓ done. Now delete the key file: rm \"$KEY_FILE\""
