"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  CheckCircle2,
  Inbox,
  Loader2,
  MessageSquareQuote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Escalation {
  id: number;
  timestamp: string;
  reason: string;
  original_query: string;
  status: "pending" | "resolved";
}

export default function AdminPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/hitl", { cache: "no-store" });
    const data = await res.json();
    setEscalations(data.escalations ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: number) {
    setResolvingId(id);
    try {
      await fetch("/api/hitl", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load();
    } finally {
      setResolvingId(null);
    }
  }

  const pending = escalations.filter((e) => e.status === "pending");
  const resolved = escalations.filter((e) => e.status === "resolved");

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleString("en-SG", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 pb-16">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-navy">Advisor escalation queue</h2>
        <p className="text-sm text-muted-foreground">
          Questions the assistant routed to a human
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-soft">
          <CardContent className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--warning)] text-[var(--warning-foreground)]">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {pending.length}
              </p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-[var(--success)]">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {resolved.length}
              </p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <main id="main" className="mt-8 flex flex-col gap-8">
        {/* Pending */}
        <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
          <h2
            id="pending-heading"
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <Clock className="h-4 w-4" /> Pending
          </h2>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading queue...
            </p>
          ) : pending.length === 0 ? (
            <Card data-testid="empty-pending" className="border-dashed shadow-none">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">All clear</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  No pending escalations. The assistant is handling everything so far.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {pending.map((e) => (
                <li key={e.id} data-testid="escalation" data-status={e.status}>
                  <Card className="shadow-soft transition-shadow hover:shadow-card">
                    <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="gap-1 bg-[var(--warning)] text-[var(--warning-foreground)] hover:bg-[var(--warning)]">
                            <Clock className="h-3 w-3" /> Pending
                          </Badge>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            Case #{e.id} &middot; {formatTime(e.timestamp)}
                          </span>
                        </div>
                        <p className="flex items-start gap-2 font-medium text-foreground">
                          <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          {e.original_query}
                        </p>
                        <p className="pl-6 text-sm text-muted-foreground">
                          Reason: {e.reason}
                        </p>
                      </div>
                      <Button
                        onClick={() => resolve(e.id)}
                        disabled={resolvingId === e.id}
                        className="shrink-0"
                      >
                        {resolvingId === e.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {resolvingId === e.id ? "Resolving..." : "Resolve"}
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Resolved */}
        {resolved.length > 0 ? (
          <section aria-labelledby="resolved-heading" className="flex flex-col gap-3">
            <h2
              id="resolved-heading"
              className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <CheckCircle2 className="h-4 w-4" /> Resolved
            </h2>
            <ul className="flex flex-col gap-2">
              {resolved.map((e) => (
                <li key={e.id} data-testid="escalation" data-status={e.status}>
                  <Card className="bg-muted/40 shadow-none">
                    <CardContent className="flex items-center justify-between gap-3 py-3">
                      <p className="truncate text-sm text-muted-foreground">
                        {e.original_query}
                      </p>
                      <Badge className="gap-1 bg-[var(--success)] text-[var(--success-foreground)] hover:bg-[var(--success)]">
                        <CheckCircle2 className="h-3 w-3" /> Resolved
                      </Badge>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
