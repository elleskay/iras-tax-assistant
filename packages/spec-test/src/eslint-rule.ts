import type { Rule } from "eslint";
import type {
  Node,
  CallExpression,
  FunctionExpression,
  ArrowFunctionExpression,
  Literal,
} from "estree";
import { BARE_SPEC_ID_RE, BRACKETED_SPEC_ID_RE } from "./spec-id.js";

/*
 * Lint gate: every spec-bound test body must contain at least one expect().
 * Covers both call styles the platform uses:
 *   specTest("TAX-CHAT-001", "title", fn)   <- the wrappers' style
 *   test("[TAX-CHAT-001] title", fn)        <- raw runner style
 * plus their .only/.skip variants.
 */

type SpecCall =
  | { kind: "specTest" }
  | { kind: "titled" }; // test()/it() with a "[ID] ..." title

const TEST_NAMES = new Set(["test", "it"]);
const MODIFIERS = new Set(["only", "skip", "fails", "todo"]);

function classifyCallee(node: CallExpression): SpecCall | null {
  const c = node.callee;
  if (c.type === "Identifier") {
    if (c.name === "specTest") return { kind: "specTest" };
    if (TEST_NAMES.has(c.name)) return { kind: "titled" };
    return null;
  }
  // test.only(...) / it.skip(...) / specTest.only(...). Requiring the object
  // to be one of the known test names also stops `SOME_RE.test("...")` (a
  // RegExp call whose property happens to be named "test") from matching.
  if (c.type === "MemberExpression") {
    const obj = c.object;
    const prop = c.property;
    if (
      obj.type === "Identifier" &&
      prop.type === "Identifier" &&
      MODIFIERS.has(prop.name)
    ) {
      if (obj.name === "specTest") return { kind: "specTest" };
      if (TEST_NAMES.has(obj.name)) return { kind: "titled" };
    }
  }
  return null;
}

function getStringLiteral(node: Node | undefined): string | null {
  if (!node) return null;
  if (node.type === "Literal" && typeof (node as Literal).value === "string") {
    return (node as Literal).value as string;
  }
  if (node.type === "TemplateLiteral") {
    const tl = node as unknown as { quasis: Array<{ value: { cooked: string } }>; expressions: unknown[] };
    if (tl.expressions.length === 0 && tl.quasis.length === 1) {
      return tl.quasis[0]?.value.cooked ?? null;
    }
  }
  return null;
}

function findBodyFunction(
  node: CallExpression,
): FunctionExpression | ArrowFunctionExpression | null {
  for (const arg of node.arguments) {
    if (
      arg.type === "FunctionExpression" ||
      arg.type === "ArrowFunctionExpression"
    ) {
      return arg as FunctionExpression | ArrowFunctionExpression;
    }
  }
  return null;
}

function bodyHasExpect(
  body: FunctionExpression | ArrowFunctionExpression,
): boolean {
  let found = false;
  const visit = (n: unknown): void => {
    if (found || !n || typeof n !== "object") return;
    const node = n as Node & { type: string };
    if (node.type === "CallExpression") {
      const callee = (node as CallExpression).callee;
      if (callee.type === "Identifier" && callee.name === "expect") {
        found = true;
        return;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === "parent" || key === "loc" || key === "range") continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (const c of child) visit(c);
      } else if (child && typeof child === "object") {
        visit(child);
      }
      if (found) return;
    }
  };
  visit(body.body);
  return found;
}

export const requireExpectInSpecTest: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require at least one expect() call inside every spec-bound test: specTest('ID', ...) or test('[ID] ...')",
    },
    schema: [],
    messages: {
      missingExpect:
        "The spec test for {{id}} must contain at least one expect() call. A spec requirement that records no assertion does not verify behavior.",
      missingBody: "The spec test for {{id}} must have a function body.",
    },
  },
  create(context) {
    return {
      CallExpression(node: CallExpression) {
        const call = classifyCallee(node);
        if (!call) return;

        let id: string | null = null;
        if (call.kind === "specTest") {
          const bare = getStringLiteral(node.arguments[0] as Node | undefined);
          if (bare && BARE_SPEC_ID_RE.test(bare)) id = bare;
        } else {
          const title = getStringLiteral(node.arguments[0] as Node | undefined);
          const m = title ? BRACKETED_SPEC_ID_RE.exec(title) : null;
          if (m) id = m[1] ?? null;
        }
        if (!id) return;

        const body = findBodyFunction(node);
        if (!body) {
          context.report({ node, messageId: "missingBody", data: { id } });
          return;
        }
        if (!bodyHasExpect(body)) {
          context.report({ node, messageId: "missingExpect", data: { id } });
        }
      },
    };
  },
};

export const plugin = {
  rules: {
    "require-expect-in-spec-test": requireExpectInSpecTest,
  },
};
