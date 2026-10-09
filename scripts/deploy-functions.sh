#!/usr/bin/env bash
# Deploy every Supabase function — migrations first — then prove it worked.
#
#   ./scripts/deploy-functions.sh
#
# One command because four separate ones went wrong twice: `estimate-food`
# went live ahead of the migrations it calls (analysis down for a week), and
# `device-sync` needs `--no-verify-jwt` or every watch sync is refused.
#
# Needs the project linked once (`npx supabase link`) and migration history
# set up once — see "Migrations" in supabase/README.md.
set -euo pipefail
cd "$(dirname "$0")/.."

FUNCTIONS_WITH_USER_JWT=(estimate-food delete-account issue-device-token billing)
# No user JWT: the watch carries a device token, the health check a health
# token, and Lemon Squeezy a signature.
FUNCTIONS_WITHOUT_JWT=(device-sync health lemonsqueezy-webhook)

# 1. Only committed code, so the version stamp means something.
if ! git diff --quiet HEAD -- supabase/; then
  echo "✗ uncommitted changes under supabase/ — commit them first"
  exit 1
fi
VERSION=$(git log -1 --format=%H -- supabase/functions)
git fetch -q origin main || true
if ! git merge-base --is-ancestor "$VERSION" origin/main 2>/dev/null; then
  echo "! ${VERSION:0:7} is not on origin/main — the daily check compares against main and will report this deploy as unexpected."
  read -r -p "  Deploy anyway? [y/N] " answer
  [ "$answer" = "y" ] || exit 1
fi

# 2. Nothing ships that does not type-check.
echo "→ type-checking functions"
npm run -s check:functions >/dev/null

# 3. Migrations before the code that depends on them.
echo "→ applying pending migrations"
echo "  Supabase will list what it is about to apply. It must be ONLY new migrations."
echo "  If it lists 0001, answer n and do the one-time setup in supabase/README.md → Migrations."
npx supabase db push

# 4. Stamp, deploy, and always restore the stamp.
VERSION_FILE=supabase/functions/_shared/version.ts
trap 'git checkout -- "$VERSION_FILE"' EXIT
sed -i.bak "s/export const VERSION = 'dev'/export const VERSION = '$VERSION'/" "$VERSION_FILE"
rm -f "$VERSION_FILE.bak"
grep -q "$VERSION" "$VERSION_FILE" || { echo "✗ could not stamp the version"; exit 1; }

echo "→ deploying ${VERSION:0:7}"
for fn in "${FUNCTIONS_WITH_USER_JWT[@]}"; do npx supabase functions deploy "$fn"; done
for fn in "${FUNCTIONS_WITHOUT_JWT[@]}"; do npx supabase functions deploy "$fn" --no-verify-jwt; done

# 5. Prove it: every function answers with this version, and health is green.
echo "→ checking"
node scripts/check-health.mjs --after-deploy
