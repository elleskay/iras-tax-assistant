import { ScrollText } from "lucide-react";
import { AuditTable } from "@/components/audit-table";
import {
  buildAuditTrail,
  getEffectivePolicy,
  loadPlatformActivity,
} from "@/lib/governance";

// Reads the live stores at request time, never at build time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI Audit Trail - AI Tax Assistant Platform",
};

export default async function AuditPage() {
  const { calls, runs, promptVersions } = await loadPlatformActivity();
  const policy = await getEffectivePolicy();
  const audit = buildAuditTrail(
    { calls, runs, promptVersions },
    policy.guardrails.costCeiling.usdPerCall,
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-16">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
          <ScrollText className="h-5 w-5" /> AI Audit Trail
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          An automated record of every model call, eval run, and instruction
          change across all workspaces, newest first.
        </p>
      </div>

      <main id="main">
        <AuditTable entries={audit} />
      </main>
    </div>
  );
}
