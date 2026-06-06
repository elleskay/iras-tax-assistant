#!/usr/bin/env bash
#
# connect.sh: one-command cloud setup for a repo cloned from this template.
#
# Wires the GitHub + AWS connection the deploy workflow needs, so that every
# push then auto-builds, tests, and deploys to a live AWS URL with no stored
# keys. Designed to be run by you, or by an AI coding agent on your behalf,
# once per repo. Re-running is safe (idempotent).
#
# It will:
#   1. ensure the GitHub Actions OIDC provider exists in your AWS account
#   2. cdk-bootstrap the account/region (once)
#   3. deploy infra/cdk/_setup, creating a least-privilege deploy role
#   4. provision a Postgres database (Neon) or accept one you provide
#   5. generate AUTH_SECRET
#   6. set the GitHub Actions secrets + variables via `gh`
#
# Nothing long-lived is stored: deploys assume the role over OIDC.
#
# Prerequisites: gh (authenticated), aws (credentials with permission to
# create an IAM role + OIDC provider), node/npx. Optional: neonctl (logged in
# via 'neonctl auth', else pass --database-url/--skip-db), openssl.
#
# Usage:
#   scripts/connect.sh [options]
#
#   --repo <owner/name>     GitHub repo (default: detected from `gh`/git remote)
#   --region <aws-region>   AWS region (default: $AWS_REGION or ap-southeast-1)
#   --database-url <url>    Use this Postgres URL instead of provisioning Neon
#   --app-url <url>         Canonical app URL, if you already have a custom domain
#   --cdk-dir <path>        CDK package dir (default: infra/cdk/_template)
#   --app-dir <path>        App dir (default: apps/web)
#   --skip-db               Don't touch the database (set DATABASE_URL yourself)
#   --yes                   Don't prompt for confirmation
#   --dry-run               Print the plan and exit without changing anything
#   -h, --help              Show this help

set -euo pipefail

# ---------- args ----------
REPO=""; REGION="${AWS_REGION:-ap-southeast-1}"; DATABASE_URL=""; APP_URL=""
CDK_DIR="infra/cdk/_template"; APP_DIR="apps/web"
SKIP_DB=0; ASSUME_YES=0; DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2;;
    --region) REGION="$2"; shift 2;;
    --database-url) DATABASE_URL="$2"; shift 2;;
    --app-url) APP_URL="$2"; shift 2;;
    --cdk-dir) CDK_DIR="$2"; shift 2;;
    --app-dir) APP_DIR="$2"; shift 2;;
    --skip-db) SKIP_DB=1; shift;;
    --yes) ASSUME_YES=1; shift;;
    --dry-run) DRY_RUN=1; shift;;
    -h|--help) sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "Unknown option: $1" >&2; exit 2;;
  esac
done

