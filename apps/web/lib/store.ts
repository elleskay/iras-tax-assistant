import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nanoid } from "nanoid";

/*
 * Generic JSON store, the persistence layer behind workspaces, gateway logs,
 * prompt versions, eval runs, and the governance policy.
 *
 * Two backends, chosen at runtime per operation:
 *  - S3 (when STORE_BUCKET or HITL_BUCKET is set): durable, shared across
 *    Lambda instances. Each value is its own object under <prefix>/, so
 *    concurrent writes never race on a shared file.
 *  - File (otherwise): one JSON file per prefix on disk, for local dev and the
 *    test suite. The directory defaults to the working directory and can be
 *    overridden with STORE_DIR. Writes are serialised per file and written
 *    atomically (temp file + rename) so concurrent requests cannot tear or
 *    drop each other's updates.
 *
 * This module is the tenant-isolation boundary: the workspace key is baked
 * into every S3 key and file path, so it is validated here rather than
 * trusting every call site to have sanitised it.
 */

export interface JsonStore<T> {
  put(id: string, value: T): Promise<void>;
  get(id: string): Promise<T | null>;
  list(limit?: number): Promise<T[]>;
  delete(id: string): Promise<void>;
}

export interface JsonStoreOptions<T> {
  /**
   * Sort for list(). Defaults to key ascending, which is newest-first when ids
   * come from reverseChronoId().
   */
  compare?: (a: T, b: T) => number;
  /** File-backend path override (defaults to <prefix>.json in STORE_DIR/cwd). */
  filePath?: () => string;
  /**
   * Tenant key. When set, every value is isolated under this workspace:
   * S3 keys become <prefix>/<workspace>/<id>.json and the file backend uses
   * <prefix>-<workspace>.json. Omit for platform-level (global) stores.
   */
  workspace?: string;
}

// Same shape as lib/tenant.ts SLUG: the workspace becomes part of an S3 key
// and a filesystem path, so nothing outside this charset may ever reach it.
const WORKSPACE_RE = /^[a-z0-9-]{1,40}$/;
// Record ids appear in S3 keys as `<prefix>/<ws>/<id>.json`. Path separators
// would escape that layout; control characters have no business in a key.
// eslint-disable-next-line no-control-regex
const ID_RE = /^(?!.*[/\\])[^\x00-\x1f]{1,200}$/;

/**
 * An id that sorts newest-first under plain lexicographic (S3 key) ordering:
 * a reversed millisecond timestamp plus a random suffix for uniqueness.
 */
export function reverseChronoId(now: number = Date.now()): string {
  const reversed = String(9_999_999_999_999 - now).padStart(13, "0");
  return `${reversed}-${nanoid(6)}`;
}

function bucket(): string | undefined {
  return process.env.STORE_BUCKET ?? process.env.HITL_BUCKET;
}

// One S3 client per process: constructing a client per operation re-creates
// the connection pool and re-resolves the credential chain on every call.
let cachedS3: Promise<{
  client: InstanceType<typeof import("@aws-sdk/client-s3").S3Client>;
  PutObjectCommand: typeof import("@aws-sdk/client-s3").PutObjectCommand;
  GetObjectCommand: typeof import("@aws-sdk/client-s3").GetObjectCommand;
  ListObjectsV2Command: typeof import("@aws-sdk/client-s3").ListObjectsV2Command;
  DeleteObjectCommand: typeof import("@aws-sdk/client-s3").DeleteObjectCommand;
}> | null = null;

function s3() {
  cachedS3 ??= import("@aws-sdk/client-s3").then(
    ({
      S3Client,
      PutObjectCommand,
      GetObjectCommand,
      ListObjectsV2Command,
      DeleteObjectCommand,
    }) => ({
      client: new S3Client({}),
      PutObjectCommand,
      GetObjectCommand,
      ListObjectsV2Command,
      DeleteObjectCommand,
    }),
  );
  return cachedS3;
}

// File-backend write serialisation: a promise chain per file path so
// concurrent read-modify-write cycles cannot drop each other's entries.
const writeQueues = new Map<string, Promise<unknown>>();

function enqueue<R>(path: string, task: () => Promise<R>): Promise<R> {
  const prev = writeQueues.get(path) ?? Promise.resolve();
  const next = prev.then(task, task);
  writeQueues.set(path, next);
  return next;
}

