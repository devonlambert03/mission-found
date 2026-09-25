#!/usr/bin/env bash
# Run the migration, seed, and RLS tests against a throwaway database on a
# plain local PostgreSQL (with pgTAP installed), for machines without Docker.
# The real path is `supabase db reset && supabase test db` — see app/README.md.
#
# Usage: scripts/rls-local/run.sh [dbname]   (uses psql defaults for host/user)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${1:-mf_rls_local}"
dropdb --if-exists "$DB"
createdb "$DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f scripts/rls-local/supabase_shim.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"; done
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/seed.sql
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/seed.sql   # second run proves the seed is idempotent
pg_prove -d "$DB" supabase/tests/*.sql
