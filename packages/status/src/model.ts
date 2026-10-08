// The one Skill Heaven status model (docs/CONTROL-PLANE.md §2).
//
// STATE is what is (the entropy reading, skills in session, the controller).
// EVENT is what happened (a summon, a no-match, an unavailable source).
// EVIDENCE is the full receipt behind an event. Projections may drop fields to
// fit; they may never promote an event into state or a retrieval number into
// behaviour (#137 K6).
//
// This module is pure and Node-free: the Claude Code console mod runs it in an
// environment with no Node, and the site bundles it for the browser. Readers
// that touch files live in door adapters, never here.

/** The one line (N13). */
export const RUNGS = ["zero", "low", "med", "high", "xhigh", "max", "ultra"] as const;
export type Rung = (typeof RUNGS)[number];

export type Band = "zero" | "heaven" | "hell" | "ultra";

export const RUNG_BAND: Readonly<Record<Rung, Band>> = Object.freeze({
  zero: "zero",
  low: "heaven",
  med: "heaven",
  high: "hell",
  xhigh: "hell",
  max: "hell",
  ultra: "ultra",
});

/** How a statement in the model is known (CONTROL-PLANE §2.5). */
export type EvidenceClass = "observed" | "reported" | "inferred" | "unknown" | "fixture";

/**
 * The entropy reading — what `‹‹ [TOKEN] ››` shows. Every reading names its
 * source. A selected rung is a preference the user expressed and a projection
 * observed; it is never enforced state (the rung commands are stateless
 * reference renderers, #85/#91).
 */
export type EntropyReading =
  | { kind: "boot"; posture: "product-floor" | "curated" | "native"; source: "launcher-manifest" }
  | { kind: "selected"; rung: Rung; source: "observed-command" }
  | { kind: "native"; source: "no-launcher" }
  | { kind: "unknown" };

/** How far a summoned skill is known to have travelled (§2.3). */
export type ContextStage = "previewed" | "materialized" | "in-context" | "read-unobserved";

export type Direction = "manual" | "converge" | "explore" | "unspecified";

export type Lane = "human-led" | "model-led" | "unspecified" | "unknown";

/** One skill as a receipt knows it. Every string here is untrusted display
 * text from the network and is sanitized at render time. */
export interface SkillReceipt {
  id: string;
  name: string;
  stage: ContextStage;
  matchKind: "exact" | "ranked" | "unknown";
  /** Retrieval score — a diagnostic, never behaviour. */
  score: number | null;
  /** `(top − next) / top` — a diagnostic, never behaviour. */
  margin: number | null;
  cache: "cold" | "warm" | "unknown";
  ms: number | null;
  lane: Lane;
  source: string | null;
  repoUrl: string | null;
  /** Branch or ref the source named, when any. */
  ref: string | null;
  /** The exact URL the payload was fetched from (commit-addressed when the source pins one). */
  sourceUrl: string | null;
  subpath: string | null;
  sha256: string | null;
  path: string | null;
  /** Tree installability determination as the engine reported it, or "unknown". */
  installability: string;
  /** Who summoned it, when the host reported it. */
  agent: string | null;
}

export type SummonEvent =
  | {
      kind: "summoned";
      direction: Direction;
      query: string;
      skills: SkillReceipt[];
      /** Materialized skills added to the session by this call. */
      delta: number;
      preview: false;
      at: string | null;
      evidence: EvidenceClass;
      composition: "relevance-only" | "unknown";
      arbor: "governed-record" | "no-record" | "unavailable" | "unknown";
      sourceHealth: SourceHealth;
    }
  | {
      kind: "previewed";
      direction: Direction;
      query: string;
      skills: SkillReceipt[];
      delta: 0;
      preview: true;
      at: string | null;
      evidence: EvidenceClass;
      sourceHealth: SourceHealth;
    }
  | {
      kind: "no-match";
      direction: Direction;
      query: string;
      /** True for a `/lens` preview: nothing was going to materialize anyway. */
      preview: boolean;
      considered: number | null;
      reason: string | null;
      at: string | null;
      evidence: EvidenceClass;
      sourceHealth: SourceHealth;
    }
  | {
      kind: "unavailable" | "error";
      direction: Direction;
      query: string;
      /** True when the failed call was a `/lens` preview. */
      preview: boolean;
      reason: string;
      at: string | null;
      evidence: EvidenceClass;
    };

