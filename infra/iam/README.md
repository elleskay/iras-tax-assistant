# IAM policies

Pre-canned policies to attach to the IAM user or role that runs `cdk deploy`.

## `cdk-deploy-policy.json`

Use this instead of `AdministratorAccess` for the deploy user.

Covers everything needed by the `NextjsServerless` construct: CloudFormation, Lambda, S3, CloudFront, IAM (scoped to the stacks' role name prefixes plus an `iam:PassRole` service condition), CloudWatch Logs, SSM Parameter Store, ECR (for CDK bootstrap container assets).

The account id and the role-name prefixes (`IrasTaxServerless-*` for the live stack, `AppServerless-*` for the template's default stack id) are baked into the JSON. If you clone this repo or rename the stack in `bin/app.ts`, update the `Resource` ARNs in the `IamPassRoleForCdk` and `IamRolesAndPolicies` statements, and the account id in `CdkAssumeBootstrapRoles`.

### Attaching to an IAM user

```bash
# Save the JSON locally
aws iam put-user-policy \
  --user-name cdk-deploy \
  --policy-name cdk-deploy \
  --policy-document file://infra/iam/cdk-deploy-policy.json
```

Or via the console: IAM, Users, `cdk-deploy`, Permissions, Add permissions, Create inline policy, paste the JSON.

### Attaching to a GitHub Actions OIDC role

When you set up the OIDC trust for `.github/workflows/deploy.yml`, attach this same policy to the assumed role.

## Why this exists

The first time you deploy from a fresh AWS account you reach for `AdministratorAccess` because it's quick. Then it stays attached forever. This policy gives you a saner default that still lets the platform's serverless deploys work end-to-end. Start here, tighten further if your security review demands it.

## Known residual risk

The deploy principal can still write arbitrary inline policies onto roles matching the allowed name prefixes (`iam:PutRolePolicy`), which a hostile holder could use to escalate. The principal is only assumable via the GitHub OIDC trust from this repo's main branch, which bounds who can hold it. Closing the gap fully means enforcing an IAM permissions boundary on `iam:CreateRole` (a boundary policy provisioned per account plus `iam.PermissionsBoundary.of(stack).apply(...)` in the CDK app); do that if the deploy role's blast radius matters in your account.

## What this does NOT cover

- VPC, ECS, ECR-as-app-registry, RDS (those are for the Fargate path: fork the construct and the policy if you go there)
- KMS custom keys
- WAF, Shield Advanced
- Cross-account deploys
