// What a host can paint and observe — the data half of the portable console
// contract (#191 / #192). Pure types: the per-harness values live in
// compat.ts (`HarnessPath.console`), beside the install profiles, so the
// installers, /start, the console's Trust section and the site's /console
// showcase read one table.
//
// The contract is the SAME six surfaces on every host. A host differs only in
// how each surface is carried (`SurfaceSupport`) and in which facts the
// adapter can OBSERVE (`ObservationMap`). Nothing here lets a host redefine
// what a surface means, and nothing here is an authority channel.

/** The six surfaces every Full console projects (#191). */
export const CONSOLE_SURFACES = ["status", "lens", "session", "scope", "flow", "trust"] as const;
export type ConsoleSurface = (typeof CONSOLE_SURFACES)[number];

export const SURFACE_LABEL: Readonly<Record<ConsoleSurface, string>> = Object.freeze({
  status: "Status",
  lens: "Lens",
  session: "Session",
  scope: "Scope",
  flow: "Flow",
  trust: "Trust",
});

/** One line per surface: what it answers, host-independent. */
export const SURFACE_QUESTION: Readonly<Record<ConsoleSurface, string>> = Object.freeze({
  status: "Where am I on the line, and how many skills entered this session?",
  lens: "What would a summon return — and hand it to me to submit.",
  session: "What happened, and what is the evidence for each step?",
  scope: "What can Skill Heaven see, what is active, which rung did I pick?",
  flow: "Which agents ran, and which skills did each summon?",
  trust: "What is installed, what can it read and write, what is degraded here?",
});

/**
 * How a host carries one surface.
 *
 * - `native`      the host has a native mechanism for exactly this surface
 *                 (a status slot for Status, a pane for Session…) and the
 *                 adapter uses it.
 * - `degraded`    the surface is delivered through a weaker native mechanism
 *                 (a command-backed report instead of a pane, a transcript
 *                 line instead of a persistent status). It is intentional,
 *                 not a failure — `note` says what differs.
 * - `unsupported` the host exposes nothing that can carry it. The console
 *                 says so; it never fakes the surface.
 */
export type SupportLevel = "native" | "degraded" | "unsupported";

export interface SurfaceSupport {
  level: SupportLevel;
  /** The host mechanism that carries (or would carry) it: an API, a command, a file. */
  via: string;
  /** What differs from the full contract (degraded) or why nothing can carry it (unsupported). */
  note: string;
}

/**
 * How the adapter comes to know a fact (CONTROL-PLANE §2.5):
 * `observed` — a host hook/event showed it happen;
 * `reported` — the summon engine's own ledger said so;
 * `unavailable` — this host gives the adapter no source, so the console says unknown.
 */
export type ObservationClass = "observed" | "reported" | "unavailable";

export interface ObservationMap {
  /** The summon tool's result. */
  summon: ObservationClass;
  /** A read of a materialized SKILL.md (card → in context). */
  read: ObservationClass;
  /** Agent / subagent ids on tool calls. */
  agents: ObservationClass;
  /** The rung command a person typed. */
  rung: ObservationClass;
}

/** One installed piece, as the Trust surface states it. */
export interface TrustComponent {
  /** Package / plugin / extension id. */
  id: string;
  /** Which profile installs it. */
  profile: "core" | "full";
  /** What it is in this host's own terms ("Claude Code plugin", "Pi package"…). */
  kind: string;
  /** The version the repository ships; a test holds it equal to the package manifest. */
  version: string;
  /** Human sentence. */
  summary: string;
  reads: readonly string[];
  writes: readonly string[];
  network: string;
  /** The command that disables or removes ONLY this piece. */
  disable: string;
  /** Extra plain sentences the Trust surface states about this piece. */
  notes?: readonly string[];
}

export type ConsoleKind = "pane" | "extension-ui" | "command-backed";

/** The host's whole console projection. */
export interface ConsoleProjection {
  kind: ConsoleKind;
  /** One sentence: the strongest truthful native mechanism, in the host's terms. */
  mechanism: string;
  /** The typed entry point that opens the console report, or null when the host paints it unprompted. */
  command: string | null;
  /** How a pre-fill or printed command spells a Skill Heaven surface on this host. */
  commandPrefix: "" | "skill-heaven:";
  surfaces: Record<ConsoleSurface, SurfaceSupport>;
  observes: ObservationMap;
  /** Exact tool names of the summon tool as this host spells them. Matched whole, never by suffix. */
  summonTools: readonly string[];
  /** Everything Core and Full install, for Trust. */
  trust: readonly TrustComponent[];
  /** What a probe of THIS console established, and on which version. Absent claims stay absent. */
  probe: { version: string | null; summary: string; href: string | null };
}
