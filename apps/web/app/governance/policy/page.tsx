import { Scale } from "lucide-react";
import { PolicyEditor } from "@/components/policy-editor";
import { PolicyCode } from "@/components/policy-code";
import { RoutingRules } from "@/components/routing-rules";
import { getEffectivePolicy } from "@/lib/governance";

// Reads the live policy at request time, never at build time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI Policy - AI Tax Assistant Platform",
};

export default async function PolicyPage() {
  const policy = await getEffectivePolicy();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-16">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
          <Scale className="h-5 w-5" /> AI Policy
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The platform governance policy (v{policy.version}, governance-as-code)
          and the deterministic model routing, applied uniformly to every
          workspace. Guardrail edits apply platform-wide; routing rules are saved
          per browser.
        </p>
      </div>

      <main id="main" className="flex flex-col gap-4">
        <PolicyEditor policy={policy} />
        <RoutingRules />
        <PolicyCode policy={policy} />
      </main>

      <p className="mt-8 text-xs text-muted-foreground">
        Unofficial demo, not affiliated with IRAS.
      </p>
    </div>
  );
}
