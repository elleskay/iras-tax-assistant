# CDK app scaffold

Full CDK package for deploying a Next.js + OpenNext app to AWS serverless. Copy this whole directory per app (this repo's live copy is `infra/cdk/web/`).

## Use

```bash
# From your cloned app repo, copy _template to your app name
cp -r infra/cdk/_template infra/cdk/<your-app>
# Keep infra/cdk/_template in place: platform CI (ci.yml cdk-synth) synths it
# as a self-test and fails if it is deleted.
cd infra/cdk/<your-app>
npm install
```

Then edit:

- `bin/app.ts`: rename the stack id (e.g. `AppServerless` → `ArmouryServerless`)
- `lib/web-stack.ts`: confirm `appPath` resolves to your Next.js app directory
- Optionally enable `customDomain` to skip the two-pass deploy (see `lib/constructs/NextjsServerless.ts` JSDoc)

## Deploy

```bash
# Build the app with OpenNext first (see app's README)
cd ../../../apps/web && npm run build:open-next

# Bootstrap CDK once per AWS account/region
cd ../../infra/cdk/<your-app>
npx cdk bootstrap aws://<account>/<region>

# Deploy
DATABASE_URL=... AUTH_SECRET=... AUTH_URL=https://your-cf-url npx cdk deploy --all
```

## What's inside

- `bin/app.ts`: CDK app entry point
- `lib/web-stack.ts`: the deploy unit (one CloudFormation stack)
- `lib/constructs/NextjsServerless.ts`: reusable construct, ~200 lines that encode all the production gotchas
- `package.json`, `tsconfig.json`, `cdk.json`, `.gitignore`: CDK package boilerplate

## Why copy and not import as a package

For a portfolio platform, npm publishing is overhead without payoff. The copy-on-scaffold pattern means each app pins its version of the construct, and breaking changes never propagate without explicit action.
