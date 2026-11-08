#!/usr/bin/env bash
# Post-deploy smoke test for domain-drop-watcher.
# Usage: ./scripts/smoke.sh <worker-url> <admin-token>
#   e.g. ./scripts/smoke.sh https://domain-drop-watcher.acme.workers.dev kJ7mN2qF...
#
# Hits every unauthenticated + authenticated route and reports pass/fail.
# Exits 0 on all-pass, non-zero otherwise.

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <worker-url> <admin-token>"
  exit 2
fi

URL="${1%/}"
TOKEN="$2"

PASS=0
FAIL=0

run() {
  local label="$1" expected_code="$2" method="$3" path="$4" auth="$5"
  local code
  if [[ "$auth" == "auth" ]]; then
    code=$(curl -sS -o /dev/null -w "%{http_code}" -X "$method" \
      -H "Authorization: Bearer $TOKEN" "$URL$path") || code="???"
  else
    code=$(curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$URL$path") || code="???"
  fi
  if [[ "$code" == "$expected_code" ]]; then
    printf '  \033[32mPASS\033[0m  %s (HTTP %s)\n' "$label" "$code"
    PASS=$((PASS + 1))
  else
    printf '  \033[31mFAIL\033[0m  %s (got HTTP %s, expected %s)\n' "$label" "$code" "$expected_code"
    FAIL=$((FAIL + 1))
  fi
}

run_post_json() {
  local label="$1" expected_code="$2" path="$3" body="$4"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$body" "$URL$path") || code="???"
  if [[ "$code" == "$expected_code" ]]; then
    printf '  \033[32mPASS\033[0m  %s (HTTP %s)\n' "$label" "$code"
    PASS=$((PASS + 1))
  else
    printf '  \033[31mFAIL\033[0m  %s (got HTTP %s, expected %s)\n' "$label" "$code" "$expected_code"
    FAIL=$((FAIL + 1))
  fi
}

check_json_field() {
  local label="$1" path="$2" field="$3"
  local got
  got=$(curl -sS -H "Authorization: Bearer $TOKEN" "$URL$path" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('$field', '__MISSING__'))
except Exception as e:
    print(f'__ERR__:{e}')" 2>/dev/null) || got="__ERR__"
  if [[ "$got" != "__MISSING__" && "$got" != __ERR__* ]]; then
    printf '  \033[32mPASS\033[0m  %s (%s=%s)\n' "$label" "$field" "$got"
    PASS=$((PASS + 1))
  else
    printf '  \033[31mFAIL\033[0m  %s (%s not in response: %s)\n' "$label" "$field" "$got"
    FAIL=$((FAIL + 1))
  fi
}

echo
echo "Smoke-testing $URL"
echo

echo "Unauthenticated:"
run "/health returns 200"                         200 GET  /health  noauth
run "/domains without auth returns 401"           401 GET  /domains noauth
run "/channels without auth returns 401"          401 GET  /channels noauth
run "/budget without auth returns 401"            401 GET  /budget  noauth

echo
echo "Authenticated:"
run "/domains with valid token returns 200"       200 GET  /domains auth
run "/channels with valid token returns 200"      200 GET  /channels auth
run "/budget with valid token returns 200"        200 GET  /budget  auth
run "/events with valid token returns 200"        200 GET  /events  auth

echo
echo "Shape checks:"
check_json_field "/health reports ok"             /health ok
check_json_field "/budget reports peakDuePerMinute" /budget peakDuePerMinute
check_json_field "/budget reports withinFreeTier"   /budget withinFreeTier

echo
echo "Auth (unauthenticated):"
run "/login returns 200"                                                 200 GET /login noauth
run_post_json "/login/email-code nonexistent email returns 202 (enum-safe)" 202 /login/email-code '{"email":"no-such-user@example.invalid"}'

echo
echo "Negative:"
WRONG_TOKEN="wrong-token-definitely-not-valid"
wrong_code=$(curl -sS -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $WRONG_TOKEN" "$URL/domains") || wrong_code="???"
if [[ "$wrong_code" == "401" ]]; then
  printf '  \033[32mPASS\033[0m  wrong token returns 401 (got %s)\n' "$wrong_code"
  PASS=$((PASS + 1))
else
  printf '  \033[31mFAIL\033[0m  wrong token (got HTTP %s, expected 401)\n' "$wrong_code"
  FAIL=$((FAIL + 1))
fi

echo
printf 'Summary: \033[32m%d pass\033[0m, \033[31m%d fail\033[0m\n' "$PASS" "$FAIL"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