# ---------- helpers ----------
c_blue="\033[1;34m"; c_green="\033[1;32m"; c_yellow="\033[1;33m"; c_red="\033[1;31m"; c_dim="\033[2m"; c_off="\033[0m"
step() { printf "${c_blue}==>${c_off} %s\n" "$1"; }
ok()   { printf "${c_green} ✓${c_off} %s\n" "$1"; }
warn() { printf "${c_yellow} !${c_off} %s\n" "$1"; }
die()  { printf "${c_red}error:${c_off} %s\n" "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
run()  { if [ "$DRY_RUN" = 1 ]; then printf "${c_dim}  would run: %s${c_off}\n" "$*"; else "$@"; fi; }

# Run a command with a hard timeout so a stuck CLI can't hang the whole script
# (e.g. an installed-but-logged-out neonctl that waits forever). Prefers
# timeout/gtimeout; falls back to a background-kill where neither exists (macOS).
with_timeout() {
  local secs="$1"; shift
  local rc=0
  if have timeout; then
    timeout "$secs" "$@" || rc=$?
  elif have gtimeout; then
    gtimeout "$secs" "$@" || rc=$?
  else
    "$@" & local pid=$!
    ( sleep "$secs"; kill -9 "$pid" 2>/dev/null ) & local watcher=$!
    wait "$pid" 2>/dev/null || rc=$?
    kill -9 "$watcher" 2>/dev/null || true
  fi
  return "$rc"
}

# True only when neonctl is installed AND authenticated. Without the auth check,
# a present-but-logged-out neonctl makes `neonctl projects create` block forever.
neon_ready() { with_timeout 20 neonctl me >/dev/null 2>&1; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ---------- prerequisites ----------
step "Checking prerequisites"
have gh   || die "gh (GitHub CLI) not found. Install: https://cli.github.com"
have aws  || die "aws CLI not found. Install: https://aws.amazon.com/cli/"
have npx  || die "node/npx not found. Install Node 22+."
gh auth status >/dev/null 2>&1 || die "gh is not authenticated. Run: gh auth login"
aws sts get-caller-identity >/dev/null 2>&1 || die "aws has no valid credentials. Configure them (this one-time step needs permission to create an IAM role + OIDC provider)."
ok "gh, aws, node present and authenticated"

# ---------- resolve inputs ----------
if [ -z "$REPO" ]; then
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
fi
[ -n "$REPO" ] || die "Could not detect the GitHub repo. Pass --repo <owner/name>."
echo "$REPO" | grep -qE '^[^/]+/[^/]+$' || die "--repo must be '<owner>/<name>', got '$REPO'"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REPO_NAME="${REPO#*/}"

echo
step "Plan"
cat <<EOF
  repo:        $REPO
  aws account: $ACCOUNT
  region:      $REGION
  cdk dir:     $CDK_DIR
  app dir:     $APP_DIR
  database:    $([ -n "$DATABASE_URL" ] && echo "provided" || { [ "$SKIP_DB" = 1 ] && echo "skipped (you set DATABASE_URL)" || echo "provision via Neon (or prompt)"; })
  app url:     $([ -n "$APP_URL" ] && echo "$APP_URL" || echo "set after first deploy")

This will create an IAM role + OIDC provider in AWS account $ACCOUNT and set
GitHub Actions secrets/variables on $REPO.
EOF
echo
if [ "$DRY_RUN" = 0 ] && [ "$ASSUME_YES" = 0 ]; then
  printf "Proceed? [y/N] "; read -r reply
  case "$reply" in y|Y|yes|YES) ;; *) echo "Aborted."; exit 0;; esac
fi

# ---------- 1. GitHub OIDC provider ----------
step "Ensuring GitHub Actions OIDC provider in AWS"
OIDC_ARN="arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  ok "OIDC provider already exists"
else
  warn "OIDC provider missing, creating it"
  # AWS validates the GitHub certificate dynamically; the thumbprint is a
  # required-but-no-longer-enforced argument for this provider.
  run aws iam create-open-id-connect-provider \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "1c58a3a8518e8759bf075b76b750d4f2df264fcd" >/dev/null
  ok "OIDC provider created"
fi

# ---------- 2. CDK bootstrap ----------
step "Bootstrapping CDK (idempotent)"
run npx --yes cdk@2 bootstrap "aws://${ACCOUNT}/${REGION}" >/dev/null
ok "CDK bootstrapped for ${ACCOUNT}/${REGION}"

# ---------- 3. Deploy the setup stack ----------
step "Deploying the OIDC deploy role (infra/cdk/_setup)"
ROLE_ARN=""
if [ "$DRY_RUN" = 0 ]; then
  ( cd infra/cdk/_setup && npm install --no-audit --no-fund --silent )
  ( cd infra/cdk/_setup && CDK_DEFAULT_ACCOUNT="$ACCOUNT" CDK_DEFAULT_REGION="$REGION" \
      npx cdk deploy -c repo="$REPO" --require-approval never --outputs-file ./.connect-outputs.json >/dev/null )
  STACK="PlatformSetup-${REPO/\//-}"
  ROLE_ARN="$(node -e "const o=require('./infra/cdk/_setup/.connect-outputs.json');console.log(o['$STACK'].DeployRoleArn)")"
  rm -f infra/cdk/_setup/.connect-outputs.json
  [ -n "$ROLE_ARN" ] || die "Could not read DeployRoleArn from stack outputs."
  ok "Deploy role: $ROLE_ARN"
