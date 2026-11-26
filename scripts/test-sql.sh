#!/usr/bin/env bash
# Runs the Supabase migration + SQL tests against a throwaway local PostgreSQL 16 cluster.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
BASE="${SQL_TEST_TMP:-/tmp/claude-0/-home-user/1d249765-b201-5014-a2c3-053addff0934/scratchpad}"
mkdir -p "$BASE"
# the cluster runs as user "postgres" when invoked as root – it must be able to reach the directory
if [ "$(id -u)" = "0" ] && ! su postgres -s /bin/bash -c "test -x '$BASE'" 2>/dev/null; then
  BASE="$(dirname "$(mktemp -u)")"
fi
DIR="$(mktemp -d "$BASE/pgtest.XXXXXX")"
PORT="${PG_TEST_PORT:-54329}"

# initdb refuses to run as root → run the cluster as the postgres user
if [ "$(id -u)" = "0" ]; then
  chown postgres "$DIR"
  chmod 755 "$BASE" "$DIR"
  cp "$ROOT/supabase/test/auth_stub.sql" "$ROOT/supabase/migrations/20261126000000_social.sql" "$ROOT/supabase/test/social_test.sql" "$DIR/"
  chown postgres "$DIR"/*.sql
  run() { su postgres -s /bin/bash -c "$*"; }
else
  cp "$ROOT/supabase/test/auth_stub.sql" "$ROOT/supabase/migrations/20261126000000_social.sql" "$ROOT/supabase/test/social_test.sql" "$DIR/"
  run() { bash -c "$*"; }
fi

cleanup() {
  run "'$BIN/pg_ctl' -D '$DIR/data' -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT

run "'$BIN/initdb' -D '$DIR/data' -U postgres -A trust >/dev/null"
run "'$BIN/pg_ctl' -D '$DIR/data' -o '-p $PORT -k $DIR -c listen_addresses=' -l '$DIR/log' -w start >/dev/null"

PSQL="PGOPTIONS='-c client_min_messages=warning' '$BIN/psql' -X -q -v ON_ERROR_STOP=1 -h '$DIR' -p $PORT -U postgres -d postgres"
run "$PSQL -f '$DIR/auth_stub.sql'"
echo "▶ migration (1st run)"
run "$PSQL -f '$DIR/20261126000000_social.sql'"
echo "▶ migration (2nd run – idempotency)"
run "$PSQL -f '$DIR/20261126000000_social.sql'"
echo "▶ tests"
run "$PSQL -f '$DIR/social_test.sql'"
echo "SQL TESTS PASSED"
