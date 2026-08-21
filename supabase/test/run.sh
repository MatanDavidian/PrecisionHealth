#!/usr/bin/env bash
# Verifies the schema, its policies and its grants against a real Postgres.
#
# Uses plain Postgres plus a small auth shim rather than the full Supabase
# stack: row-level security, grants and constraints are ordinary Postgres
# features, so this proves the rules that matter in seconds and without a
# 2 GB toolchain.
#
#   ./supabase/test/run.sh          spin up a throwaway container and verify
#   PG="postgres://…" ./run.sh      verify against an existing database
#
# For a live Supabase project with no psql to hand, paste 01_verify_web.sql
# into the SQL Editor instead — same checks, pure SQL.
set -euo pipefail

cd "$(dirname "$0")/../.."
CONTAINER=timeline-pg-verify
PORT=${PGPORT:-55432}

cleanup() {
  if [ -z "${PG:-}" ]; then docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

run_sql() {
  if [ -n "${PG:-}" ]; then
    psql "$PG" -q -v ON_ERROR_STOP=1 -f "$1"
  else
    docker exec -i "$CONTAINER" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$1"
  fi
}

if [ -z "${PG:-}" ]; then
  echo "→ starting throwaway Postgres…"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify \
    -p "$PORT:5432" postgres:16-alpine >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 1
  done
  # The shim stands in for what Supabase itself provides.
  run_sql supabase/test/00_local_auth_shim.sql
fi

echo "→ applying migrations…"
for migration in supabase/migrations/*.sql; do
  echo "   $(basename "$migration")"
  run_sql "$migration"
done

echo "→ verifying invariants…"
if [ -n "${PG:-}" ]; then
  OUTPUT=$(psql "$PG" -q -f supabase/test/01_verify.sql 2>&1)
else
  OUTPUT=$(docker exec -i "$CONTAINER" psql -U postgres -q -f - \
    < supabase/test/01_verify.sql 2>&1)
fi

echo "$OUTPUT" | sed 's/psql:<stdin>:[0-9]*: NOTICE:  //' | grep -E "PASS|FAIL|^ *=="

if echo "$OUTPUT" | grep -q "FAIL"; then
  echo "✗ an invariant is not enforced"
  exit 1
fi
echo "✓ schema, policies and grants verified"
