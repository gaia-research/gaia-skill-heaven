// One renderer, many paints (#137 "One renderer, many door adapters").
//
// The renderer turns the model into SEGMENTS — `{ text, role }` runs. A
// projection paints segments in its own medium: ANSI for a terminal, `<Text>`
// for the Claude Code console, `<span>` for the site. No projection decides
// what a field means; they only decide how a role looks.

import type {
  Controller,
  EntropyReading,
  SkillHeavenStatus,
  SkillReceipt,
  StatusMode,
  SummonEvent,
} from "./model.js";
import { RUNG_BAND, readingRung } from "./model.js";
import { cellWidth, sanitizeDisplay } from "./sanitize.js";
import { ROLE_COLORS, type Role } from "./tokens.js";

export interface Segment {
  text: string;
  role: Role;
}

const SEP: Segment = { text: " · ", role: "dim" };
const seg = (text: string, role: Role): Segment => ({ text, role });

/* ------------------------------------------------------------------------- *
 * The reading
 * ------------------------------------------------------------------------- */

/** The word inside `[ ]`. Never a number, never a percentage (K5). */
export function readingToken(reading: EntropyReading): string {
  switch (reading.kind) {
    case "selected":
      return reading.rung.toUpperCase();
    case "boot":
      return reading.posture === "product-floor" ? "ZERO" : reading.posture === "curated" ? "CURATED" : "NATIVE";
    case "native":
      return "NATIVE";
    case "unknown":
      return "?";
  }
}

function readingRole(reading: EntropyReading): Role {
  const rung = readingRung(reading);
  if (!rung) return "ink";
  const band = RUNG_BAND[rung];
  return band === "zero" ? "zero" : band === "heaven" ? "heaven" : band === "hell" ? "hell" : "ultra";
}

function isUltra(status: SkillHeavenStatus): boolean {
  return readingRung(status.reading) === "ultra";
}

function skillsText(n: number | null, short: boolean): string {
  if (n === null) return short ? "?" : "? skills";
  if (short) return String(n);
  return `${n} ${n === 1 ? "skill" : "skills"}`;
}

/** `‹‹ [HIGH] ››` — the chevrons stay visible as orientation even when
 * neither direction is active (#137). */
function readingSegments(status: SkillHeavenStatus): Segment[] {
  return [
    seg("‹‹", "heaven"),
    seg(" ", "dim"),
    seg(`[${readingToken(status.reading)}]`, readingRole(status.reading)),
    seg(" ", "dim"),
    seg("››", "hell"),
  ];
}

function headSegments(status: SkillHeavenStatus, withWord: boolean): Segment[] {
  const ultra = isUltra(status);
  const out: Segment[] = [];
  if (status.fixture || status.controller.kind === "fixture") out.push(seg("FIXTURE", "amber"), seg(" ", "dim"));
  out.push(seg(ultra ? "◆" : "◇", ultra ? "ultra" : "umbrella"));
  if (withWord) out.push(seg(" entropy", "umbrella"));
  out.push(seg(" ", "dim"), ...readingSegments(status));
  return out;
}

/** Controller fields under Ultra. `[ULTRA]` itself is never replaced (K9). */
export function controllerSegments(controller: Controller, opts: { progress: boolean } = { progress: true }): Segment[] {
  switch (controller.kind) {
    case "not-selected":
      return [];
    case "unavailable":
      return [SEP, seg("controller unavailable", "dim")];
    case "reported":
    case "fixture": {
      const out: Segment[] = [SEP, seg(sanitizeDisplay(controller.state, 24).toUpperCase(), "ultra")];
      if (controller.effective) {
        const band = RUNG_BAND[controller.effective];
        const role: Role = band === "heaven" ? "heaven" : "hell";
        out.push(SEP, seg("now ", "dim"), seg(controller.effective.toUpperCase(), role), seg(band === "heaven" ? " ‹" : " ›", role));
      }
      if (opts.progress && controller.progress) {
        out.push(SEP, seg(`${controller.progress.completed}/${controller.progress.total}`, "ink"));
      }
      return out;
    }
  }
}

/* ------------------------------------------------------------------------- *
 * Status line levels — richest first; the reading is removed last.
 * ------------------------------------------------------------------------- */

