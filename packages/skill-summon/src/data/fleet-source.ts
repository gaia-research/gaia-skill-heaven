import { lstat, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { GaiaRegistrySource } from "./source.js";
import type { GaiaRegistrySnapshot, NamedSkill } from "../domain/types.js";
import { discardCachedRepo, ensureCachedRepo } from "../summon/clone.js";
import { parseGithubUrl } from "../summon/giturl.js";

const MAX_DISCOVERY_DEPTH = 8;
const MAX_DISCOVERED_SKILLS = 1_000;
const MAX_SKILL_MD_BYTES = 1_000_000;
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build"]);

export type GithubFleetCheckout = {
  path: string;
  repoUrl: string;
  webUrl: string;
  commit: string;
  contributor: string;
  cleanup(): Promise<void>;
};

export type GithubFleetSourceOptions = {
  checkout?: ((sourceUrl: string) => Promise<GithubFleetCheckout>) | undefined;
  now?: (() => Date) | undefined;
};

/** Flat GitHub skill fleets are normalized into the existing summon collection interface. */
export class GithubFleetSource implements GaiaRegistrySource {
  readonly #sourceUrl: string;
  readonly #checkout: (sourceUrl: string) => Promise<GithubFleetCheckout>;
  readonly #now: () => Date;

  constructor(sourceUrl: string, options: GithubFleetSourceOptions = {}) {
    this.#sourceUrl = sourceUrl;
    this.#checkout = options.checkout ?? checkoutGithubFleet;
    this.#now = options.now ?? (() => new Date());
  }

  async load(): Promise<GaiaRegistrySnapshot> {
    const checkout = await this.#checkout(this.#sourceUrl);
    try {
      const skills = await discoverFleetSkills(checkout);
      if (skills.length === 0) {
        throw new Error(
          `GitHub fleet ${this.#sourceUrl} contains no discoverable SKILL.md files within depth ${MAX_DISCOVERY_DEPTH}.`,
        );
      }
      const generatedAt = this.#now().toISOString();
      return {
        generic: { generatedAt, skills: [] },
        named: { generatedAt, buckets: { fleet: skills } },
        source: {
          kind: "fleet",
          rootUrl: this.#sourceUrl,
          genericUrl: this.#sourceUrl,
          namedUrl: this.#sourceUrl,
          commit: checkout.commit,
          fetchedAt: generatedAt,
        },
      };
    } finally {
      await checkout.cleanup();
    }
  }
}

export async function checkoutGithubFleet(sourceUrl: string): Promise<GithubFleetCheckout> {
  const parsed = parseGithubUrl(sourceUrl.replace(/\.git\/?$/u, ""));
  if (!/^https:\/\/github\.com\//u.test(sourceUrl) || !parsed.repoUrl.endsWith(".git")) {
    throw new Error(`Skill fleet source must be a GitHub repository URL, got: ${sourceUrl}`);
  }
  const root = await mkdtemp(path.join(tmpdir(), "skill-summon-fleet-"));
  const repoPath = path.join(root, "repo");
  try {
    const clone = await ensureCachedRepo(repoPath, parsed.repoUrl, parsed.branch);
    const scanRoot = path.resolve(clone.path, parsed.subpath);
    const relative = path.relative(path.resolve(clone.path), scanRoot);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Fleet subpath escapes repository root: ${parsed.subpath}`);
    }
    const scanStat = await lstat(scanRoot);
    if (scanStat.isSymbolicLink() || !scanStat.isDirectory()) {
      throw new Error(`Fleet path is not a real directory: ${parsed.subpath}`);
    }
    const webUrl = parsed.repoUrl.replace(/\.git$/u, "");
    const contributor = new URL(webUrl).pathname.split("/").filter(Boolean)[0] ?? "fleet";
    return {
      path: scanRoot,
      repoUrl: parsed.repoUrl,
      webUrl,
      commit: clone.commit,
      contributor,
      cleanup: async () => {
        await discardCachedRepo(repoPath);
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function discoverFleetSkills(checkout: GithubFleetCheckout): Promise<NamedSkill[]> {
  const discovered: NamedSkill[] = [];

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > MAX_DISCOVERY_DEPTH || discovered.length >= MAX_DISCOVERED_SKILLS) return;
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const skillFile = entries.find((entry) => entry.name === "SKILL.md" && entry.isFile());
    if (skillFile) {
      const skillPath = path.join(directory, skillFile.name);
      const skillStat = await stat(skillPath);
      if (skillStat.size > MAX_SKILL_MD_BYTES) {
        throw new Error(`Fleet SKILL.md exceeds ${MAX_SKILL_MD_BYTES} bytes: ${skillPath}`);
      }
      const source = await readFile(skillPath, "utf8");
      const frontmatter = readSkillFrontmatter(source);
      const relativeDirectory = path.relative(checkout.path, directory).split(path.sep).join("/");
      const fallbackName = path.basename(directory);
      const name = frontmatter.name || fallbackName;
      const idPath = relativeDirectory || fallbackName;
      const skillMdPath = relativeDirectory ? `${relativeDirectory}/SKILL.md` : "SKILL.md";
      const sourceUrl = `${checkout.webUrl}/blob/${checkout.commit}/${encodeGithubPath(skillMdPath)}`;
      const humanLed = frontmatter["disable-model-invocation"] === "true";
      discovered.push({
        id: `${checkout.contributor}/${slug(idPath)}`,
        name,
        contributor: checkout.contributor,
        invocation: humanLed ? "human" : "model",
        origin: "fleet",
        status: "fleet",
        description:
          frontmatter.description || `Skill from ${checkout.webUrl} at ${skillMdPath}.`,
        catalogRef: slug(name),
        tags: [...new Set([...words(name), ...words(relativeDirectory)])],
        links: { github: sourceUrl },
        evidence: [],
      });
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRECTORIES.has(entry.name)) continue;
      await walk(path.join(directory, entry.name), depth + 1);
      if (discovered.length >= MAX_DISCOVERED_SKILLS) break;
    }
  }

  await walk(checkout.path, 0);
  if (discovered.length >= MAX_DISCOVERED_SKILLS) {
    throw new Error(`GitHub fleet exceeds the ${MAX_DISCOVERED_SKILLS}-skill discovery limit.`);
  }
  return discovered;
}

export function readSkillFrontmatter(source: string): Record<string, string> {
  const lines = source.split(/\r?\n/u);
  if (lines[0]?.trim() !== "---") return {};
  const out: Record<string, string> = {};
  let key: string | undefined;
  let values: string[] = [];
  const flush = (): void => {
    if (key) out[key] = values.join(" ").replace(/\s+/gu, " ").trim();
    key = undefined;
    values = [];
  };
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (line.trim() === "---") break;
    // No `\s*` before the capture: it would overlap with `(.*)` and make the
    // match ambiguous (polynomial backtracking on `A:` + many spaces). The
    // value is trimmed below, so leading whitespace is dropped anyway.
    const match = /^([A-Za-z_][\w-]*):(.*)$/u.exec(line);
    if (match) {
      flush();
      key = match[1];
      const value = (match[2] ?? "").trim();
      values = [">-", ">", "|", "|-"].includes(value) ? [] : [stripQuotes(value)];
    } else if (key && /^\s+\S/u.test(line)) {
      values.push(line.trim());
    } else if (!(key && line.trim() === "")) {
      flush();
    }
  }
  flush();
  return out;
}

function stripQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function words(value: string): string[] {
  return value.toLocaleLowerCase("en-US").split(/[^a-z0-9]+/u).filter(Boolean);
}

function slug(value: string): string {
  return words(value).join("-") || "skill";
}

function encodeGithubPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}
