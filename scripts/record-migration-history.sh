#!/usr/bin/env bash
# One time: tell the Supabase CLI which migrations production already has.
#
#   ./scripts/record-migration-history.sh
#
# Migrations 0001–0012 were pasted into the SQL editor, so the CLI's history
# table does not know about them, and `supabase db push` would try to apply
# them all again. Production was checked on 2026-10-02 (read-only probes):
# every object from 0001–0011 exists; 0012 and 0013 were run by hand that day,
# and 0013's health_missing() was confirmed present and refused to non-admins.
set -euo pipefail
cd "$(dirname "$0")/.."

APPLIED=(0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013)

echo "The DATABASE password: Supabase → Project Settings → Database."
echo "(Not your Supabase login. It is read once and not stored.)"
read -r -s -p "Database password: " SUPABASE_DB_PASSWORD
echo
export SUPABASE_DB_PASSWORD

echo
echo "→ before"
npx supabase migration list

echo
read -r -p "Record 0001–0013 as already applied? [y/N] " answer
[ "$answer" = "y" ] || { echo "Nothing changed."; exit 0; }
npx supabase migration repair --status applied "${APPLIED[@]}"

echo
echo "→ after — expect 0001–0013 on both sides, nothing pending:"
npx supabase migration list
echo
echo "Done. From now on ./scripts/deploy-functions.sh applies only new migrations."