else
  run "cd infra/cdk/_setup && npm install && npx cdk deploy -c repo=$REPO"
  ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/github-actions-${REPO_NAME}"
fi

# ---------- 4. Database ----------
step "Database"
if [ "$SKIP_DB" = 1 ]; then
  warn "Skipping database. Set the DATABASE_URL secret yourself."
elif [ -n "$DATABASE_URL" ]; then
  ok "Using the DATABASE_URL you provided"
elif [ "$DRY_RUN" = 1 ]; then
  if have neonctl; then
    run "neonctl projects create --name $REPO_NAME"
    DATABASE_URL="postgres://...neon..."
  else
    warn "neonctl not found. A real run would prompt for a DATABASE_URL (or pass --database-url)."
  fi
elif have neonctl && neon_ready; then
  warn "Provisioning a Neon Postgres project named '$REPO_NAME'"
  DATABASE_URL="$(with_timeout 120 neonctl projects create --name "$REPO_NAME" --output json 2>/dev/null \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const u=(j.connection_uris&&j.connection_uris[0]&&(j.connection_uris[0].connection_uri||j.connection_uris[0].connection_string))||'';process.stdout.write(u)}catch(e){}})")"
  [ -n "$DATABASE_URL" ] || die "Neon project create returned no connection string. Re-run with --database-url <url>."
  ok "Neon database provisioned"
elif have neonctl; then
  die "neonctl is installed but not logged in, so auto-provisioning would hang. Run 'neonctl auth' (or set NEON_API_KEY), then re-run; or pass --database-url <url> or --skip-db."
else
  warn "neonctl not found. Paste a Postgres connection string (or Ctrl-C and re-run with --database-url):"
  printf "DATABASE_URL: "; read -r DATABASE_URL
  [ -n "$DATABASE_URL" ] || die "No DATABASE_URL provided."
fi

# ---------- 5. AUTH_SECRET ----------
step "Generating AUTH_SECRET"
if have openssl; then
  AUTH_SECRET="$(openssl rand -base64 32)"
else
  AUTH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
fi
ok "AUTH_SECRET generated"

# ---------- 6. GitHub secrets + variables ----------
step "Setting GitHub Actions secrets and variables on $REPO"
gh_secret() { run gh secret set "$1" --repo "$REPO" --body "$2" >/dev/null && ok "secret  $1"; }
gh_var()    { run gh variable set "$1" --repo "$REPO" --body "$2" >/dev/null && ok "variable $1"; }

gh_secret AWS_DEPLOY_ROLE_ARN "$ROLE_ARN"
gh_secret AUTH_SECRET "$AUTH_SECRET"
[ -n "$DATABASE_URL" ] && gh_secret DATABASE_URL "$DATABASE_URL"

gh_var AWS_REGION "$REGION"
# Wildcards are valid for the first deploy; refine to exact hosts afterwards.
gh_var ALLOWED_ORIGINS "*.cloudfront.net,*.lambda-url.${REGION}.on.aws"
[ -n "$APP_URL" ] && gh_var APP_URL "$APP_URL"
[ "$CDK_DIR" != "infra/cdk/_template" ] && gh_var CDK_DIR "$CDK_DIR"
[ "$APP_DIR" != "apps/web" ] && gh_var APP_DIR "$APP_DIR"

# ---------- done ----------
echo
ok "Cloud connected."
cat <<EOF

Next:
  1. Build your app at ${APP_DIR} (or prompt your agent to), then:
       git add . && git commit -m "feat: initial app" && git push -u origin main
  2. GitHub Actions will build, test, and deploy to a live CloudFront URL.
$([ -z "$APP_URL" ] && echo "  3. After the first deploy, set APP_URL to the CloudFront URL:
       gh variable set APP_URL --repo $REPO --body https://<your-cf-url>
     and tighten ALLOWED_ORIGINS to that exact host (NextAuth + Server Actions
     need the canonical URL). Or pass a customDomain to NextjsServerless and
     skip the two-pass dance (see docs/DEPLOY.md gotcha #7).")
EOF
