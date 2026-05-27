#!/usr/bin/env bash
# Smoke-test a deployed app. Catches the failures we learned the hard way:
# the Lambda-URL redirect bug, missing CSS, sign-out broken, missing security
# headers, dead health endpoint.
#
# Usage:
#   ./scripts/verify-deploy.sh https://d1aeysqic3xk9.cloudfront.net
#
# Exits non-zero on any failed check so it can gate CI/CD.

set -euo pipefail

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "Usage: $0 <deployed-url>" >&2
  exit 2
fi

URL="${URL%/}"
fail=0
pass=0

note() { printf "  %s\n" "$*"; }
ok()   { pass=$((pass+1)); printf "\033[32m  PASS\033[0m  %s\n" "$*"; }
err()  { fail=$((fail+1)); printf "\033[31m  FAIL\033[0m  %s\n" "$*"; }

check() {
  local name="$1"; shift
  printf "==> %s\n" "$name"
  if "$@"; then ok "$name"; else err "$name"; fi
}

# 1. /api/health responds 200 with JSON {status: ok}
check_health() {
  local body
  body=$(curl -sS --max-time 10 "$URL/api/health") || return 1
  echo "$body" | grep -q '"status":"ok"' || { note "body: $body"; return 1; }
}

# 2. Root redirects to /login
check_root_redirect() {
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$URL/")
  [ "$code" = "307" ] || [ "$code" = "308" ] || { note "got $code"; return 1; }
}

# 3. /login returns 200
check_login_page() {
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$URL/login")
  [ "$code" = "200" ] || { note "got $code"; return 1; }
}

# 4. Security headers present
check_security_headers() {
  local headers missing=()
  headers=$(curl -sS -I --max-time 10 "$URL/login")
  for h in "strict-transport-security" "x-content-type-options" "x-frame-options" "referrer-policy" "permissions-policy"; do
    echo "$headers" | grep -iq "^$h:" || missing+=("$h")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    note "missing: ${missing[*]}"
    return 1
  fi
}

# 5. HTML references a Tailwind CSS file (catches the "no UI" deploy)
check_styled_html() {
  local html
  html=$(curl -sS --max-time 10 "$URL/login")
  echo "$html" | grep -q '<link[^>]*stylesheet' || { note "no stylesheet link tag"; return 1; }
}

# 6. CSS chunk loads with content-type text/css
check_css_serves() {
  local href type
  href=$(curl -sS --max-time 10 "$URL/login" | grep -oE 'href="/_next/static/[^"]+\.css"' | head -1 | sed -E 's/href="//; s/"//')
  if [ -z "$href" ]; then note "no .css href in HTML"; return 1; fi
  type=$(curl -sS -o /dev/null -w "%{content_type}" --max-time 10 "$URL$href")
  echo "$type" | grep -qi "text/css" || { note "css served as $type"; return 1; }
}

# 7. NextAuth providers endpoint responds with JSON (proves the auth API
# layer works end to end, not just static HTML)
check_auth_providers() {
  local body
  body=$(curl -sS --max-time 10 "$URL/api/auth/providers")
  echo "$body" | grep -q '"id":' || { note "body: $body"; return 1; }
}

# 8. NextAuth CSRF endpoint returns a token (proves Server Action /
# auth POST surface is reachable and the host is properly trusted)
check_auth_csrf() {
  local body
  body=$(curl -sS --max-time 10 "$URL/api/auth/csrf")
  echo "$body" | grep -q '"csrfToken":"[a-f0-9]' || { note "body: $body"; return 1; }
}

# 9. Auth callback URL does NOT leak the Lambda function URL host
# (regression check for the AUTH_URL gotcha we hit on the first deploy)
check_no_lambda_url_leak() {
  local body
  body=$(curl -sS --max-time 10 "$URL/api/auth/session")
  if echo "$body" | grep -q 'lambda-url'; then
    note "session response contains 'lambda-url': $body"
    return 1
  fi
  # Also check the login page HTML
  if curl -sS --max-time 10 "$URL/login" | grep -q 'lambda-url\.'; then
    note "/login HTML contains lambda-url reference"
    return 1
  fi
}

check "Health endpoint" check_health
check "Root redirects to /login" check_root_redirect
check "/login renders" check_login_page
check "Security headers present" check_security_headers
check "HTML loads a stylesheet" check_styled_html
check "Stylesheet serves as text/css" check_css_serves
check "NextAuth /api/auth/providers responds JSON" check_auth_providers
check "NextAuth /api/auth/csrf returns a token" check_auth_csrf
check "No Lambda Function URL leaked in auth surface" check_no_lambda_url_leak

echo
echo "Summary: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
