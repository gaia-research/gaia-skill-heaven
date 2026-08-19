import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_CACHE_MAX_MB = 16;
const CACHE_DIR_NAME = "skill-summon-payload-cache-v1";
const METADATA_FILE = "metadata.json";
const PAYLOAD_DIR = "payload";

type CacheMetadata = PayloadIdentity & {
  key: string;
  retainedAt: string;
  bytes: number;
};

export type PayloadIdentity = {
  repoUrl: string;
  commit: string;
  subpath: string;
};

export type PayloadCacheOptions = {
  root?: string | undefined;
  maxBytes?: number | undefined;
};

/** A bounded, commit-addressed store containing payload directories, never clones. */
export class PayloadCache {
  readonly root: string;
  readonly maxBytes: number;
  readonly #entriesRoot: string;

  constructor(opts: PayloadCacheOptions = {}) {
    this.root = opts.root ?? payloadCacheRoot();
    this.maxBytes = opts.maxBytes ?? payloadCacheMaxBytes();
    if (!Number.isFinite(this.maxBytes) || this.maxBytes < 0) {
      throw new Error(
        `Payload cache size must be non-negative, got: ${this.maxBytes}`,
      );
    }
    this.#entriesRoot = path.join(this.root, "entries");
  }

  async lookup(identity: PayloadIdentity): Promise<string | undefined> {
    await this.prune();
    const entryRoot = this.#entryRoot(identity);
    const payload = path.join(entryRoot, PAYLOAD_DIR);
    try {
      const metadata = JSON.parse(
        await readFile(path.join(entryRoot, METADATA_FILE), "utf8"),
      ) as CacheMetadata;
      if (metadata.key !== cacheKey(identity)) return undefined;
      if (!(await stat(path.join(payload, "SKILL.md"))).isFile())
        return undefined;
      const now = new Date();
      await utimes(entryRoot, now, now);
      return payload;
    } catch {
      await rm(entryRoot, { recursive: true, force: true });
      return undefined;
    }
  }

  /** Retain a completed payload atomically. Returns false when it exceeds the cap. */
  async store(identity: PayloadIdentity, sourceDir: string): Promise<boolean> {
    const payloadBytes = await directorySize(sourceDir);
    if (payloadBytes > this.maxBytes || this.maxBytes === 0) return false;

    await mkdir(this.#entriesRoot, { recursive: true });
    const key = cacheKey(identity);
    const entryRoot = path.join(this.#entriesRoot, key);
    if (await pathExists(entryRoot)) {
      const now = new Date();
      await utimes(entryRoot, now, now);
      await this.prune();
      return true;
    }

    const temporaryRoot = path.join(
      this.#entriesRoot,
      `.tmp-${process.pid}-${randomUUID()}`,
    );
    try {
      const payload = path.join(temporaryRoot, PAYLOAD_DIR);
      await mkdir(temporaryRoot, { recursive: true });
      await cp(sourceDir, payload, {
        recursive: true,
        filter: (source) => path.basename(source) !== ".git",
      });
      const metadata: CacheMetadata = {
        ...identity,
        key,
        retainedAt: new Date().toISOString(),
        bytes: payloadBytes,
      };
      await writeFile(
        path.join(temporaryRoot, METADATA_FILE),
        JSON.stringify(metadata, null, 2),
        "utf8",
      );
      try {
        await rename(temporaryRoot, entryRoot);
      } catch (error) {
        if (!(await pathExists(entryRoot))) throw error;
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }

    await this.prune();
    return await pathExists(entryRoot);
  }

  async prune(): Promise<void> {
    let entries;
    try {
      entries = await readdir(this.#entriesRoot, { withFileTypes: true });
    } catch {
      return;
    }

    const retained: Array<{ root: string; bytes: number; accessedAt: number }> =
      [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entryRoot = path.join(this.#entriesRoot, entry.name);
      if (entry.name.startsWith(".tmp-")) {
        const pid = Number(/^\.tmp-(\d+)-/u.exec(entry.name)?.[1]);
        if (!isProcessLive(pid)) {
          await rm(entryRoot, { recursive: true, force: true });
        }
        continue;
      }
      const entryStat = await lstat(entryRoot);
      retained.push({
        root: entryRoot,
        bytes: await directorySize(entryRoot),
        accessedAt: entryStat.mtimeMs,
      });
    }

    let totalBytes = retained.reduce((total, entry) => total + entry.bytes, 0);
    retained.sort((left, right) => left.accessedAt - right.accessedAt);
    for (const entry of retained) {
      if (totalBytes <= this.maxBytes) break;
      await rm(entry.root, { recursive: true, force: true });
      totalBytes -= entry.bytes;
    }
  }

  #entryRoot(identity: PayloadIdentity): string {
    return path.join(this.#entriesRoot, cacheKey(identity));
  }
}

export function payloadCacheRoot(): string {
  return (
    process.env.SKILL_SUMMON_CACHE_DIR ?? path.join(tmpdir(), CACHE_DIR_NAME)
  );
}

function payloadCacheMaxBytes(): number {
  const configured = process.env.SKILL_SUMMON_CACHE_MAX_MB;
  if (configured === undefined) return DEFAULT_CACHE_MAX_MB * 1024 ** 2;
  const megabytes = Number(configured);
  if (!Number.isFinite(megabytes) || megabytes < 0) {
    throw new Error(
      `SKILL_SUMMON_CACHE_MAX_MB must be a non-negative number, got: ${configured}`,
    );
  }
  return Math.floor(megabytes * 1024 ** 2);
}

function cacheKey(identity: PayloadIdentity): string {
  return createHash("sha256")
    .update(
      JSON.stringify([identity.repoUrl, identity.commit, identity.subpath]),
    )
    .digest("hex");
}

/**
 * Total size of the payload's FILES. A directory's own inode size is
 * deliberately excluded: it is platform-dependent — roughly 64 bytes on APFS
 * but 4096 on ext4 — so counting it makes the cache's size cap mean something
 * different per platform, and can push a genuinely tiny payload over a small
 * cap on Linux while it fits on macOS. Only file bytes are the payload.
 */
async function directorySize(root: string): Promise<number> {
  const target = await lstat(root);
  if (!target.isDirectory()) return target.size;
  let bytes = 0;
  for (const entry of await readdir(root)) {
    bytes += await directorySize(path.join(root, entry));
  }
  return bytes;
}

function isProcessLive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
