import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { mkdtemp, lstat, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ErrorCode,
  McpError,
  type ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";

import type { NamedSkill } from "../domain/types.js";
import { ensureCachedRepo, resolveRemoteCommit } from "../summon/clone.js";
import { parseGithubUrl } from "../summon/giturl.js";

export const SKILLS_EXTENSION_ID = "io.modelcontextprotocol/skills" as const;
export const SKILL_RESOURCE_TEMPLATE = "skill://{+resourcePath}" as const;

const SKILL_MD = "SKILL.md";
const MAX_RESOURCE_BYTES = 16 * 1024 * 1024;
const MAX_RESOURCE_ENTRIES = 512;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/u;
const SAFE_RESOURCE_SEGMENT = /^[^/\\\u0000-\u001f\u007f]+$/u;
const SAFE_SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const ENCODED_PATH_ESCAPE = /%(?:2e|2f|5c)/iu;

export type SkillResourceManifestEntry = {
  uri: string;
  digest: string;
  size: number;
};

export type SkillEntry = {
  uri: string;
  frontmatter: Record<string, unknown>;
  resources: SkillResourceManifestEntry[] | "dynamic";
};

/**
 * Optional metadata hook for callers that have a real, point-in-time manifest.
 * It is deliberately separate from the reader: listing/get must not read skill
 * bodies merely to discover them.
 */
export type DescribeSkill = (
  skill: NamedSkill,
) => Promise<
  Partial<Pick<SkillEntry, "frontmatter" | "resources">> | undefined
>;

export type SkillResourceRead = {
  mimeType?: string | undefined;
  text?: string | undefined;
  blob?: string | undefined;
};

/** Read one file only after an MCP caller has supplied an allowlisted URI. */
export type ReadSkillResource = (
  skill: NamedSkill,
  relativePath: string,
) => Promise<SkillResourceRead>;

type ParsedSkillUri = {
  raw: string;
  segments: string[];
};

type BuiltSkillEntry = SkillEntry & {
  skill: NamedSkill;
  pathSegments: string[];
};

/** Build the server's flat skill namespace without fetching skill bodies. */
export async function buildSkillEntries(
  skills: readonly NamedSkill[],
  describeSkill?: DescribeSkill,
): Promise<SkillEntry[]> {
  const built = await buildInternalEntries(skills, describeSkill);
  return built.map(({ skill: _skill, pathSegments: _path, ...entry }) => entry);
}

export async function buildInternalEntries(
  skills: readonly NamedSkill[],
  describeSkill?: DescribeSkill,
): Promise<BuiltSkillEntry[]> {
  const sorted = [...skills].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const entries: BuiltSkillEntry[] = [];
  const seenUris = new Set<string>();

  for (const skill of sorted) {
    const description = await describeSkill?.(skill);
    const frontmatter = frontmatterFor(skill, description?.frontmatter);
    const pathSegments = skillPathSegments(skill, frontmatter.name as string);
    const uri = uriFromSegments([...pathSegments, SKILL_MD]);
    if (seenUris.has(uri)) {
      throw new Error(`Duplicate MCP skill URI: ${uri}`);
    }
    seenUris.add(uri);

    const resources =
      description?.resources === undefined || description.resources === "dynamic"
        ? "dynamic"
        : description.resources.map((resource) => ({ ...resource }));
    validateManifest(uri, resources);
    entries.push({
      uri,
      frontmatter,
      resources,
      skill,
      pathSegments,
    });
  }

  return entries.sort((left, right) => left.uri.localeCompare(right.uri));
}

/** Canonical URI retained for resource_link callers and compatibility. */
export function skillUri(id: string, name?: string): string {
  const rawSegments = splitIdentifier(id);
  const finalName = validSkillName(name) ? name : slug(rawSegments.at(-1) ?? id);
  const pathSegments = rawSegments.length > 1
    ? [...rawSegments.slice(0, -1), finalName]
    : [finalName];
  return uriFromSegments([...pathSegments, SKILL_MD]);
}

export function skillUriForSkill(skill: NamedSkill): string {
  const frontmatter = frontmatterFor(skill);
  return uriFromSegments([
    ...skillPathSegments(skill, frontmatter.name as string),
    SKILL_MD,
  ]);
}

/**
 * Resolve and read a resource through the public MCP resource surface. The
 * namespace is checked before the reader is called, so neither the default
 * GitHub reader nor an injected reader can receive an arbitrary path.
 */
export async function readSkillResource(
  entries: readonly BuiltSkillEntry[],
  rawUri: string,
  reader?: ReadSkillResource,
  tempRoot: string = tmpdir(),
): Promise<ReadResourceResult> {
  const parsed = parseSkillUri(rawUri);
  const resolved = resolveResource(entries, parsed);
  if (!resolved) {
    throw invalidResource(`No skill resource is served at ${rawUri}`);
  }

  const { entry, relativePath } = resolved;
  const manifestResource = Array.isArray(entry.resources)
    ? entry.resources.find((resource) => resource.uri === rawUri)
    : undefined;
  if (Array.isArray(entry.resources) && !manifestResource) {
    throw invalidResource(`Skill resource is not in the manifest: ${rawUri}`);
  }

  const content = reader
    ? await reader(entry.skill, relativePath)
    : await readRemoteSkillResource(entry.skill, relativePath, tempRoot);
  verifyResourceContent(rawUri, content, manifestResource);
  const contents = resourceContents(rawUri, content);
  return {
    // These fields are part of the current MCP cacheable-result shape. A zero
    // TTL avoids pretending that mutable upstream branches are immutable.
    resultType: "complete",
    ttlMs: 0,
    cacheScope: "private",
    contents: [contents],
  } as ReadResourceResult;
}

export function parseSkillUri(rawUri: string): ParsedSkillUri {
  if (typeof rawUri !== "string" || rawUri.length === 0 || rawUri.length > 4096) {
    throw invalidResource("Skill resource URI must be a bounded non-empty string.");
  }
  if (
    /[\u0000-\u001f\u007f]/u.test(rawUri) ||
    ENCODED_PATH_ESCAPE.test(rawUri) ||
    /(?:^|\/)\.{1,2}(?:\/|$)/u.test(rawUri)
  ) {
    throw invalidResource("Skill resource URI contains an unsafe path escape.");
  }

  let uri: URL;
  try {
    uri = new URL(rawUri);
  } catch {
    throw invalidResource(`Malformed skill resource URI: ${rawUri}`);
  }
  if (
    uri.protocol !== "skill:" ||
    uri.username ||
    uri.password ||
    uri.port ||
    uri.search ||
    uri.hash ||
    !uri.hostname ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(uri.hostname)
  ) {
    throw invalidResource(`Invalid skill resource URI: ${rawUri}`);
  }

  const encodedPath = uri.pathname;
  if (!encodedPath.startsWith("/") || encodedPath.endsWith("/")) {
    throw invalidResource(`Skill resource URI must name a file: ${rawUri}`);
  }
  const pathParts = encodedPath.slice(1).split("/");
  if (pathParts.some((part) => part.length === 0)) {
    throw invalidResource(`Skill resource URI contains an empty path segment: ${rawUri}`);
  }

  const segments = [uri.hostname.toLowerCase()];
  for (const part of pathParts) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      throw invalidResource(`Malformed skill resource URI: ${rawUri}`);
    }
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      /[\u0000-\u001f\u007f]/u.test(decoded) ||
      !SAFE_RESOURCE_SEGMENT.test(decoded)
    ) {
      throw invalidResource(`Unsafe skill resource path: ${rawUri}`);
    }
    segments.push(decoded);
  }

  if (segments.at(-1) === undefined || segments.length < 2) {
    throw invalidResource(`Skill resource URI must name a file: ${rawUri}`);
  }
  return { raw: rawUri, segments };
}

