import { NextResponse } from "next/server";
import {
  listWorkspaces,
  getWorkspace,
  saveWorkspace,
  deleteWorkspace,
  isSeedWorkspace,
  type Workspace,
  type TaxType,
} from "@/lib/workspaces";

// Lists the platform's workspaces (one per tax type), creates new ones
// (self-serve onboarding), and updates a workspace's per-workspace tuning
// (default model, cost ceiling). The platform governance standard is shared.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export async function GET() {
  const workspaces = await listWorkspaces();
  return NextResponse.json({
    workspaces: workspaces.map((w) => ({ ...w, seed: isSeedWorkspace(w.id) })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    taxType?: unknown;
    defaultModelId?: unknown;
    costCeilingUsd?: unknown;
  } | null;
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return new Response("Expected { name }", { status: 400 });
  }
  const taxType: TaxType =
    typeof body.taxType === "string" && body.taxType.trim()
      ? slugify(body.taxType)
      : slugify(body.name);
  const ws: Workspace = {
    id: slugify(body.name),
    name: body.name.trim().slice(0, 60),
    taxType,
    blurb: "Custom workspace, governed by the platform standard.",
    settings: {
      defaultModelId:
        typeof body.defaultModelId === "string" && body.defaultModelId
          ? body.defaultModelId
          : "gpt-4o-mini",
      costCeilingUsd:
        typeof body.costCeilingUsd === "number" && body.costCeilingUsd > 0
          ? body.costCeilingUsd
          : 0.05,
    },
  };
  await saveWorkspace(ws);
  return NextResponse.json({ workspace: ws });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    defaultModelId?: unknown;
    costCeilingUsd?: unknown;
  } | null;
  if (!body || typeof body.id !== "string") {
    return new Response("Expected { id }", { status: 400 });
  }
  const ws = await getWorkspace(body.id);
  if (!ws) return new Response("Unknown workspace", { status: 404 });
  const updated: Workspace = {
    ...ws,
    settings: {
      defaultModelId:
        typeof body.defaultModelId === "string" && body.defaultModelId
          ? body.defaultModelId
          : ws.settings.defaultModelId,
      costCeilingUsd:
        typeof body.costCeilingUsd === "number" && body.costCeilingUsd > 0
          ? body.costCeilingUsd
          : ws.settings.costCeilingUsd,
    },
  };
  await saveWorkspace(updated);
  return NextResponse.json({ workspace: updated });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (!body || typeof body.id !== "string") {
    return new Response("Expected { id }", { status: 400 });
  }
  const ok = await deleteWorkspace(body.id);
  if (!ok) {
    return NextResponse.json(
      { error: "Seeded example workspaces cannot be deleted" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
