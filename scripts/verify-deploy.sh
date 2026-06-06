#!/usr/bin/env bash
# Smoke-test a deployed app. Catches the failures we learned the hard way:
# the Lambda-URL redirect bug, missing CSS, sign-out broken, missing security
# headers, dead health endpoint.
#
# Adapts to the app: if the root redirects to /login it runs the full auth
# suite; if the root returns 200 it treats the app as a public single page and
# skips the auth-only checks (health is optional in both modes). This lets a
# non-auth app (e.g. a public tool) pass without editing the script.
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

# Detect the app type from how the root responds: a redirect means an auth app
# that gates on /login, a 200 means a public landing page.
ROOT_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$URL/")
if [ "$ROOT_CODE" = "307" ] || [ "$ROOT_CODE" = "308" ]; then
  MODE="auth"; PAGE="/login"
else
  MODE="public"; PAGE="/"
fi
printf "Detected %s app (root returned %s); checking landing page %s\n\n" "$MODE" "$ROOT_CODE" "$PAGE"

# 1. /api/health responds 200 with JSON {status: ok}. Optional: an app without
# a health route (404) is fine and the check is skipped.
check_health() {
  local code body
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$URL/api/health")
  if [ "$code" = "404" ]; then note "no /api/health endpoint, skipping"; return 0; fi
  body=$(curl -sS --max-time 10 "$URL/api/health") || return 1
  echo "$body" | grep -q '"status":"ok"' || { note "body: $body"; return 1; }
}

# 2a (auth). Root redirects to /login
check_root_redirect() {
  [ "$ROOT_CODE" = "307" ] || [ "$ROOT_CODE" = "308" ] || { note "got $ROOT_CODE"; return 1; }
}

# 2b (public). Root renders with 200
check_root_renders() {
  [ "$ROOT_CODE" = "200" ] || { note "got $ROOT_CODE"; return 1; }
}

# 3 (auth). /login returns 200
check_login_page() {
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$URL/login")
  [ "$code" = "200" ] || { note "got $code"; return 1; }
}

# 4. Security headers present on the landing page
check_security_headers() {
  local headers missing=()
  headers=$(curl -sS -I --max-time 10 "$URL$PAGE")
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
  html=$(curl -sS --max-time 10 "$URL$PAGE")
  echo "$html" | grep -q '<link[^>]*stylesheet' || { note "no stylesheet link tag"; return 1; }
}

# 6. CSS chunk loads with content-type text/css
check_css_serves() {
  local href type
  href=$(curl -sS --max-time 10 "$URL$PAGE" | grep -oE 'href="/_next/static/[^"]+\.css"' | head -1 | sed -E 's/href="//; s/"//')
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
  # Also check the landing page HTML
  if curl -sS --max-time 10 "$URL$PAGE" | grep -q 'lambda-url\.'; then
    note "$PAGE HTML contains lambda-url reference"
    return 1
  fi
}

check "Health endpoint (optional)" check_health

if [ "$MODE" = "auth" ]; then
  check "Root redirects to /login" check_root_redirect
  check "/login renders" check_login_page
else
  check "Root renders" check_root_renders
fi

check "Security headers present" check_security_headers
check "HTML loads a stylesheet" check_styled_html
check "Stylesheet serves as text/css" check_css_serves

if [ "$MODE" = "auth" ]; then
  check "NextAuth /api/auth/providers responds JSON" check_auth_providers
  check "NextAuth /api/auth/csrf returns a token" check_auth_csrf
  check "No Lambda Function URL leaked in auth surface" check_no_lambda_url_leak
fi

echo
echo "Summary: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