export type SourceHealth =
  | { kind: "fresh"; indexAgeDays: number | null }
  | { kind: "stale"; indexAgeDays: number | null }
  | { kind: "unknown" };

/** Ultra controller vocabulary. The steering decision set today; #126 may add
 * members. Unknown members render verbatim (sanitized). */
export type ControllerState =
  | "HOLD"
  | "EXPLORE"
  | "RECOVER"
  | "REOPEN"
  | "CHECKPOINT"
  | "CLOSE"
  | "STOP"
  | (string & { readonly __controllerExtension?: never });

declare const fixtureBrand: unique symbol;
/** Only `fixtures.ts` can mint this. A runtime adapter cannot construct a
 * fixture controller, and every projection labels it FIXTURE. */
export type FixtureMark = { readonly [fixtureBrand]: true };

export type Controller =
  | { kind: "not-selected" }
  /** Ultra is the selected rung; no controller reports state. TODAY. */
  | { kind: "unavailable" }
  | {
      kind: "reported";
      source: "steering-trace" | "campaign";
      state: ControllerState;
      /** A working rung chosen under Ultra. Never replaces `[ULTRA]` (K9). */
      effective?: Exclude<Rung, "zero" | "ultra">;
      progress?: { completed: number; total: number };
      transition?: { from: ControllerState; to: ControllerState; reason: string };
    }
  | {
      kind: "fixture";
      mark: FixtureMark;
      state: ControllerState;
      effective?: Exclude<Rung, "zero" | "ultra">;
      progress?: { completed: number; total: number };
      transition?: { from: ControllerState; to: ControllerState; reason: string };
    };

export type VerificationChip = "verified" | "compatible" | "partial" | "unverified" | "needs-local-probe";

export type HostIntegration = "APPEND" | "STACK" | "NATIVE SLOT" | "REPLACE-ONLY" | "UNSUPPORTED";

export interface SkillHeavenStatus {
  reading: EntropyReading;
  /** The reading the session started with (launcher posture or native).
   * Kept when a rung is later selected, so Scope can say what was inherited
   * and what was chosen. Absent = not known. */
  boot?: EntropyReading;
  /** Materialized skills in this session; `null` = unknown (never shown as 0). */
  skills: number | null;
  /** Summon calls recorded this session; `null` = unknown. */
  summons: number | null;
  /** Transient convenience for full mode: the last arrival's name. */
  lastArrival: string | null;
  controller: Controller;
  /** Whether the summon tool is reachable from this session. */
  summonTool: "connected" | "not-connected" | "unknown";
  /** Present only on fixture-built statuses. */
  fixture?: FixtureMark;
}

export type StatusMode = "off" | "compact" | "full";

export function bandOf(rung: Rung): Band {
  return RUNG_BAND[rung];
}

/** The rung a reading puts the session on, when it names one. */
export function readingRung(reading: EntropyReading): Rung | null {
  if (reading.kind === "selected") return reading.rung;
  if (reading.kind === "boot" && reading.posture === "product-floor") return "zero";
  return null;
}

export function isRung(value: unknown): value is Rung {
  return typeof value === "string" && (RUNGS as readonly string[]).includes(value);
}

export function emptyStatus(): SkillHeavenStatus {
  return {
    reading: { kind: "unknown" },
    skills: null,
    summons: null,
    lastArrival: null,
    controller: { kind: "not-selected" },
    summonTool: "unknown",
  };
}
