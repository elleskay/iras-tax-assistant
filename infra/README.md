# Infra

AWS CDK in TypeScript. Three pieces:

- `cdk/_template/`: a full CDK package you copy and rename per app. It contains the reusable `NextjsServerless` construct (`lib/constructs/`) plus the app stack (`bin/app.ts`, `lib/web-stack.ts`). See `cdk/_template/README.md`.
- `cdk/_setup/`: a one-time stack that provisions the GitHub OIDC provider and a least-privilege deploy role. Usually run for you by `npm run setup` (`scripts/connect.sh`).
- `iam/`: the pre-canned least-privilege IAM policy attached to the deploy role.

## Why no shared "base" stacks?

The serverless deploy (Lambda + S3 + CloudFront) needs no platform-wide AWS resources. Each app provisions its own. Sharing infra across apps adds coupling and surface area for no real gain at this scale.

If you ever need shared resources (a global WAF, a shared observability stack, a custom domain hosted zone), add them in this folder. Don't pre-create them.

## Per-app CDK structure

When you scaffold a new app, copy and rename `cdk/_template/`:

```
apps/web/
├── ... your Next.js app ...
└── .open-next/                  # build output from `open-next build`

infra/cdk/
├── _setup/                      # one-time OIDC + deploy-role stack (shared)
└── <your-app>/                  # copied + renamed from _template/
    ├── bin/app.ts               # rename the stack id here
    ├── lib/web-stack.ts         # instantiates NextjsServerless
    ├── lib/constructs/
    │   └── NextjsServerless.ts  # the reusable construct
    ├── package.json
    ├── tsconfig.json
    └── cdk.json
```

The app stack reads about ~5 lines:

```ts
new NextjsServerless(this, "Web", {
  appPath: path.resolve(__dirname, "..", "..", "..", "..", "apps", "web"),
  environment: {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    AUTH_SECRET: process.env.AUTH_SECRET ?? "",
    AUTH_URL: process.env.AUTH_URL ?? "",
  },
});
```

## Deploy

Apps inherit `.github/workflows/deploy.yml` from this platform. Run `npm run setup` once to wire the GitHub + AWS connection, push to `main`, and the workflow handles bootstrap, build, deploy, and smoke test.

See `docs/DEPLOY.md` for the full setup, including OIDC trust and the IAM policy in `infra/iam/cdk-deploy-policy.json`.
