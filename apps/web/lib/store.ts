import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nanoid } from "nanoid";

/*
 * Generic JSON store, the persistence layer behind the HITL queue, gateway
 * logs, prompt versions, and eval runs.
 *
 * Two backends, chosen at runtime per operation:
 *  - S3 (when STORE_BUCKET or HITL_BUCKET is set): durable, shared across
 *    Lambda instances. Each value is its own object under <prefix>/, so
 *    concurrent writes never race on a shared file.
 *  - File (otherwise): one JSON file per prefix on disk, for local dev and the
 *    test suite. The directory defaults to the working directory and can be
 *    overridden with STORE_DIR.
 */

export interface JsonStore<T> {
  put(id: string, value: T): Promise<void>;
  get(id: string): Promise<T | null>;
  list(limit?: number): Promise<T[]>;
}

export interface JsonStoreOptions<T> {
  /**
   * Sort for list(). Defaults to key ascending, which is newest-first when ids
   * come from reverseChronoId().
   */
  compare?: (a: T, b: T) => number;
  /** File-backend path override (defaults to <prefix>.json in STORE_DIR/cwd). */
  filePath?: () => string;
}

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

async function s3() {
  const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } =
    await import("@aws-sdk/client-s3");
  return {
    client: new S3Client({}),
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
  };
}

export function createJsonStore<T>(
  prefix: string,
  options: JsonStoreOptions<T> = {},
): JsonStore<T> {
  const keyOf = (id: string) => `${prefix}/${id}.json`;
  const filePath = () =>
    options.filePath?.() ??
    join(
      process.env.STORE_DIR ?? /* turbopackIgnore: true */ process.cwd(),
      `${prefix}.json`,
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
    await writeFile(filePath(), JSON.stringify(map, null, 2), "utf8");
  }

  // ---------- public API ----------

  return {
    async put(id: string, value: T): Promise<void> {
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
      const map = await readMap();
      map[id] = value;
      await writeMap(map);
    },

    async get(id: string): Promise<T | null> {
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

    async list(limit?: number): Promise<T[]> {
      let values: T[];
      if (bucket()) {
        const { client, ListObjectsV2Command, GetObjectCommand } = await s3();
        const listed = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket(),
            Prefix: `${prefix}/`,
            // S3 returns keys in ascending lexicographic order, which is
            // newest-first for reverseChronoId keys, so the cap is safe when
            // no custom sort is requested.
            MaxKeys: options.compare ? undefined : limit,
          }),
        );
        const keys = (listed.Contents ?? [])
          .map((o) => o.Key)
          .filter((k): k is string => Boolean(k));
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
