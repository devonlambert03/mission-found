#!/usr/bin/env bash
# Fails if a server-only secret appears in any browser-served file.
# Browser-served = everything tracked by git except /api, /supabase, /scripts
# and the Node package files. Run before every PR that touches the site:
#   scripts/check-no-secrets.sh
set -euo pipefail
cd "$(dirname "$0")/.."

mapfile -t FILES < <(git ls-files --cached --others --exclude-standard -- '*.html' '*.js' '*.mjs' '*.css' '*.json' '*.webmanifest' '*.txt' \
  | grep -vE '^(api|supabase|scripts)/|^package(-lock)?\.json$')

fail=0

# 1. Key formats that must never reach a browser: Supabase secret keys,
#    Resend API keys, Stripe secret/restricted keys, and server env access.
if grep -nE 'sb_secret_|(^|[^A-Za-z0-9])re_[A-Za-z0-9_]{20,}|(sk|rk)_(live|test)_|process\.env' "${FILES[@]}"; then
  echo "^ server-only secret or process.env found in a browser-served file" >&2
  fail=1
fi

# 2. Legacy Supabase keys are JWTs. The anon key is public by design; a JWT
#    whose role is service_role is the admin key and must never be here.
while read -r jwt; do
  [ -z "$jwt" ] && continue
  payload=$(printf '%s' "$jwt" | cut -d. -f2 | tr '_-' '/+')
  while [ $(( ${#payload} % 4 )) -ne 0 ]; do payload="${payload}="; done
  if printf '%s' "$payload" | base64 -d 2>/dev/null | grep -q '"role" *: *"service_role"'; then
    echo "service_role JWT found in a browser-served file: ${jwt:0:20}..." >&2
    fail=1
  fi
done < <(grep -ohE 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' "${FILES[@]}" | sort -u)

if [ "$fail" -eq 0 ]; then
  echo "OK: no server-only secrets in ${#FILES[@]} browser-served files."
fi
exit "$fail"
