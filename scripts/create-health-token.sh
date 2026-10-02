#!/usr/bin/env bash
# One time: create the health check's secret and put it where it is needed.
#
#   ./scripts/create-health-token.sh
#
# Generates a random token and sets it in the two places that can do it from
# here: the Supabase function secret, and .env.local (gitignored) for local
# runs. The third place, GitHub, has no CLI on this machine — so the token is
# copied to the clipboard for pasting. It is never printed.
set -euo pipefail
cd "$(dirname "$0")/.."

if grep -q '^HEALTH_TOKEN=' .env.local 2>/dev/null; then
  echo "✗ .env.local already has a HEALTH_TOKEN. Remove that line first if you mean to replace it."
  exit 1
fi

TOKEN=$(openssl rand -hex 32)

echo "→ setting it as a Supabase function secret"
npx supabase secrets set HEALTH_TOKEN="$TOKEN" >/dev/null
echo "→ adding it to .env.local"
printf '\nHEALTH_TOKEN=%s\n' "$TOKEN" >> .env.local
printf '%s' "$TOKEN" | pbcopy

echo
echo "✓ Copied to the clipboard. Now in GitHub:"
echo "  repository → Settings → Secrets and variables → Actions → Secrets tab"
echo "  → New repository secret → Name: HEALTH_TOKEN → paste → Add secret"
echo
echo "Then copy something else, so the token does not stay on the clipboard."