export function statusLevels(status: SkillHeavenStatus, mode: StatusMode): Segment[][] {
  if (mode === "off") return [];
  const ultra = isUltra(status);
  const controller = ultra ? status.controller : ({ kind: "not-selected" } as Controller);
  const skills = [SEP, seg(skillsText(status.skills, false), "ink")];
  const summons =
    status.summons === null ? [] : [seg(" / ", "dim"), seg(`${status.summons} ${status.summons === 1 ? "summon" : "summons"}`, "dim")];
  const arrival = status.lastArrival
    ? [SEP, seg(`+${sanitizeDisplay(status.lastArrival, 32)}`, "ink")]
    : [];

  const full: Segment[][] = [
    [...headSegments(status, true), ...skills, ...summons, ...controllerSegments(controller), ...arrival],
    [...headSegments(status, true), ...skills, ...summons, ...controllerSegments(controller)],
    [...headSegments(status, true), ...skills, ...controllerSegments(controller)],
    [...headSegments(status, true), ...skills, ...controllerSegments(controller, { progress: false })],
  ];
  const compact: Segment[][] = [
    [...headSegments(status, true), ...skills],
    [...headSegments(status, false), SEP, seg(skillsText(status.skills, true), "ink")],
    [...headSegments(status, false)],
  ];
  const bare: Segment[] = [];
  if (status.fixture || status.controller.kind === "fixture") bare.push(seg("FIXTURE", "amber"), seg(" ", "dim"));
  bare.push(seg(`[${readingToken(status.reading)}]`, readingRole(status.reading)));
  return mode === "full" ? [...full, ...compact, bare] : [...compact, bare];
}

export function segmentsWidth(segments: readonly Segment[]): number {
  return segments.reduce((sum, s) => sum + cellWidth(s.text), 0);
}

/** The richest level that fits `width` cells. With no width, the richest. */
export function renderStatusSegments(status: SkillHeavenStatus, mode: StatusMode, width?: number): Segment[] {
  const levels = statusLevels(status, mode);
  if (levels.length === 0) return [];
  if (width === undefined || !Number.isFinite(width)) return levels[0]!;
  return levels.find((level) => segmentsWidth(level) <= width) ?? levels[levels.length - 1]!;
}

/* ------------------------------------------------------------------------- *
 * Events — two lines: what happened, then the dim detail (#137 "pulse").
 * ------------------------------------------------------------------------- */

function directionGlyph(direction: SummonEvent["direction"]): Segment {
  if (direction === "converge") return seg("‹", "heaven");
  if (direction === "explore") return seg("›", "hell");
  return seg("◇", "umbrella");
}

export function formatScore(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const clamped = Math.max(0, Math.min(1, value));
  return clamped >= 1 ? "1.00" : clamped.toFixed(2).replace(/^0/, "");
}