function resolveResource(
  entries: readonly BuiltSkillEntry[],
  parsed: ParsedSkillUri,
): { entry: BuiltSkillEntry; relativePath: string } | undefined {
  let best: { entry: BuiltSkillEntry; relativePath: string } | undefined;
  for (const entry of entries) {
    const root = entry.pathSegments;
    if (parsed.segments.length <= root.length) continue;
    if (!root.every((segment, index) => parsed.segments[index] === segment)) {
      continue;
    }
    const relativeSegments = parsed.segments.slice(root.length);
    const relativePath = relativeSegments.join("/");
    if (best === undefined || root.length > best.entry.pathSegments.length) {
      best = { entry, relativePath };
    }
  }
  return best;
}

function verifyResourceContent(
  uri: string,
  content: SkillResourceRead,
  manifest?: SkillResourceManifestEntry,
): void {
  const bytes =
    content.text !== undefined
      ? Buffer.from(content.text, "utf8")
      : content.blob !== undefined
        ? decodeBlob(content.blob, uri)
        : undefined;
  if (!bytes) return;
  if (bytes.byteLength > MAX_RESOURCE_BYTES) {
    throw new Error(`Skill resource exceeds ${MAX_RESOURCE_BYTES} bytes: ${uri}`);
  }
  if (
    manifest &&
    (bytes.byteLength !== manifest.size ||
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` !==
        manifest.digest)
  ) {
    throw new Error(`Skill resource failed manifest verification: ${uri}`);
  }
}

function decodeBlob(blob: string, uri: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(blob) || blob.length % 4 === 1) {
    throw new Error(`Skill resource returned an invalid blob: ${uri}`);
  }
  return Buffer.from(blob, "base64");
}

function resourceContents(
  uri: string,
  content: SkillResourceRead,
): {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
} {
  const hasText = content.text !== undefined;
  const hasBlob = content.blob !== undefined;
  if (hasText === hasBlob) {
    throw new Error("A skill resource reader must return exactly one of text or blob.");
  }
  return {
    uri,
    mimeType: content.mimeType ?? "application/octet-stream",
    ...(hasText ? { text: content.text } : { blob: content.blob }),
  };
}

function frontmatterFor(
  skill: NamedSkill,
  supplied?: Record<string, unknown>,
): Record<string, unknown> {
  const candidate = supplied ?? skill.frontmatter;
  if (
    candidate &&
    validSkillName(candidate.name) &&
    typeof candidate.description === "string"
  ) {
    // structuredClone prevents a caller's metadata object from being mutated
    // after skills/list or skills/get has returned it.
    return structuredClone(candidate);
  }

  // Older Tree projections carry these two frontmatter values as top-level
  // fields but do not preserve the complete YAML object. The fallback is
  // explicit and uses dynamic resources; it never claims a digest manifest.
  const name = slug(skill.id.split("/").at(-1) ?? skill.name);
  return { name, description: skill.description };
}

function skillPathSegments(skill: NamedSkill, name: string): string[] {
  const identifiers = splitIdentifier(skill.id);
  const prefix = identifiers.length > 1 ? identifiers.slice(0, -1) : [];
  return [...prefix, name];
}

function splitIdentifier(identifier: string): string[] {
  const cleaned = identifier.trim().replace(/^\/+|\/+$/gu, "");
  const segments = cleaned.split("/");
  if (
    !cleaned ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\") ||
        !SAFE_SEGMENT.test(segment),
    )
  ) {
    throw new Error(`Cannot expose unsafe skill identifier as an MCP URI: ${identifier}`);
  }
  return segments;
}

function validSkillName(value: unknown): value is string {
  return typeof value === "string" && SAFE_SKILL_NAME.test(value);
}

function slug(value: string): string {
  const result = value
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return validSkillName(result) ? result : "skill";
}

function uriFromSegments(segments: readonly string[]): string {
  if (segments.length < 2 || segments.some((segment) => !SAFE_SEGMENT.test(segment))) {
    throw new Error("Cannot create an MCP skill URI from unsafe path segments.");
  }
  const [authority, ...pathSegments] = segments;
  return `skill://${authority!.toLocaleLowerCase("en-US")}/${pathSegments
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function validateManifest(
  skillUriValue: string,
  resources: SkillEntry["resources"],
): void {
  if (resources === "dynamic") return;
  if (!Array.isArray(resources) || resources.length === 0 || resources.length > MAX_RESOURCE_ENTRIES) {
    throw new Error(`Invalid MCP skill manifest for ${skillUriValue}: expected 1-${MAX_RESOURCE_ENTRIES} resources.`);
  }

  const root = parseSkillUri(skillUriValue).segments.slice(0, -1);
  const seen = new Set<string>();
  let totalSize = 0;
  for (const resource of resources) {
    if (
      typeof resource.uri !== "string" ||
      typeof resource.digest !== "string" ||
      !DIGEST_PATTERN.test(resource.digest) ||
      !Number.isSafeInteger(resource.size) ||
      resource.size < 0
    ) {
      throw new Error(`Invalid MCP skill manifest entry for ${skillUriValue}.`);
    }
    const parsed = parseSkillUri(resource.uri);
    if (
      seen.has(resource.uri) ||
      parsed.segments.length <= root.length ||
      !root.every((segment, index) => parsed.segments[index] === segment)
    ) {
      throw new Error(`MCP skill manifest entry escapes ${skillUriValue}.`);
    }
    seen.add(resource.uri);
    totalSize += resource.size;
    if (totalSize > MAX_RESOURCE_BYTES) {
      throw new Error(`MCP skill manifest exceeds ${MAX_RESOURCE_BYTES} bytes: ${skillUriValue}.`);
    }
  }
  if (!seen.has(skillUriValue)) {
    throw new Error(`MCP skill manifest omits ${skillUriValue}.`);
  }
}

function invalidResource(message: string): McpError {
  return new McpError(ErrorCode.InvalidParams, message);
}

async function readRemoteSkillResource(
  skill: NamedSkill,
  relativePath: string,
  tempRoot: string,
): Promise<SkillResourceRead> {
  const sourceUrl = typeof skill.links.github === "string" ? skill.links.github : undefined;
  if (!sourceUrl || !/^https:\/\/github\.com\//u.test(sourceUrl)) {
    throw new Error(`Skill '${skill.id}' has no supported remote resource source.`);
  }

  const parsed = parseGithubUrl(sourceUrl);
  if (
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/u.test(
      parsed.repoUrl,
    ) ||
    (parsed.branch !== null &&
      (!/^[A-Za-z0-9._/-]+$/u.test(parsed.branch) ||
        parsed.branch.includes("..")))
  ) {
    throw new Error("Skill resource source is not a supported GitHub repository reference.");
  }
  const sourceSubpath = safeRelativePath(parsed.subpath, "skill source", true);
  const resourceSubpath = safeRelativePath(relativePath, "resource");
  const root = await mkdtemp(path.join(tempRoot, "skill-summon-resource-"));
  const repoPath = path.join(root, "repo");
  try {
    const commit = await resolveRemoteCommit(parsed.repoUrl, parsed.branch);
    const checkout = await ensureCachedRepo(repoPath, parsed.repoUrl, commit);
    const skillRoot = path.resolve(checkout.path, sourceSubpath);
    assertInside(checkout.path, skillRoot);
    await assertNoSymlinkPath(checkout.path, sourceSubpath);
    const filePath = path.resolve(skillRoot, resourceSubpath);
    assertInside(skillRoot, filePath);
    await assertNoSymlinkPath(skillRoot, resourceSubpath);

    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    const handle = await open(filePath, flags);
    try {
      const fileStat = await handle.stat();
      if (!fileStat.isFile()) {
        throw new Error(`Skill resource is not a regular file: ${relativePath}`);
      }
      if (fileStat.size > MAX_RESOURCE_BYTES) {
        throw new Error(`Skill resource exceeds ${MAX_RESOURCE_BYTES} bytes: ${relativePath}`);
      }
      const bytes = await handle.readFile();
      return bytesAsResource(relativePath, bytes);
    } finally {
      await handle.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function safeRelativePath(
  value: string,
  label: string,
  allowEmpty = false,
): string {
  if (allowEmpty && value === "") return "";
  const segments = value.split("/");
  if (
    (!allowEmpty && !value) ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\") ||
        !SAFE_RESOURCE_SEGMENT.test(segment),
    )
  ) {
    throw new Error(`Unsafe ${label} path.`);
  }
  return segments.join(path.sep);
}

function assertInside(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Skill resource path escapes its source root.");
  }
}

async function assertNoSymlinkPath(root: string, relative: string): Promise<void> {
  const segments = relative ? relative.split(path.sep) : [];
  let current = path.resolve(root);
  const rootStat = await lstat(current);
  if (rootStat.isSymbolicLink()) throw new Error("Refusing symlinked skill resource root.");
  for (const segment of segments) {
    current = path.join(current, segment);
    const entry = await lstat(current);
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing symlinked skill resource path: ${relative}.`);
    }
  }
}

function bytesAsResource(relativePath: string, bytes: Buffer): SkillResourceRead {
  const mimeType = mimeTypeFor(relativePath);
  if (mimeType === "application/octet-stream") {
    return { mimeType, blob: bytes.toString("base64") };
  }
  return { mimeType, text: bytes.toString("utf8") };
}

function mimeTypeFor(relativePath: string): string {
  if (relativePath === SKILL_MD || relativePath.toLocaleLowerCase("en-US").endsWith(".md")) {
    return "text/markdown";
  }
  const extension = path.extname(relativePath).toLocaleLowerCase("en-US");
  return {
    ".json": "application/json",
    ".txt": "text/plain",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".csv": "text/csv",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".ts": "text/typescript",
    ".py": "text/x-python",
    ".sh": "text/x-shellscript",
  }[extension] ?? "application/octet-stream";
}
