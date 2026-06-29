"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AuditEntry } from "@/lib/governance";

/*
 * Paginated view of the full platform audit trail. The complete event list is
 * computed server-side and passed in; this only controls how much is shown at
 * once, so every event stays reachable without rendering thousands of rows.
 */

const PAGE_SIZE = 25;

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

export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  const [page, setPage] = useState(0);

  if (entries.length === 0) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-0">
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No activity yet. Use the assistant or run an eval, then refresh.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pageCount = Math.ceil(entries.length / PAGE_SIZE);
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const rows = entries.slice(start, start + PAGE_SIZE);

  return (
    <Card className="shadow-soft">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Workspace</th>
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">Detail</th>
                <th className="px-4 py-3 font-semibold">Flag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={start + i} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">
                    {formatTime(a.ts)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                    {a.workspace ?? "n/a"}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {a.summary}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.detail}</td>
                  <td className="px-4 py-2.5">
                    {a.flag ? (
                      <Badge className="bg-[var(--warning)] text-[var(--warning-foreground)] hover:bg-[var(--warning)]">
                        {a.flag}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">n/a</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {start + 1}&ndash;{Math.min(start + PAGE_SIZE, entries.length)} of{" "}
            {entries.length.toLocaleString()} events
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="tabular-nums">
              Page {current + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
