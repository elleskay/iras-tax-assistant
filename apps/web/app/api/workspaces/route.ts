import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listWorkspaces,
  getWorkspace,
  saveWorkspace,
  deleteWorkspace,
  isSeedWorkspace,
  type Workspace,
} from "@/lib/workspaces";
import { findModel } from "@/lib/model-registry";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";

// Lists the platform's workspaces (one per tax type), creates new ones
// (self-serve onboarding), and updates a workspace's per-workspace tuning
// (default model, cost ceiling). The platform governance standard is shared.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Writes create durable store objects; cap them like the other write routes.
const limiter = makeLimiter({ tokens: 20, window: "1 m", prefix: "workspaces" });

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

// A model id must exist in the registry: a typo would otherwise be saved and
// silently fall back at chat time. The ceiling gets a sane upper bound so a
// junk value cannot render on the governance pages.
const modelIdSchema = z
  .string()
  .max(80)
  .refine((id) => Boolean(findModel(id)), { message: "Unknown model id" });
const ceilingSchema = z.number().positive().max(10);

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  taxType: z.string().trim().min(1).max(40).optional(),
  defaultModelId: modelIdSchema.optional(),
  costCeilingUsd: ceilingSchema.optional(),
});

const patchSchema = z.object({
  id: z.string().min(1).max(40),
  defaultModelId: modelIdSchema.optional(),
  costCeilingUsd: ceilingSchema.optional(),
});

export async function GET() {
  const workspaces = await listWorkspaces();
  return NextResponse.json({
    workspaces: workspaces.map((w) => ({ ...w, seed: isSeedWorkspace(w.id) })),
  });
}

export async function POST(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input: expected { name, taxType?, defaultModelId?, costCeilingUsd? }" },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const id = slugify(body.name);
  // saveWorkspace is a blind upsert; without this check a create with an
  // existing name (including a seed's) would silently overwrite it.
  if (await getWorkspace(id)) {
    return NextResponse.json(
      { error: `A workspace with the id "${id}" already exists` },
      { status: 409 },
    );
  }
  const ws: Workspace = {
    id,
    name: body.name,
    taxType: body.taxType ? slugify(body.taxType) : slugify(body.name),
    blurb: "Custom workspace, governed by the platform standard.",
    settings: {
      defaultModelId: body.defaultModelId ?? "gpt-4o-mini",
      costCeilingUsd: body.costCeilingUsd ?? 0.05,
    },
  };
  await saveWorkspace(ws);
  return NextResponse.json({ workspace: ws }, { status: 201 });
}

export async function PATCH(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input: expected { id, defaultModelId?, costCeilingUsd? }" },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const ws = await getWorkspace(body.id);
  if (!ws) {
    return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });
  }
  const updated: Workspace = {
    ...ws,
    settings: {
      defaultModelId: body.defaultModelId ?? ws.settings.defaultModelId,
      costCeilingUsd: body.costCeilingUsd ?? ws.settings.costCeilingUsd,
    },
  };
  await saveWorkspace(updated);
  return NextResponse.json({ workspace: updated });
}

export async function DELETE(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "Expected { id }" }, { status: 400 });
  }
  const ok = await deleteWorkspace(body.id);
  if (!ok) {
    // Refusing to delete a protected seed is a permission condition, not a
    // malformed request.
    return NextResponse.json(
      { error: "Seeded example workspaces cannot be deleted" },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