export function formatMs(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/** Margin below this is shown as a "close call" — a retrieval fact only. */
export const CLOSE_CALL_MARGIN = 0.1;

function receiptDetail(skill: SkillReceipt, delta: number | null): Segment[] {
  const parts: string[] = [];
  if (skill.matchKind !== "unknown") parts.push(skill.matchKind);
  const score = formatScore(skill.score);
  if (score) parts.push(score);
  const margin = formatScore(skill.margin);
  if (margin) parts.push(`Δ ${margin}`);
  if (skill.cache !== "unknown") parts.push(skill.cache);
  const ms = formatMs(skill.ms);
  if (ms) parts.push(ms);
  if (delta !== null) parts.push(`+${delta}`);
  return [seg("  ", "dim"), seg(parts.join(" · ") || "no ranking disclosure", "dim")];
}

export function eventLines(event: SummonEvent): Segment[][] {
  const lines = eventLinesInner(event);
  if (event.evidence === "fixture" && lines[0]) lines[0] = [seg("FIXTURE", "amber"), seg(" ", "dim"), ...lines[0]];
  return lines;
}

function eventLinesInner(event: SummonEvent): Segment[][] {
  switch (event.kind) {
    case "summoned": {
      const [first, ...rest] = event.skills;
      const line1: Segment[] = [directionGlyph(event.direction), seg(" summoned  ", "dim")];
      line1.push(seg(first ? sanitizeDisplay(first.name, 40) : "nothing", "ink"));
      if (rest.length > 0) line1.push(seg(` +${rest.length} more`, "dim"));
      const line2 = first ? receiptDetail(first, event.delta) : [seg("  ", "dim"), seg("no skill in result", "dim")];
      if (event.sourceHealth.kind === "stale") line2.push(SEP, seg("? index stale", "amber"));
      return [line1, line2];
    }
    case "previewed": {
      const [first] = event.skills;
      const line1: Segment[] = [seg("◇", "umbrella"), seg(" lens  ", "dim")];
      if (event.skills.length === 1 && first) line1.push(seg(sanitizeDisplay(first.name, 40), "ink"));
      else line1.push(seg(`${event.skills.length} candidates`, "ink"));
      const parts: Segment[] = [seg("  ", "dim"), seg("nothing materialized", "dim")];
      if (first && event.skills.length > 1) parts.push(SEP, seg(`top ${sanitizeDisplay(first.name, 32)}`, "dim"));
      if (first?.margin !== null && first?.margin !== undefined && first.margin < CLOSE_CALL_MARGIN && event.skills.length > 1) {
        parts.push(SEP, seg(`Δ ${formatScore(first.margin)} close call (retrieval)`, "dim"));
      }
      return [line1, parts];
    }
    case "no-match": {
      const detail = event.considered === null ? "0 admitted" : `${event.considered} considered · 0 admitted`;
      const reason = event.reason ? ` · ${sanitizeDisplay(event.reason, 60)}` : "";
      return [
        [seg("◇", "umbrella"), seg(" summon  ", "dim"), seg("×", "ink"), seg(" no match", "ink")],
        [seg("  ", "dim"), seg(detail + reason, "dim")],
      ];
    }
    case "unavailable":
      return [
        [seg("◇", "umbrella"), seg(" summon  ", "dim"), seg("?", "amber"), seg(" unavailable", "ink")],
        [seg("  ", "dim"), seg(sanitizeDisplay(event.reason, 72), "dim")],
      ];
    case "error":
      return [
        [seg("◇", "umbrella"), seg(" summon  ", "dim"), seg("!", "stop"), seg(" failed", "ink")],
        [seg("  ", "dim"), seg(sanitizeDisplay(event.reason, 72), "dim")],
      ];
  }
}

/* ------------------------------------------------------------------------- *
 * Screen-reader meaning — one sentence, no glyphs.
 * ------------------------------------------------------------------------- */

export function describeReading(reading: EntropyReading): string {
  switch (reading.kind) {
    case "selected":
      return `${reading.rung}, the rung you selected (not enforced)`;
    case "boot":
      return reading.posture === "product-floor"
        ? "zero, the Skill Zero floor set at launch"
        : reading.posture === "curated"
          ? "curated, set at launch"
          : "native, your harness's own skills";
    case "native":
      return "native, your harness's own skills";
    case "unknown":
      return "unknown";
  }
}

export function describeStatus(status: SkillHeavenStatus): string {
  const parts = [`Skill entropy reading: ${describeReading(status.reading)}.`];
  parts.push(
    status.skills === null
      ? "Skills in this session: unknown."
      : `${status.skills} ${status.skills === 1 ? "skill" : "skills"} materialized in this session.`,
  );
  if (isUltra(status)) {
    const c = status.controller;
    if (c.kind === "unavailable") parts.push("Ultra controller: unavailable; nothing is choosing for you yet.");
    else if (c.kind === "reported" || c.kind === "fixture") {
      parts.push(`Ultra controller: ${sanitizeDisplay(c.state, 24).toLowerCase()}${c.effective ? `, working at ${c.effective}` : ""}.`);
    }
  }
  if (status.fixture || status.controller.kind === "fixture") parts.unshift("Fixture, design state only.");
  return parts.join(" ");
}

export function describeEvent(event: SummonEvent): string {
  const text = describeEventInner(event);
  return event.evidence === "fixture" ? `Fixture, design state only. ${text}` : text;
}

function describeEventInner(event: SummonEvent): string {
  const how =
    event.direction === "converge" ? "converging" : event.direction === "explore" ? "exploring" : event.direction === "manual" ? "by hand" : "";
  switch (event.kind) {
    case "summoned": {
      const names = event.skills.map((s) => sanitizeDisplay(s.name, 40)).join(", ") || "nothing";
      return `Summoned ${names}${how ? `, ${how}` : ""}. A card was returned; ${event.delta} added to the session.`;
    }
    case "previewed":
      return `Lens preview: ${event.skills.length} candidate${event.skills.length === 1 ? "" : "s"}; nothing materialized.`;
    case "no-match":
      return "Summon found no match. Nothing was added to the session.";
    case "unavailable":
      return `Summon unavailable: ${sanitizeDisplay(event.reason, 72)}.`;
    case "error":
      return `Summon failed: ${sanitizeDisplay(event.reason, 72)}.`;
  }
}

/* ------------------------------------------------------------------------- *
 * Paint: terminal
 * ------------------------------------------------------------------------- */

export type ColorDepth = "truecolor" | "256" | "16" | "none";

/** Pure: callers pass their own env and TTY fact. NO_COLOR always wins. */
export function resolveColorDepth(env: Readonly<Record<string, string | undefined>>, isTTY = true): ColorDepth {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return "none";
  if (!isTTY && env.FORCE_COLOR === undefined) return "none";
  const term = env.TERM ?? "";
  if (term === "dumb") return "none";
  const colorterm = (env.COLORTERM ?? "").toLowerCase();
  if (colorterm === "truecolor" || colorterm === "24bit") return "truecolor";
  if (term.includes("256")) return "256";
  return "16";
}

function sgr(role: Role, depth: ColorDepth): string {
  const c = ROLE_COLORS[role];
  if (depth === "truecolor") {
    const n = parseInt(c.hex.slice(1), 16);
    return `\u001b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
  }
  if (depth === "256") return `\u001b[38;5;${c.ansi256}m`;
  return `\u001b[${c.ansi16}m`;
}

/** Only this function emits escape sequences; segment text is never trusted
 * to carry them (sanitizeDisplay ran on every untrusted field). Foreground
 * only — never a background across the host bar. */
export function paintAnsi(segments: readonly Segment[], depth: ColorDepth): string {
  if (depth === "none") return toPlain(segments);
  return segments.map((s) => (s.role === "dim" && s.text.trim() === "" ? s.text : `${sgr(s.role, depth)}${s.text}\u001b[39m`)).join("");
}

export function toPlain(segments: readonly Segment[]): string {
  return segments.map((s) => s.text).join("");
}
