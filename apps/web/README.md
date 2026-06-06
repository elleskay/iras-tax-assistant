# IRAS Tax Assistant

Conversational assistant for Singapore tax questions (GST, income tax, corporate
tax, SRS), with rough tax estimates and human-in-the-loop (HITL) escalation.
Built on the platform template: Next.js (App Router) + AI SDK + AWS serverless.

## What it does

- **Chat agent** (`/`): answers general, factual IRAS tax questions using a
  `lookup_tax_info` tool, and can produce a rough chargeable-income estimate.
- **Auto escalation**: personalised queries ("how much will I owe...") are
  escalated to a human advisor instead of being answered, via the
  `escalate_to_human` tool.
- **Advisor queue** (`/admin`): lists pending escalations and lets an advisor
  resolve them.

The tool logic is ported from the original `iras-mcp-server` MCP tools.

## Design system

UI direction generated with `ui-ux-pro-max`: the "Accessible and Ethical" style
(WCAG-oriented, recommended for government / public-trust products), a
high-contrast navy + blue Government palette, and the Lexend + Source Sans 3
type pairing (Lexend is engineered for reading accessibility). Tokens live in
`app/globals.css`.

## Architecture

```
Browser (chat UI, useChat)
   |
  /api/chat  -> streamText (AI SDK v6) + Claude + tax tools
   |                                   |
   |                          lib/tools.ts -> lib/tax.ts (pure logic)
   |                                       -> lib/hitl-store.ts (escalations)
  /api/hitl  -> list / create / resolve escalations
   |
  /admin (advisor queue)
```

## Run locally

```bash
# From the repo root (installs the workspace, builds @platform/spec-test):
npm install

# Add your Anthropic key:
echo "ANTHROPIC_API_KEY=sk-ant-..." > apps/web/.env.local

cd apps/web
npm run dev    # http://localhost:3000
```

Optional env: `ANTHROPIC_MODEL` (defaults to `claude-sonnet-4-5`).

## Spec-driven tests

This app follows the platform's spec gate: every requirement in
[`specs/web.yml`](specs/web.yml) is covered by a passing test.

```bash
npm run test:spec   # build + unit + e2e + 100% coverage gate
```

- `data` requirements (pure tax logic, escalation store) are Vitest unit tests.
- `ui` / `functional` / `a11y` / `security` requirements are Playwright e2e.
- The chat e2e stubs `/api/chat` with a fixed UI message stream, so the gate is
  deterministic and offline (the LLM is never called in tests).

## Notes / production

- The HITL queue is a JSON file (`lib/hitl-store.ts`) for the prototype. On
  serverless the filesystem is ephemeral, so swap it for the platform's Postgres
  (Neon). The exported store API can stay the same.
- Deploy via `infra/cdk/web`. The chat route streams, so the stack sets
  `serverTimeoutSeconds: 60`. `ANTHROPIC_API_KEY` is wired in both the CDK stack
  env and the deploy workflow's CDK-deploy step (env is baked at synth time).
