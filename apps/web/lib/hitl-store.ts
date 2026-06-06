import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/*
 * HITL (human-in-the-loop) escalation store.
 *
 * Two backends, chosen at runtime:
 *  - S3 (when HITL_BUCKET is set): durable, shared across Lambda instances. Each
 *    escalation is its own object under escalations/, so concurrent writes never
 *    race on a shared file. Production uses this (the Lambda filesystem is
 *    read-only, so a local file cannot be written there).
 *  - File (otherwise): a JSON file on disk, for local dev and the test suite.
 */

export type EscalationStatus = "pending" | "resolved";

export interface Escalation {
  id: number;
  timestamp: string;
  reason: string;
  original_query: string;
  status: EscalationStatus;
}

const BUCKET = process.env.HITL_BUCKET;
const PREFIX = "escalations/";

// ---------- S3 backend ----------

async function s3() {
  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
  } = await import("@aws-sdk/client-s3");
  return {
    client: new S3Client({}),
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
  };
}

async function s3Put(entry: Escalation): Promise<void> {
  const { client, PutObjectCommand } = await s3();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${PREFIX}${entry.id}.json`,
      Body: JSON.stringify(entry),
      ContentType: "application/json",
    }),
  );
}

async function s3List(): Promise<Escalation[]> {
  const { client, ListObjectsV2Command, GetObjectCommand } = await s3();
  const listed = await client.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX }),
  );
  const keys = (listed.Contents ?? [])
    .map((o) => o.Key)
    .filter((k): k is string => Boolean(k));
  const entries = await Promise.all(
    keys.map(async (Key) => {
      const obj = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key }));
      return JSON.parse(await obj.Body!.transformToString()) as Escalation;
    }),
  );
  return entries.sort((a, b) => b.id - a.id);
}

async function s3Get(id: number): Promise<Escalation | null> {
  const { client, GetObjectCommand } = await s3();
  try {
    const obj = await client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `${PREFIX}${id}.json` }),
    );
    return JSON.parse(await obj.Body!.transformToString()) as Escalation;
  } catch {
    return null;
  }
}

// ---------- file backend (local dev + tests) ----------

function queuePath(): string {
  return (
    process.env.HITL_QUEUE_PATH ??
    join(/* turbopackIgnore: true */ process.cwd(), "hitl-queue.json")
  );
}

async function readQueue(): Promise<Escalation[]> {
  try {
    return JSON.parse(await readFile(queuePath(), "utf8")) as Escalation[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: Escalation[]): Promise<void> {
  await writeFile(queuePath(), JSON.stringify(queue, null, 2), "utf8");
}

// ---------- public API ----------

export async function addEscalation(
  reason: string,
  originalQuery: string,
): Promise<Escalation> {
  const entry: Escalation = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    reason,
    original_query: originalQuery,
    status: "pending",
  };
  if (BUCKET) {
    await s3Put(entry);
    return entry;
  }
  const queue = await readQueue();
  entry.id = Date.now() + queue.length; // unique within the same millisecond
  queue.push(entry);
  await writeQueue(queue);
  return entry;
}

export async function listEscalations(): Promise<Escalation[]> {
  if (BUCKET) return s3List();
  return (await readQueue()).sort((a, b) => b.id - a.id);
}

export async function resolveEscalation(id: number): Promise<Escalation | null> {
  if (BUCKET) {
    const entry = await s3Get(id);
    if (!entry) return null;
    entry.status = "resolved";
    await s3Put(entry);
    return entry;
  }
  const queue = await readQueue();
  const entry = queue.find((e) => e.id === id);
  if (!entry) return null;
  entry.status = "resolved";
  await writeQueue(queue);
  return entry;
}
