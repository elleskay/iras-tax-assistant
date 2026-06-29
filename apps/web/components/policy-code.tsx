"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  DEFAULT_CONFIG,
  ROUTING_CONFIG_CHANGED,
  loadConfig,
  type RoutingConfig,
} from "@/lib/routing-rules";
import type { GovernancePolicy } from "@/lib/governance";

/*
 * The full effective policy as code: the closing "governance-as-code" artifact
 * for the Policy tab. Guardrails come from the server (the saved platform
 * policy, passed in); routing is read live from the browser so it reflects edits
 * made in the routing table above. It re-reads on the routing-changed event so
 * the JSON stays in sync as rules are edited.
 */
export function PolicyCode({ policy }: { policy: GovernancePolicy }) {
  // Start from DEFAULT_CONFIG so SSR and first client render match; the real
  // (possibly edited) config is read from localStorage after mount.
  const [routing, setRouting] = useState<RoutingConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    const sync = () => setRouting(loadConfig());
    sync();
    window.addEventListener(ROUTING_CONFIG_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ROUTING_CONFIG_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const effective = {
    version: policy.version,
    updated: policy.updated,
    guardrails: policy.guardrails,
    routing,
  };

  return (
    <Card className="shadow-soft">
      <CardContent className="p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Effective policy (as code)
        </p>
        <pre className="max-h-72 overflow-auto rounded-md bg-muted/60 p-3 text-xs leading-relaxed text-foreground">
          {JSON.stringify(effective, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
