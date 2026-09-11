#!/usr/bin/env bash
# Does the reservation actually hold when two requests arrive together?
#
# The invariant tests in 01_verify.sql call reserve_analysis in a loop, which
# proves the counting and proves nothing about the race — a sequential test
# cannot distinguish a working lock from no lock at all. This races real
# concurrent sessions for the last slot and counts how many win.
#
#   ./supabase/test/concurrency.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
CONTAINER=timeline-pg-race
PORT=${PGPORT:-55433}
RACERS=${RACERS:-8}

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "→ starting throwaway Postgres…"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify \
  -p "$PORT:5432" postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

psql_q() { docker exec -i "$CONTAINER" psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }

psql_q -f - < supabase/test/00_local_auth_shim.sql >/dev/null
for f in supabase/migrations/*.sql; do psql_q -f - < "$f" >/dev/null; done

psql_q -c "insert into auth.users (id) values ('44444444-4444-4444-4444-444444444444');" >/dev/null

LIMIT=3
echo "→ racing $RACERS concurrent sessions for $LIMIT slots…"

# Each racer opens its own session and claims. Started in parallel and left to
# collide; the advisory lock is the only thing serialising them.
pids=()
for i in $(seq 1 "$RACERS"); do
  (
    docker exec -i "$CONTAINER" psql -U postgres -tAq -c \
      "select public.reserve_analysis(
         '44444444-4444-4444-4444-444444444444'::uuid,
         current_date, 'gpt-5.6-terra', 'MASTER_TRIAL', $LIMIT);"
  ) > "/tmp/racer-$i.out" 2>/dev/null &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p" || true; done

GRANTED=$(cat /tmp/racer-*.out 2>/dev/null | grep -c . || true)
ROWS=$(docker exec -i "$CONTAINER" psql -U postgres -tAq -c \
  "select count(*) from public.usage where outcome = 'RESERVED';" | tr -d '[:space:]')
rm -f /tmp/racer-*.out

echo
echo "  granted (non-null returns): $GRANTED"
echo "  RESERVED rows in the table: $ROWS"
echo "  the limit was:              $LIMIT"
echo

if [ "$ROWS" = "$LIMIT" ] && [ "$GRANTED" = "$LIMIT" ]; then
  echo "✓ exactly $LIMIT of $RACERS concurrent claims were granted"
else
  echo "✗ the limit did not hold under concurrency"
  exit 1
fi
