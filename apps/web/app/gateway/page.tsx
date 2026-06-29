import { ArrowRightLeft, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listGatewayCalls } from "@/lib/gateway-store";
import { activeWorkspace } from "@/lib/tenant";

// Reads the request log at request time, never at build time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gateway - AI Tax Assistant Platform",
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-SG", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "Asia/Singapore",
    });
  } catch {
    return iso;
  }
}

function formatCost(usd: number) {
  if (usd === 0) return "$0";
  if (usd < 0.0001) return "<$0.0001";
  return `$${usd.toFixed(4)}`;
}

export default async function GatewayPage() {
  const calls = await listGatewayCalls(50, await activeWorkspace());

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-16">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
          <ArrowRightLeft className="h-5 w-5" /> AI Gateway
        </h2>
        <p className="text-sm text-muted-foreground">
          Every model call goes through one gateway. It records latency, token
          usage, and cost (from the registry list prices), and falls back to the
          alternate provider on errors. The 50 most recent calls:
        </p>
      </div>

      <main id="main">
        {calls.length === 0 ? (
          <Card data-testid="empty-gateway" className="border-dashed shadow-none">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No calls yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Ask the assistant a question or run an eval, then refresh this
                page to see the request log.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-soft">
            <CardContent className="overflow-x-auto p-0">
              <table data-testid="gateway-calls" className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-semibold">Time</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Model</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Kind</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Route</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Tokens in/out</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Latency</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <tr
                      key={c.id}
                      data-testid="gateway-call"
                      className="border-b last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">
                        {formatTime(c.timestamp)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-foreground">{c.modelLabel}</span>
                        {c.fallbackUsed ? (
                          <Badge className="ml-2 bg-[var(--warning)] text-[var(--warning-foreground)] hover:bg-[var(--warning)]">
                            fallback
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{c.kind}</td>
                      <td className="max-w-48 truncate px-4 py-2.5 text-muted-foreground">
                        {c.route ?? ""}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {c.inputTokens.toLocaleString()} / {c.outputTokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {c.latencyMs.toLocaleString()} ms
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatCost(c.costUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
