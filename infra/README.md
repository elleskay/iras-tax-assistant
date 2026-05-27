# Infra

AWS CDK in TypeScript. Two pieces:

- `cdk/constructs/` — reusable building blocks. Copy into each app's repo.
- `iam/` — pre-canned IAM policies for the deploy user/role.

## Why no shared "base" stacks?

The serverless deploy (Lambda + S3 + CloudFront) needs no platform-wide AWS resources. Each app provisions its own. Sharing infra across apps adds coupling and surface area for no real gain at this scale.

If you ever need shared resources (a global WAF, a shared observability stack, a custom domain hosted zone), add them in this folder. Don't pre-create them.

## Per-app CDK structure

When you scaffold a new app:

```
apps/web/
├── ... your Next.js app ...
└── .open-next/                  # build output from `open-next build`

infra/cdk/
├── constructs/                  # copied from platform; shared building blocks
│   ├── NextjsServerless.ts
│   └── README.md
└── app/                         # this app's CDK
    ├── bin/app.ts
    ├── lib/web-stack.ts
    ├── package.json
    ├── tsconfig.json
    └── cdk.json
```

The CDK code reads about ~5 lines per app:

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

Apps inherit the `.github/workflows/deploy.yml` from this platform. Set the required GitHub secrets and variables, push to `main`, the workflow handles bootstrap → build → deploy → smoke test.

See `docs/DEPLOY.md` for the full setup, including OIDC trust and the IAM policy in `infra/iam/cdk-deploy-policy.json`.
