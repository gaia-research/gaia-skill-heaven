import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

import {
  INSTALLABILITY_PROJECTION_SCHEMA,
  assessInstallability,
  assertInstallabilityProjectionSkill,
  withInstallability,
  withUnknownInstallability,
  type InstallabilityAssessment,
  type InstallabilityCandidateContext,
  type InstallabilityObservationRef,
  type InstallabilityProjection,
  type InstallabilityProjectionSkill,
  type InstallabilitySourceRoute,
  type SkillIndex,
} from "skill-zero";

import type { IndexedSkill } from "skill-zero";

const PROJECTION_KEYS = new Set(["schema", "indexPath", "observations", "skills"]);
const OBSERVATION_REF_KEYS = new Set(["digest", "checkedAt", "runId"]);
const SKILL_KEYS = new Set([
  "state",
  "reason",
  "observationDigest",
  "observedAt",
  "currentSourceRoute",
  "currentSkillContentSha256",
  "observedSourceRoute",
  "observedSkillContentSha256",
  "resolvedRevision",
  "deliveredContentSha256",
]);
const ROUTE_KEYS = new Set([
  "url",
  "owner",
  "repo",
  "ref",
  "subpath",
  "entrypoint",
  "installSubpath",
]);

export type InstallabilitySource = {
  load(): Promise<unknown>;
  /** Actual source URL after a successful load, when the source has one. */
  sourceUrl?: string | undefined;
};

export type InstallabilitySourceContext = {
  source: string;
  sourceKind: "tree" | "fleet" | "unknown";
};

export type InstallabilityAdapterStatus = {
  status: "applied" | "not-applicable" | "unavailable";
  projectionIndexPath?: string | undefined;
  sourceUrl?: string | undefined;
  warning?: string | undefined;
};

export type InstallabilityAdapterResult = {
  index: SkillIndex;
  status: InstallabilityAdapterStatus;
};

export type InstallabilityContextFor = (
  skill: IndexedSkill,
  context: InstallabilitySourceContext,
) => InstallabilityCandidateContext | undefined;

export type GaiaInstallabilityAdapterOptions = {
  source: InstallabilitySource;
  contextFor?: InstallabilityContextFor | undefined;
};

/** An explicitly configured local JSON source. It never watches or writes. */
export class FileInstallabilitySource implements InstallabilitySource {
  readonly #path: string;

  constructor(filePath: string) {
    this.#path = filePath;
  }

  async load(): Promise<unknown> {
    const resolvedPath = await assertNoSymlinkComponents(this.#path);
    const handle = await open(resolvedPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile()) {
        throw new Error(`Installability projection is not a regular file: ${this.#path}`);
      }
      return JSON.parse(await handle.readFile("utf8")) as unknown;
    } finally {
      await handle.close();
    }
  }
}

/** An explicitly configured HTTP source. It is never used by default. */
export class HttpInstallabilitySource implements InstallabilitySource {
  readonly #url: string;
  readonly #fetchFn: typeof fetch;
  readonly #timeoutMs: number;
  #lastUrl: string | undefined;

  constructor(options: {
    url: string;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  }) {
    const parsed = new URL(options.url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`Optional installability source must use HTTP(S): ${options.url}`);
    }
    if (parsed.username || parsed.password) {
      throw new Error("Optional installability source must not contain credentials.");
    }
    this.#url = options.url;
    this.#fetchFn = options.fetchFn ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
  }

  get sourceUrl(): string | undefined {
    return this.#lastUrl;
  }

  async load(): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetchFn(this.#url, {
        headers: { accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      throw new Error(
        `Could not fetch optional installability projection ${this.#url}: ${errorMessage(error)}`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `Could not fetch optional installability projection ${this.#url}: HTTP ${response.status}`,
      );
    }
    const finalUrl = response.url;
    if (
      response.redirected ||
      typeof finalUrl !== "string" ||
      finalUrl.length === 0 ||
      !sameHttpUrl(finalUrl, this.#url)
    ) {
      throw new Error(
        `Rejected redirected optional installability projection: requested ${this.#url}, final ${finalUrl || "<missing>"}`,
      );
    }
    this.#lastUrl = finalUrl;
    try {
      return await response.json();
    } catch (error) {
      throw new Error(
        `Optional installability projection ${this.#url} is not valid JSON: ${errorMessage(error)}`,
      );
    }
  }
}

/** A test/embedding source for an already decoded, immutable artifact. */
export class StaticInstallabilitySource implements InstallabilitySource {
  readonly #document: unknown;

  constructor(document: unknown) {
    this.#document = structuredClone(document);
  }

  async load(): Promise<unknown> {
    return structuredClone(this.#document);
  }
}

/**
 * Consume Tree's projection without making a source URL or a branch name into
 * installability evidence. The adapter is opt-in; service code catches source
 * failures and continues with explicit unknown assessments.
 */
export class GaiaInstallabilityAdapter {
  readonly #source: InstallabilitySource;
  readonly #contextFor: InstallabilityContextFor;

