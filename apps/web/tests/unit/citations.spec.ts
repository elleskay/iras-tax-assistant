import { specTest, expect } from "@platform/spec-test/vitest";
import type { UIMessage } from "ai";
import { collectSources } from "../../components/ai-elements/citations";

/*
 * The Sources panel must show exactly the passages the answer cites. The tricky
 * case: search_knowledge numbers passages continuously across searches, so a
 * later search that re-surfaces an earlier chunk gives it a new number. If the
 * model cites that new number, it must still resolve to a row.
 */

function searchPart(output: string) {
  return {
    type: "tool-search_knowledge",
    toolCallId: `call-${output.length}`,
    state: "output-available",
    input: { query: "q" },
    output,
  };
}

function textPart(text: string) {
  return { type: "text", text };
}

const SEARCH_1 = [
  "[1] (residency-and-rates.md, chunk 3)",
  "A foreigner is a resident at 183 days.",
  "",
  "[2] (residency-and-rates.md, chunk 2)",
  "Progressive resident rates.",
].join("\n");

// The second search re-surfaces the residency chunk as [6] (a duplicate of [1])
// and adds a genuinely new filing chunk as [8].
const SEARCH_2 = [
  "[6] (residency-and-rates.md, chunk 3)",
  "A foreigner is a resident at 183 days.",
  "",
  "[8] (filing-and-deadlines.md, chunk 1)",
  "e-Filing deadline 18 April.",
].join("\n");

specTest(
  "TAX-CITE-001",
  "Sources shows exactly the cited passages, even when a cited [n] is a duplicate a later search re-surfaced",
  () => {
    const parts = [
      searchPart(SEARCH_1),
      searchPart(SEARCH_2),
      textPart("She is a non-resident [6]. The e-filing deadline is 18 April [8]."),
    ] as unknown as UIMessage["parts"];

    const sources = collectSources(parts);
    // Both cited numbers resolve; [6] is NOT dropped as a dup of [1].
    expect(sources.map((s) => s.n)).toEqual([6, 8]);
    expect(sources.find((s) => s.n === 6)?.filename).toBe("residency-and-rates.md");
    expect(sources.find((s) => s.n === 8)?.filename).toBe("filing-and-deadlines.md");
  },
  { category: "data" },
);

specTest(
  "TAX-CITE-002",
  "With no inline citations, Sources is empty (the retrieval stays visible in the Agent steps trace, not mislabelled as cited)",
  () => {
    const parts = [
      searchPart(SEARCH_1),
      searchPart(SEARCH_2),
      textPart("She is likely a non-resident and should file."),
    ] as unknown as UIMessage["parts"];

    expect(collectSources(parts)).toEqual([]);
  },
  { category: "data" },
);
