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

## 3. Decide what to do with the demo app

The clone comes with `apps/web/` already populated with a working demo (Auth.js + middleware + SignOutButton + healthcheck). Two paths:

**Option A: Replace with your own app**

```bash
rm -rf apps/web
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

**Option B: Grow the demo into your app**

Keep `apps/web/` as starting point. Edit `auth.ts` to swap the hardcoded `DEMO_USER` for your real provider. Add database. Add routes. The patterns are already in place.

Either way, make sure `next.config.ts` has `output: "standalone"` (OpenNext requires it).

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

## 6. GitHub Actions OIDC and variables

For automated deploys via `.github/workflows/deploy.yml`:

- [ ] In AWS IAM, add `token.actions.githubusercontent.com` as an OIDC identity provider
- [ ] Create a role with trust policy scoped to your GitHub repo
- [ ] Attach the same `cdk-deploy-policy.json` to it
- [ ] Set these GitHub Actions **secrets**:
  - `AWS_DEPLOY_ROLE_ARN` (the OIDC role ARN)
  - `DATABASE_URL` (Postgres connection string)
  - `AUTH_SECRET` (`openssl rand -base64 32` output)
- [ ] Set these GitHub Actions **variables**:
  - `AWS_REGION` (e.g. `ap-southeast-1`)
  - `APP_URL` (https://your-cf-url-or-custom-domain)
  - `ALLOWED_ORIGINS` (CloudFront host + Lambda URL host, comma-separated)
  - `CDK_DIR` (only if you renamed CDK dir to something other than the default; e.g. `infra/cdk/armoury`)
  - `APP_DIR` (only if your app is not at `apps/web`)

For `ALLOWED_ORIGINS`, you won't know the Lambda URL until first deploy. For the first build, use `*.cloudfront.net,*.lambda-url.<region>.on.aws` (wildcards work). After first deploy, refine to specific hosts.

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
- Step 3: `output: "standalone"` in `next.config.ts` (OpenNext won't work without it)
- Step 4: Renaming the stack id in `bin/app.ts` (otherwise all your apps share the same CloudFormation stack name)
