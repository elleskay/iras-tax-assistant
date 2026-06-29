import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { searchKnowledge, ragEnabled } from "./rag-client";
import { DEFAULT_WORKSPACE } from "./workspaces";

/*
 * The assistant's non-custom tools. The only always-available tool is
 * search_knowledge (RAG over this workspace's uploaded documents), and only
 * when a RAG service is configured. Tax lookups and calculators are NOT built
 * in: officers add them from the Templates tab as custom tools (see
 * lib/tool-templates.ts and lib/custom-tools.ts), which the chat route merges
 * in per request. That keeps every tool the officer's choice.
 */

export function buildTaxTools(workspace: string = DEFAULT_WORKSPACE): ToolSet {
  const tools: ToolSet = {};

  if (ragEnabled()) {
    // Number cited sources continuously across every search in one turn, so two
    // searches never both emit [1] (which would collide in the citation panel).
    let citedSoFar = 0;
    tools.search_knowledge = tool({
      description:
        "Search this workspace's uploaded guidance documents and return relevant, cited passages. Use for questions whose answer may be in the department's own documents. Cite the [n] source in your answer.",
      inputSchema: z.object({
        query: z.string().describe("What to look up in the documents"),
      }),
      execute: async ({ query }) => {
        const chunks = await searchKnowledge(workspace, query, 5);
        if (chunks.length === 0)
          return "No relevant passages found in the uploaded documents.";
        return chunks
          .map((c) => {
            citedSoFar += 1;
            return `[${citedSoFar}] (${c.source.filename}, ${c.source.location})\n${c.text}`;
          })
          .join("\n\n");
      },
    });
  }

  return tools;
}

/** Default tool set (RAG only when configured), used where no workspace is given. */
export const taxTools = buildTaxTools();
