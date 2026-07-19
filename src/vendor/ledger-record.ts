// VENDORED from gaia-research scripts/hell-heaven-bench/ledger.ts: the
// hh-ledger/v1 record type + validator, so the launcher can shape and sanity-
// check records offline. The HARD gate remains upstream: every emitted record
// must pass `npx tsx scripts/hell-heaven-bench/ledger.ts validate` in
// gaia-research before it is appended to the ledger of record.

export const LEDGER_SCHEMA = "hh-ledger/v1" as const;

export const ARMS = ["placebo", "heaven", "hell", "ultra"] as const;
export type Arm = (typeof ARMS)[number];

export interface SkillRef {
  id: string;
  contentSha256: string; // sha256 of the exact SKILL.md text that was loaded
}

export interface TokenDoses {
  system: number | null; // null = unmeasured (M2a unratified — stays null here)
  skillStanding: number | null;
  skillInvocation: number | null;
  perTurn: number | null;
}

export interface ObjectiveEndpoint {
  kind: string;
  pass: boolean | null;
  detail?: string;
}

export interface LedgerRecord {
  schema: typeof LEDGER_SCHEMA;
  recordedAt: string;
  benchmarkId: string;
  task: string;
  arm: Arm;
  skillsLoaded: SkillRef[];
  model: string;
  harness: { name: string; version: string };
  repeatIndex: number;
  tokens: TokenDoses;
  wallClockMs: number;
  objectiveEndpoint: ObjectiveEndpoint;
  judgeVerdict: string | null;
  notes?: string;
}

export function validateRecord(raw: unknown): asserts raw is LedgerRecord {
  const fail = (msg: string): never => {
    throw new Error(`invalid ledger record: ${msg}`);
  };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail("not an object");
  const r = raw as Record<string, unknown>;

  if ("seed" in r) {
    fail(
      "carries a `seed` field. No target harness offers seed control — determinism does " +
        "not exist; use repeatIndex (N repeats + CIs) instead. (Binding: RFC §7.3.)",
    );
  }
  if (r.schema !== LEDGER_SCHEMA) fail(`schema must be "${LEDGER_SCHEMA}"`);
  for (const k of ["recordedAt", "benchmarkId", "task", "model"] as const) {
    if (typeof r[k] !== "string" || !r[k]) fail(`${k} must be a non-empty string`);
  }
  if (Number.isNaN(Date.parse(r.recordedAt as string))) fail("recordedAt must be an ISO timestamp");
  if (!ARMS.includes(r.arm as Arm)) fail(`arm must be one of ${ARMS.join("/")}`);
  if (!Array.isArray(r.skillsLoaded)) fail("skillsLoaded must be an array");
  for (const s of r.skillsLoaded as unknown[]) {
    const sr = s as Record<string, unknown>;
    if (typeof sr?.id !== "string" || !sr.id) fail("skillsLoaded[].id must be a non-empty string");
    if (typeof sr?.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(sr.contentSha256)) {
      fail("skillsLoaded[].contentSha256 must be a 64-hex sha256 of the loaded SKILL.md");
    }
  }
  if (r.arm === "placebo" && (r.skillsLoaded as unknown[]).length > 0) {
    fail("placebo arm must have skillsLoaded: [] (it is our own same-harness no-skill run)");
  }
  const h = r.harness as Record<string, unknown> | undefined;
  if (typeof h?.name !== "string" || typeof h?.version !== "string" || !h.name || !h.version) {
    fail("harness must be { name, version } (non-empty strings)");
  }
  if (!Number.isInteger(r.repeatIndex) || (r.repeatIndex as number) < 0) {
    fail("repeatIndex must be a non-negative integer");
  }
  const t = r.tokens as Record<string, unknown> | undefined;
  for (const k of ["system", "skillStanding", "skillInvocation", "perTurn"] as const) {
    const v = t?.[k];
    if (v === undefined) fail(`tokens.${k} missing — use null for unmeasured, never omit or write 0`);
    if (v !== null && (typeof v !== "number" || v < 0 || !Number.isFinite(v))) {
      fail(`tokens.${k} must be a non-negative number or null (null = unmeasured)`);
    }
  }
  if (typeof r.wallClockMs !== "number" || r.wallClockMs < 0) {
    fail("wallClockMs must be a non-negative number");
  }
  const o = r.objectiveEndpoint as Record<string, unknown> | undefined;
  if (typeof o?.kind !== "string" || !o.kind) fail("objectiveEndpoint.kind must be a non-empty string");
  if (o?.pass !== null && typeof o?.pass !== "boolean") {
    fail("objectiveEndpoint.pass must be boolean or null (null = Tier-3-only run)");
  }
  if (r.judgeVerdict !== null && typeof r.judgeVerdict !== "string") {
    fail("judgeVerdict must be a string (Tier 3) or null");
  }
}
