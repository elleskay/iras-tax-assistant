# infra/cdk/web

The live CDK package for the AI Tax Assistant web app (`apps/web`). One stack,
`IrasTaxServerless` (see `bin/app.ts`), built on the reusable
`NextjsServerless` construct. The reference copy of this package lives at
`infra/cdk/_template/`; keep that one in place, platform CI synths it as a
self-test.

## What the stack provisions

- CloudFront distribution over an OpenNext streaming server Lambda (60s
  timeout: AI routes stream longer than the 30s default)
- S3 assets bucket (construct-managed) plus the private `HitlBucket` backing
  the app's JSON store (workspaces, prompts, gateway logs, eval runs,
  governance). The store bucket is `RETAIN`: it is the app's entire
  persistence layer.
- Custom domain `ai-tax.soonkeong.dev` (override with `CUSTOM_DOMAIN_NAME` /
  `CERTIFICATE_ARN` env vars at synth)

## Deploying

Deploys normally run through `.github/workflows/deploy.yml` (OIDC, spec gate,
smoke test). For a manual deploy:

```bash
cd apps/web && npm run build:open-next && cd ../../infra/cdk/web
npm ci
ANTHROPIC_API_KEY=... OPENAI_API_KEY=... \
RAG_SERVICE_URL=... RAG_SERVICE_TOKEN=... \
UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
npx cdk deploy
```

Env vars are baked into the Lambda at synth time (docs/DEPLOY.md #5), so
every runtime variable must be present in the deploy environment AND wired in
`lib/web-stack.ts` (docs/DEPLOY.md #13). `apps/web/.env.example` lists them.

## Files

- `bin/app.ts`: CDK app entry point (stack id `IrasTaxServerless`)
- `lib/web-stack.ts`: the deploy unit (one CloudFormation stack)
- `lib/constructs/NextjsServerless.ts`: reusable construct; encodes the
  production gotchas (see `docs/DEPLOY.md`)
- `package.json`, `tsconfig.json`, `cdk.json`, `.gitignore`: CDK package
  boilerplate