export function createJsonStore<T>(
  prefix: string,
  options: JsonStoreOptions<T> = {},
): JsonStore<T> {
  const ws = options.workspace;
  if (ws !== undefined && !WORKSPACE_RE.test(ws)) {
    throw new Error(`Invalid workspace key for store "${prefix}": ${JSON.stringify(ws)}`);
  }
  const assertId = (id: string) => {
    if (!ID_RE.test(id)) {
      throw new Error(`Invalid record id for store "${prefix}": ${JSON.stringify(id)}`);
    }
  };
  const keyOf = (id: string) =>
    ws ? `${prefix}/${ws}/${id}.json` : `${prefix}/${id}.json`;
  const filePath = () =>
    options.filePath?.() ??
    join(
      process.env.STORE_DIR ?? /* turbopackIgnore: true */ process.cwd(),
      ws ? `${prefix}-${ws}.json` : `${prefix}.json`,
    );

  // ---------- file backend: one JSON object map per prefix ----------

  async function readMap(): Promise<Record<string, T>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(filePath(), "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, T>;
      }
      return {};
    } catch {
      return {};
    }
  }

  async function writeMap(map: Record<string, T>): Promise<void> {
    // Atomic replace: a concurrent reader either sees the old file or the new
    // one, never a torn half-write (which readMap would treat as an empty
    // store, wiping the prefix on the next put).
    const target = filePath();
    const tmp = `${target}.${nanoid(6)}.tmp`;
    await writeFile(tmp, JSON.stringify(map, null, 2), "utf8");
    await rename(tmp, target);
  }

  function mutateMap(mutate: (map: Record<string, T>) => void): Promise<void> {
    return enqueue(filePath(), async () => {
      const map = await readMap();
      mutate(map);
      await writeMap(map);
    });
  }

  // ---------- public API ----------

  return {
    async put(id: string, value: T): Promise<void> {
      assertId(id);
      if (bucket()) {
        const { client, PutObjectCommand } = await s3();
        await client.send(
          new PutObjectCommand({
            Bucket: bucket(),
            Key: keyOf(id),
            Body: JSON.stringify(value),
            ContentType: "application/json",
          }),
        );
        return;
      }
      await mutateMap((map) => {
        map[id] = value;
      });
    },

    async get(id: string): Promise<T | null> {
      assertId(id);
      if (bucket()) {
        const { client, GetObjectCommand } = await s3();
        try {
          const obj = await client.send(
            new GetObjectCommand({ Bucket: bucket(), Key: keyOf(id) }),
          );
          return JSON.parse(await obj.Body!.transformToString()) as T;
        } catch {
          return null;
        }
      }
      return (await readMap())[id] ?? null;
    },

    async delete(id: string): Promise<void> {
      assertId(id);
      if (bucket()) {
        const { client, DeleteObjectCommand } = await s3();
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket(), Key: keyOf(id) }),
        );
        return;
      }
      await mutateMap((map) => {
        delete map[id];
      });
    },

    async list(limit?: number): Promise<T[]> {
      let values: T[];
      if (bucket()) {
        const { client, ListObjectsV2Command, GetObjectCommand } = await s3();
        // S3 returns keys in ascending lexicographic order, which is
        // newest-first for reverseChronoId keys, so the cap is safe when no
        // custom sort is requested. With a custom sort every key must be
        // fetched, paging past the 1000-key response limit.
        const keys: string[] = [];
        let token: string | undefined;
        do {
          const listed = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket(),
              Prefix: ws ? `${prefix}/${ws}/` : `${prefix}/`,
              MaxKeys: options.compare ? undefined : limit,
              ContinuationToken: token,
            }),
          );
          for (const o of listed.Contents ?? []) {
            if (o.Key) keys.push(o.Key);
          }
          token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
          if (!options.compare && limit !== undefined && keys.length >= limit) break;
        } while (token);
        values = await Promise.all(
          keys.map(async (Key) => {
            const obj = await client.send(
              new GetObjectCommand({ Bucket: bucket(), Key }),
            );
            return JSON.parse(await obj.Body!.transformToString()) as T;
          }),
        );
      } else {
        const map = await readMap();
        values = Object.keys(map)
          .sort()
          .map((k) => map[k]);
      }
      if (options.compare) values.sort(options.compare);
      return limit === undefined ? values : values.slice(0, limit);
    },
  };
}
