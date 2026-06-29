# AI Tax Assistant Platform (web)

The Next.js app for the AI Tax Assistant Platform: a multi-tenant tool for tax
officers. Each department gets its own workspace and a document-grounded
assistant, with cost-aware model routing, a sandboxed custom-tool runtime, and
one governance standard applied across every workspace.

For the full system design (architecture, deep dives, diagrams), see the
[root README](../../README.md).

## Pages

- `/` — landing: what the platform does, links into every page.
- `/workspaces` — the department workspaces; create a new one.
- `/assistant` — the chat assistant: a bounded agent loop with cited retrieval,
  a step trace, and per-workspace tools and instructions.
- `/documents` — upload a workspace's guidance docs into its RAG index; search it.
- `/tools` — "AI Tools": build no-code lookup tables, message templates, or
  sandboxed JavaScript calculators the assistant can call.
- `/prompts` — "AI Instructions": the assistant's system prompt per workspace,
  versioned with line diffs and an activation pointer.
- `/insights` — "Usage analytics": training needs, documentation gaps, and
  process hotspots, mined from usage (Python embeddings + clustering).
- `/gateway` — "AI Gateway": every model call with latency, tokens, cost, and
  any provider fallback.
- `/governance` — "AI Dashboard": platform-wide usage, eval pass rate, cost, and
  reliability, plus a downloadable AI Risk Assessment.
- `/governance/policy` — "AI Policy": the governance-as-code editor and the
  deterministic model-routing rules.
- `/governance/audit` — "AI Audit Trail": every model call, eval run, and
  instruction change, newest first.
- `/evals` — "AI Evaluation": graded test cases (keyword grader or LLM judge)
  behind a pass-rate gate.

It also serves an MCP server at `/api/mcp` exposing a sandboxed `run_javascript`
tool (Streamable HTTP, plus stdio via `npm run mcp:stdio`).

## Design system

UI direction from `ui-ux-pro-max`: an accessible, high-contrast navy + blue
palette with the Lexend + Source Sans 3 type pairing. Tokens live in
`app/globals.css`.

## Run locally

```bash
# From the repo root (installs the workspace, builds @platform/spec-test):
npm install

# Add your keys in apps/web/.env.local:
#   ANTHROPIC_API_KEY=sk-ant-...   # the chat agent
#   OPENAI_API_KEY=sk-...          # the OpenAI models in the router
# Optional: ANTHROPIC_MODEL (defaults to claude-sonnet-4-6),
#           RAG_SERVICE_URL (the Python RAG service; unset disables RAG).

cd apps/web
npm run dev    # http://localhost:3000
```

## Spec-driven tests

Every requirement in [`specs/web.yml`](specs/web.yml) maps to a test, enforced
by a coverage gate.

```bash
npm run test:unit       # Vitest: pure logic, stores, agent loop with mock models
npm run test:e2e        # Playwright: UI, a11y, security (/api/chat is stubbed)
npm run test:coverage   # spec-to-test coverage gate
npm run test:spec       # build + all of the above
```

No test calls a real LLM: unit tests use scripted mock models, and the chat and
eval e2e stub the streamed response with fixtures.

## Deploy

Deployed to AWS via `infra/cdk/web` (OpenNext on Lambda + S3 + CloudFront). The
chat route streams, so the stack sets `serverTimeoutSeconds: 60`. App state is a
per-workspace JSON store on S3; the RAG service runs separately on Fly.io. See
the root README for the full design.
