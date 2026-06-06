# Setup checklist

Follow in order on a fresh clone. Skipping steps will bite you later.

## 1. Clone the template

```bash
gh repo create my-app --template elleskay/platform --clone --private
cd my-app
```

## 2. GitHub repo settings

- [ ] Set default branch to `main`
- [ ] Enable branch protection on `main`: require PR, require CI to pass
- [ ] Enable Dependabot alerts and security updates (Settings, Security)
- [ ] Enable secret scanning (Settings, Code security)
- [ ] Update `.github/CODEOWNERS` to your GitHub handle
- [ ] Update `SECURITY.md` with your real disclosure email

## 3. Create your app

The clone comes with `apps/_demo/` (a working demo: Auth.js + middleware + SignOutButton + healthcheck). CI builds it for its self-test, so leave it in place and create your app at `apps/web/`. Two paths:

**Option A: Start fresh**

```bash
npx create-next-app@latest apps/web --typescript --tailwind --app --eslint --use-npm
cd apps/web
npm install next-auth@beta zod @opennextjs/aws
# Pick your data layer
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
# Overlay the patterns
cp ../_template/next.config.ts ./
cp ../_template/auth.config.ts ./
cp ../_template/middleware.ts ./
mkdir -p components
cp ../_template/components/SignOutButton.tsx components/
cd ../..
```

**Option B: Grow from the demo**

```bash
cp -r apps/_demo apps/web
```

Then edit `apps/web/auth.ts` to swap the hardcoded `DEMO_USER` for your real provider, add a database, and add routes. The patterns are already in place.

## 4. Configure CDK for the app

Rename `infra/cdk/_template/` to match your app name:

```bash
mv infra/cdk/_template infra/cdk/<your-app>
cd infra/cdk/<your-app>
```

Edit `bin/app.ts` to rename the stack id (e.g. `AppServerless` to `ArmouryServerless`). The stack id becomes the CloudFormation stack name.

Install CDK package deps:

```bash
npm install
cd ../../..
```

## 5. AWS account setup

- [ ] Create an AWS account (or use an existing one)
- [ ] Region: pick one close to your users (e.g. `ap-southeast-1` for Singapore)
- [ ] Create an IAM user `cdk-deploy` (or a role, if using OIDC from GitHub)
- [ ] Attach the policy from `infra/iam/cdk-deploy-policy.json` (don't use `AdministratorAccess`)
- [ ] Create an access key, configure `~/.aws/credentials`
- [ ] Bootstrap CDK once: `npx cdk bootstrap aws://<account>/<region>`

## 6. Connect GitHub and AWS (one command)

For automated deploys via `.github/workflows/deploy.yml`, run the connect
script. You (or your AI coding agent) run it once per repo, and it wires the
whole GitHub + AWS connection: it ensures the OIDC provider, deploys the
`_setup` role, provisions a database (Neon), generates `AUTH_SECRET`, and sets
every GitHub Actions secret and variable.

```bash
npm run setup
# or: scripts/connect.sh --region ap-southeast-1
# preview without changing anything: scripts/connect.sh --dry-run
```

Prerequisites: `gh` (authenticated), `aws` (credentials allowed to create an
IAM role + OIDC provider and to bootstrap CDK), and Node 22+. Optional:
`neonctl` to auto-provision the database (otherwise the script asks for a
`DATABASE_URL`). Re-running is safe.

After it finishes there is nothing else to set by hand. It configures:

- **secrets**: `AWS_DEPLOY_ROLE_ARN`, `DATABASE_URL`, `AUTH_SECRET`
- **variables**: `AWS_REGION`, `ALLOWED_ORIGINS` (wildcards for the first deploy),
  plus `CDK_DIR` / `APP_DIR` if you passed non-default paths.

`APP_URL` is set after your first deploy, once you know the CloudFront URL
(NextAuth needs the canonical URL). The script prints the exact command. To
skip the two-pass dance, pass a `customDomain` to `NextjsServerless` up front
(see `docs/DEPLOY.md` gotcha #7).

<details>
<summary>Prefer to do it by hand?</summary>

```bash
cd infra/cdk/_setup
npm install
npx cdk deploy -c repo=<your-github-org>/<your-app>
```

That creates the OIDC trust + IAM role and outputs the `DeployRoleArn`. See
`infra/cdk/_setup/README.md` for prerequisites. Then set the secrets/variables
listed above on the app repo manually (`gh secret set` / `gh variable set`).
For `ALLOWED_ORIGINS` on the first build, use
`*.cloudfront.net,*.lambda-url.<region>.on.aws`, then refine to specific hosts.
</details>

## 7. First deploy

```bash
git add . && git commit -m "chore: initial scaffold"
git push -u origin main
```

GitHub Actions runs CI, builds OpenNext, deploys via CDK, smoke-tests the URL. If all checks pass, your CloudFront URL is live.

For the cleanest first deploy (no two-pass dance), provision a custom domain + ACM cert first and pass them to `NextjsServerless` via the `customDomain` prop. See `docs/DEPLOY.md` gotcha #7 for the trade-off.

## What you always forget

- Step 5: Attaching the IAM policy instead of relying on root access
- Step 6: Setting `APP_URL` (NextAuth breaks without it)
- Step 6: Setting `ALLOWED_ORIGINS` (Server Actions break without it)
- Step 4: Renaming the stack id in `bin/app.ts` (otherwise all your apps share the same CloudFormation stack name)
