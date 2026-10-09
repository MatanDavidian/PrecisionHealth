#!/usr/bin/env bash
# Connect the functions to Lemon Squeezy: run once in test mode, and again when going live.
#
#   ./scripts/set-billing-secrets.sh test    # test mode — test purchases only
#   ./scripts/set-billing-secrets.sh live    # live mode — real money
#
# Makes the webhook's signing secret and copies it to the clipboard for
# Lemon Squeezy's webhook form, then asks for the API key (hidden), the store
# id and the variant id, and sets all of them as Supabase function secrets.
# Nothing secret is printed. Steps: docs/ops/payments.md.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE=${1:-}
if [ "$MODE" != "test" ] && [ "$MODE" != "live" ]; then
  echo "usage: $0 test|live"
  exit 1
fi

SECRET=$(openssl rand -hex 32)
printf '%s' "$SECRET" | pbcopy
REF=$(cat supabase/.temp/project-ref 2>/dev/null || echo '<project-ref>')
echo "1. The webhook's signing secret is on the clipboard."
echo "   Lemon Squeezy ($MODE mode) → Settings → Webhooks → + :"
echo "     Callback URL:   https://$REF.supabase.co/functions/v1/lemonsqueezy-webhook"
echo "     Signing secret: paste"
echo "     Events:         subscription_created, subscription_updated, subscription_cancelled,"
echo "                     subscription_resumed, subscription_expired, subscription_paused,"
echo "                     subscription_unpaused, subscription_payment_success,"
echo "                     subscription_payment_refunded, order_refunded"
read -r -p "   Saved the webhook? [y/N] " answer
[ "$answer" = "y" ] || exit 1

echo
echo "2. Lemon Squeezy ($MODE mode) → Settings → API → + : create a key and copy it."
read -r -s -p "   Paste the API key (hidden): " API_KEY
echo
[ -n "$API_KEY" ] || { echo "✗ no key"; exit 1; }
read -r -p "3. Store id (Settings → Stores, the number by the store's name): " STORE_ID
read -r -p "4. Variant id of Vimetry Monthly (Products → the product → ⋯ → Copy variant ID): " VARIANT_ID
[[ "$STORE_ID" =~ ^[0-9]+$ && "$VARIANT_ID" =~ ^[0-9]+$ ]] || { echo "✗ both ids are numbers"; exit 1; }

echo "→ setting the function secrets"
npx supabase secrets set \
  LEMONSQUEEZY_WEBHOOK_SECRET="$SECRET" \
  LEMONSQUEEZY_API_KEY="$API_KEY" \
  LEMONSQUEEZY_STORE_ID="$STORE_ID" \
  LEMONSQUEEZY_VARIANT_ID="$VARIANT_ID" >/dev/null
if [ "$MODE" = "test" ]; then
  npx supabase secrets set LEMONSQUEEZY_TEST_MODE=1 >/dev/null
else
  npx supabase secrets unset LEMONSQUEEZY_TEST_MODE >/dev/null 2>&1 || true
fi
printf '' | pbcopy
echo "✓ done ($MODE mode). The clipboard has been cleared."