  constructor(options: GaiaInstallabilityAdapterOptions) {
    this.#source = options.source;
    this.#contextFor = options.contextFor ?? defaultContextFor;
  }

  async apply(
    index: SkillIndex,
    context: InstallabilitySourceContext,
  ): Promise<InstallabilityAdapterResult> {
    if (context.sourceKind !== "tree") {
      return {
        index: withUnknownInstallability(
          index,
          null,
          context.sourceKind === "fleet" ? "fleet-source" : "invalid-context",
        ),
        status: { status: "not-applicable" },
      };
    }

    const projection = parseInstallabilityProjection(await this.#source.load());
    const assessments = new Map<string, InstallabilityAssessment>();
    for (const skill of index.docs) {
      const candidate = this.#contextFor(skill, context);
      assessments.set(
        skill.id,
        assessInstallability(projection, skill.id, candidate, context.sourceKind),
      );
    }
    return {
      index: withInstallability(index, assessments),
      status: {
        status: "applied",
        projectionIndexPath: projection.indexPath,
        ...(this.#source.sourceUrl ? { sourceUrl: this.#source.sourceUrl } : {}),
      },
    };
  }
}

/** Parse and validate the published `gaia.installability/v1` shape offline. */
export function parseInstallabilityProjection(value: unknown): InstallabilityProjection {
  const document = record(value, "Installability projection");
  exactKeys(document, PROJECTION_KEYS, "Installability projection");
  if (document.schema !== INSTALLABILITY_PROJECTION_SCHEMA) {
    throw new Error(
      `Installability projection advertises unsupported schema ${String(document.schema)}.`,
    );
  }
  stringValue(document.indexPath, "Installability projection.indexPath");

  if (!Array.isArray(document.observations)) {
    throw new Error("Installability projection.observations must be an array.");
  }
  const observations: InstallabilityObservationRef[] = document.observations.map(
    (value, position) => {
      const ref = record(value, `Installability observation reference ${position}`);
      exactKeys(ref, OBSERVATION_REF_KEYS, `Installability observation reference ${position}`);
      shaValue(ref.digest, `Installability observation reference ${position}.digest`);
      timestampValue(ref.checkedAt, `Installability observation reference ${position}.checkedAt`);
      stringValue(ref.runId, `Installability observation reference ${position}.runId`);
      return {
        digest: ref.digest as string,
        checkedAt: ref.checkedAt as string,
        runId: ref.runId as string,
      };
    },
  );
  const observationKeys = observations.map((observation) =>
    `${observation.digest}\u0000${observation.checkedAt}\u0000${observation.runId}`,
  );
  if (new Set(observationKeys).size !== observationKeys.length) {
    throw new Error("Installability projection.observations must be unique.");
  }

  const skills = record(document.skills, "Installability projection.skills");
  const parsedSkills: Record<string, InstallabilityProjectionSkill> = {};
  for (const [id, value] of Object.entries(skills)) {
    if (!/^\S+\/\S+$/u.test(id)) {
      throw new Error(`Installability projection has invalid skill id ${id}.`);
    }
    const skill = record(value, `Installability projection skill ${id}`);
    exactKeys(skill, SKILL_KEYS, `Installability projection skill ${id}`);
    assertInstallabilityProjectionSkill(skill, `Installability projection skill ${id}`);
    // The upstream validator permits only the exact route object and digest/
    // timestamp forms; repeat those checks here so malformed JSON cannot turn
    // into a permissive lookup through an `any` cast.
    validateProjectionSkillFields(skill, id);
    parsedSkills[id] = skill as unknown as InstallabilityProjectionSkill;
  }

  return {
    schema: INSTALLABILITY_PROJECTION_SCHEMA,
    indexPath: document.indexPath as string,
    observations,
    skills: parsedSkills,
  };
}

export function sourceRouteFromUrl(url: string): InstallabilitySourceRoute | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.hostname.toLocaleLowerCase("en-US") !== "github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0] as string;
  const repo = (parts[1] as string).replace(/\.git$/u, "");
  if (parts.length === 2) {
    return {
      url,
      owner,
      repo,
      ref: null,
      subpath: "",
      entrypoint: "",
      installSubpath: "",
    };
  }
  if (parts[2] !== "blob" && parts[2] !== "tree") return null;
  if (parts.length < 4) return null;
  const ref = parts[3] as string;
  const entrypoint = parts.slice(4).join("/");
  const slash = entrypoint.lastIndexOf("/");
  const subpath =
    parts[2] === "blob" && entrypoint.endsWith(".md")
      ? slash === -1
        ? ""
        : entrypoint.slice(0, slash)
      : entrypoint;
  return {
    url,
    owner,
    repo,
    ref,
    subpath,
    entrypoint,
    installSubpath: subpath,
  };
}

function defaultContextFor(
  skill: IndexedSkill,
  _context: InstallabilitySourceContext,
): InstallabilityCandidateContext {
  return {
    id: skill.id,
    sourceRoute:
      typeof skill.links.github === "string"
        ? sourceRouteFromUrl(skill.links.github)
        : null,
  };
}

function validateProjectionSkillFields(
  skill: Record<string, unknown>,
  id: string,
): void {
  for (const key of ["currentSourceRoute", "observedSourceRoute"]) {
    validateRoute(skill[key], `Installability projection skill ${id}.${key}`);
  }
  for (const key of [
    "observationDigest",
    "currentSkillContentSha256",
    "observedSkillContentSha256",
    "deliveredContentSha256",
  ]) {
    optionalSha(skill[key], `Installability projection skill ${id}.${key}`);
  }
  optionalRevision(skill.resolvedRevision, `Installability projection skill ${id}.resolvedRevision`);
  optionalTimestamp(skill.observedAt, `Installability projection skill ${id}.observedAt`);
  const state = skill.state as InstallabilityProjectionSkill["state"];
  const reason = skill.reason as InstallabilityProjectionSkill["reason"];
  if (state === "materializable" && reason !== "gaia-materialized") {
    throw new Error(`Installability projection skill ${id} has a contradictory positive result.`);
  }
  if (
    state === "not-materializable" &&
    reason !== "no-source" &&
    reason !== "intrinsic-content-failure"
  ) {
    throw new Error(`Installability projection skill ${id} has an unscoped negative result.`);
  }
  if (reason === "no-source" && skill.currentSourceRoute !== null) {
    throw new Error(`Installability projection skill ${id} marks a sourced skill as no-source.`);
  }
}

function validateRoute(value: unknown, label: string): void {
  if (value === null) return;
  const route = record(value, label);
  exactKeys(route, ROUTE_KEYS, label);
  for (const key of ["url", "owner", "repo"]) {
    stringValue(route[key], `${label}.${key}`);
  }
  for (const key of ["subpath", "entrypoint", "installSubpath"]) {
    if (typeof route[key] !== "string") {
      throw new Error(`${label}.${key} must be a string.`);
    }
  }
  if (route.ref !== null && typeof route.ref !== "string") {
    throw new Error(`${label}.ref must be a string or null.`);
  }
  const parsed = sourceRouteFromUrl(route.url as string);
  if (parsed === null) throw new Error(`${label}.url is not a supported GitHub route.`);
  for (const key of ["url", "owner", "repo", "ref", "subpath", "entrypoint"] as const) {
    if (route[key] !== parsed[key]) {
      throw new Error(`${label}.${key} does not match its URL.`);
    }
  }
  for (const key of ["subpath", "entrypoint", "installSubpath"] as const) {
    const value = route[key] as string;
    if (value.startsWith("/") || value.split("/").includes("..")) {
      throw new Error(`${label}.${key} contains path traversal.`);
    }
  }
}

function optionalSha(value: unknown, label: string): void {
  if (value !== null &&
      (typeof value !== "string" || !/^[0-9a-f]{64}$/iu.test(value))) {
    throw new Error(`${label} must be a sha256 string or null.`);
  }
}

function shaValue(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/iu.test(value)) {
    throw new Error(`${label} must be a sha256 string.`);
  }
}

function optionalRevision(value: unknown, label: string): void {
  if (value !== null &&
      (typeof value !== "string" || !/^[0-9a-f]{40}$/iu.test(value))) {
    throw new Error(`${label} must be a revision string or null.`);
  }
}

function optionalTimestamp(value: unknown, label: string): void {
  if (value !== null &&
      (typeof value !== "string" || !Number.isFinite(Date.parse(value)))) {
    throw new Error(`${label} must be an ISO timestamp or null.`);
  }
}

function timestampValue(value: unknown, label: string): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}

function stringValue(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new Error(`${label} has unsupported field ${key}.`);
  }
  for (const key of expected) {
    if (!(key in value)) throw new Error(`${label} is missing ${key}.`);
  }
}

async function assertNoSymlinkComponents(filePath: string): Promise<string> {
  const lexical = path.resolve(filePath);
  const parsed = path.parse(lexical);
  let cursor = parsed.root;
  const parts = lexical.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (const part of parts) {
    cursor = path.join(cursor, part);
    let info;
    try {
      info = await lstat(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (info.isSymbolicLink()) {
      const resolved = await realpath(cursor).catch(() => "");
      // macOS exposes the system temp roots through /private aliases. These
      // are benign platform aliases, not user-controlled traversal.
      const benignAlias =
        (cursor === "/tmp" && resolved === "/private/tmp") ||
        (cursor === "/var" && resolved === "/private/var");
      if (!benignAlias) {
        throw new Error(`Installability projection path traverses a symlink: ${cursor}`);
      }
    }
  }
  return realpath(lexical);
}

function sameHttpUrl(left: string, right: string): boolean {
  try {
    return new URL(left).toString() === new URL(right).toString();
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
