# IAM policies

Pre-canned policies to attach to the IAM user or role that runs `cdk deploy`.

## `cdk-deploy-policy.json`

Use this instead of `AdministratorAccess` for the deploy user.

Covers everything needed by the `NextjsServerless` construct: CloudFormation, Lambda, S3, CloudFront, IAM (scoped via `iam:PassRole` condition), CloudWatch Logs, SSM Parameter Store, ECR (for CDK bootstrap container assets).

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

## What this does NOT cover

- VPC, ECS, ECR-as-app-registry, RDS (those are for the Fargate path — fork the construct and the policy if you go there)
- KMS custom keys
- WAF, Shield Advanced
- Cross-account deploys
