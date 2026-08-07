import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const profileEnv = "PI_HEAVEN_PROFILE";
const messageType = "pi-heaven";
const outputEntry = "pi-heaven-output";
const summonedSkillEntry = "pi-heaven-summoned-skill";
const ownedHellSessionEnv = "PI_HEAVEN_OWNS_HELL_SESSION";
const summonTimeoutMs = 30_000;

interface LaunchManifest {
  schema: "pi-heaven/profile@1";
  posture: string;
  command: string;
  argv: string[];
  admittedSkillCount: number | null;
  notes: string[];
}

function isLaunchManifest(value: unknown): value is LaunchManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Record<string, unknown>;
  return (
    manifest.schema === "pi-heaven/profile@1" &&
    typeof manifest.posture === "string" &&
    typeof manifest.command === "string" &&
    Array.isArray(manifest.argv) &&
    manifest.argv.every((arg) => typeof arg === "string") &&
    (manifest.admittedSkillCount === null || typeof manifest.admittedSkillCount === "number") &&
    Array.isArray(manifest.notes) &&
    manifest.notes.every((note) => typeof note === "string")
  );
}

function loadManifest(): { manifest: LaunchManifest | null; error?: string } {
  const profilePath = process.env[profileEnv];
  if (!profilePath) return { manifest: null };
  try {
    const value: unknown = JSON.parse(readFileSync(profilePath, "utf8"));
    if (!isLaunchManifest(value)) {
      return { manifest: null, error: `launch manifest at ${profilePath} has an unsupported shape` };
    }
    return { manifest: value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { manifest: null, error: `could not read launch manifest at ${profilePath}: ${message}` };
  }
}

function formatInvocation(command: string, argv: string[]): string {
  return [command, ...argv].map((part) => JSON.stringify(part)).join(" ");
}

interface HellEngine {
  command: string;
  args: string[];
  binPath: string;
}

interface SummonedSkill {
  id: string;
  name?: string;
  level?: string;
  trustMagnitude?: number;
  trust?: Record<string, unknown>;
  trustFields?: Record<string, unknown>;
  path: string;
  fileCount?: number;
  cache?: string;
  cacheState?: string;
  totalSeconds?: number;
}

interface SummonOutcome {
  query?: string;
  summoned?: SummonedSkill[];
  skipped?: Array<{ id: string; reason: string }>;
}

function executableOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep searching.
    }
  }
  return null;
}

function asEngine(binPath: string): HellEngine {
  return binPath.endsWith(".js")
    ? { command: process.execPath, args: [binPath], binPath }
    : { command: binPath, args: [], binPath };
}

function resolveHellEngine(): HellEngine {
  const checked: string[] = [];
  const explicit = process.env.SKILL_HELL_BIN;
  if (explicit) {
    if (existsSync(explicit)) return asEngine(explicit);
    checked.push(`$SKILL_HELL_BIN — set to ${explicit}, but nothing exists there`);
  } else {
    checked.push("$SKILL_HELL_BIN — not set");
  }

  const onPath = executableOnPath("skill-hell");
  if (onPath) return asEngine(onPath);
  checked.push("`skill-hell` on $PATH — not found");

  const gaiaMcpHome = process.env.GAIA_MCP_HOME;
  if (gaiaMcpHome) {
    const candidate = join(gaiaMcpHome, "dist", "bin", "skill-hell.js");
    if (existsSync(candidate)) return asEngine(candidate);
    checked.push(`$GAIA_MCP_HOME/dist/bin/skill-hell.js — not found at ${candidate}`);
  } else {
    checked.push("$GAIA_MCP_HOME — not set");
  }

  const fallback = join(homedir(), "gaia-mcp", "dist", "bin", "skill-hell.js");
  if (existsSync(fallback)) return asEngine(fallback);
  checked.push(`~/gaia-mcp/dist/bin/skill-hell.js — not found at ${fallback}`);

  throw new Error(
    [
      "skill-hell binary not found. Checked, in order:",
      ...checked.map((line, index) => `  ${index + 1}. ${line}`),
    ].join("\n"),
  );
}

async function ensureHellSession(pi: ExtensionAPI, engine: HellEngine): Promise<void> {
  if (process.env.SKILL_HELL_SESSION) return;
  const result = await pi.exec(engine.command, [...engine.args, "path"], { timeout: summonTimeoutMs });
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
    throw new Error(`skill-hell: could not create a persistent summon session: ${detail}`);
  }
  const sessionPath = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!sessionPath || !existsSync(join(sessionPath, "session.json"))) {
    throw new Error("skill-hell: path did not return a usable session directory");
  }
  process.env.SKILL_HELL_SESSION = sessionPath;
  process.env[ownedHellSessionEnv] = sessionPath;
}

export const rungBudgets = {
  high: { count: 1, relevance: "best relevant match only" },
  xhigh: { count: 3, relevance: "matches within 10% of the best score" },
  max: { count: 5, relevance: "matches within 25% of the best score" },
} as const;

type HellLevel = keyof typeof rungBudgets;

export function renderHellChooser(): string {
  return [
    "🔥 Skill Hell · high · xhigh · max · ultra",
    "",
    "   ● high    default · 1 skill/gap · tight relevance",
    "   ○ xhigh   3 skills/gap · within 10% of the best score",
    "   ○ max     5 skills/gap · within 25% of the best score",
    "   ⊘ ultra   UNRATIFIED · no approved summon budget",
    "",
    "   Select a rung to arm the lane; any other text manually summons for that intent.",
  ].join("\n");
}

function renderArmed(level: HellLevel): string {
  const budget = rungBudgets[level];
  return [
    `🔥 Skill Hell armed: ${level}`,
    `   budget: up to ${budget.count} skill${budget.count === 1 ? "" : "s"} per capability gap · ${budget.relevance}`,
    "   Summon only for a real gap; the lane remains armed afterward.",
    `   engine seam: summon --limit ${budget.count}; automatic gap detection remains a harness integration seam.`,
  ].join("\n");
}

export function renderSummonedCard(winner: SummonedSkill): string {
  const identity = winner.name ?? winner.id;
  const lines = [`┌ summoned · ${identity}`];
  if (winner.name && winner.id !== winner.name) lines.push(`   id: ${winner.id}`);
  const trust = winner.trustFields ?? winner.trust ??
    (typeof winner.trustMagnitude === "number" ? { trustMagnitude: winner.trustMagnitude } : undefined);
  for (const [name, value] of Object.entries(trust ?? {})) {
    if (["string", "number", "boolean"].includes(typeof value)) lines.push(`   ${name}: ${String(value)}`);
  }
  const cache = winner.cacheState ?? winner.cache;
  if (typeof winner.totalSeconds === "number" && cache) {
    lines.push(`   install: ${winner.totalSeconds.toFixed(2)}s · ${cache}`);
  }
  if (typeof winner.fileCount === "number") lines.push(`   files: ${winner.fileCount}`);
  lines.push(`   path: ${winner.path}`);
  lines.push(`   inspect: ${pathToFileURL(join(winner.path, "SKILL.md")).href}`);
  lines.push("└");
  return lines.join("\n");
}

function renderPosture(manifest: LaunchManifest | null, loadedSkillCount: number, error?: string): string {
  if (!manifest) {
    return [
      "⚡ Skill Heaven · off · low · med",
      "   Heaven rungs are boot-time decisions and this session was not launched by pi-heaven.",
      "   Start one with: → pi-heaven --level low --skill <path>",
      "   This command did not change the running session.",
      ...(error ? [`   manifest error: ${error}`] : []),
    ].join("\n");
  }

  const current =
    manifest.posture === "product-floor" ? "off" : manifest.posture === "curated" ? "low" : "med";
  const planned =
    manifest.admittedSkillCount === null
      ? "ambient/native"
      : String(manifest.admittedSkillCount);
  return [
    "⚡ Skill Heaven · off · low · med",
    `   session: launched at ${current} via pi-heaven · ${loadedSkillCount} loaded now · ${planned} planned`,
    `   argv: ${formatInvocation(manifest.command, manifest.argv)}`,
    "   Heaven changes are boot-time choices; relaunch to move downward (D12).",
  ].join("\n");
}

export default function piHeavenExtension(pi: ExtensionAPI) {
  let armedLevel: HellLevel = "high";

  pi.registerEntryRenderer<{ content: string; widgetLines?: string[] }>(outputEntry, (entry, _options, theme) => {
    return new Text(theme.fg("customMessageText", entry.data?.content ?? ""), 1, 1);
  });

  pi.on("session_start", (_event, ctx) => {
    const latestOutput = [...ctx.sessionManager.getBranch()]
      .reverse()
      .find((entry) => entry.type === "custom" && entry.customType === outputEntry);
    if (latestOutput?.type !== "custom") return;
    const data = latestOutput.data as { widgetLines?: unknown } | undefined;
    if (Array.isArray(data?.widgetLines) && data.widgetLines.every((line) => typeof line === "string")) {
      ctx.ui.setWidget(outputEntry, data.widgetLines as string[]);
    }
  });

  pi.on("session_shutdown", async (event) => {
    const ownedSession = process.env[ownedHellSessionEnv];
    if (event.reason !== "quit" || !ownedSession || process.env.SKILL_HELL_SESSION !== ownedSession) return;
    try {
      const engine = resolveHellEngine();
      await pi.exec(engine.command, [...engine.args, "close"], { timeout: summonTimeoutMs });
    } finally {
      delete process.env.SKILL_HELL_SESSION;
      delete process.env[ownedHellSessionEnv];
    }
  });

  pi.on("resources_discover", (_event, ctx) => {
    const skillPaths = new Set<string>();
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== summonedSkillEntry) continue;
      const data = entry.data as { path?: unknown } | undefined;
      if (typeof data?.path !== "string") continue;
      const skillFile = join(data.path, "SKILL.md");
      if (existsSync(skillFile)) skillPaths.add(skillFile);
    }
    return { skillPaths: [...skillPaths] };
  });

  pi.registerCommand("skill-heaven", {
    description: "Show this session's Skill Heaven posture",
    handler: async (_args, ctx) => {
      const { manifest, error } = loadManifest();
      const loadedSkillCount = ctx.getSystemPromptOptions().skills?.length ?? 0;
      const rendered = renderPosture(manifest, loadedSkillCount, error);
      pi.appendEntry(outputEntry, { content: rendered });
      ctx.ui.setWidget(outputEntry, undefined);
    },
  });

  pi.registerCommand("skill-hell", {
    description: "Arm additive skill summoning, or manually summon for an intent",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const input = args.trim();
      if (!input) {
        pi.appendEntry(outputEntry, { content: renderHellChooser() });
        ctx.ui.setWidget(outputEntry, undefined);
        return;
      }
      if (input === "ultra") {
        ctx.ui.notify("ultra is UNRATIFIED — no approved summon budget exists", "error");
        return;
      }
      if (input in rungBudgets) {
        armedLevel = input as HellLevel;
        const rendered = renderArmed(armedLevel);
        pi.appendEntry(outputEntry, { content: rendered, widgetLines: rendered.split("\n") });
        ctx.ui.setWidget(outputEntry, rendered.split("\n"));
        return;
      }
      const intent = input;

      let engine: HellEngine;
      try {
        engine = resolveHellEngine();
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }

      try {
        await ensureHellSession(pi, engine);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }

      const result = await pi.exec(
        engine.command,
        [...engine.args, "summon", intent, "--limit", String(rungBudgets[armedLevel].count), "--json"],
        { timeout: summonTimeoutMs },
      );
      if (result.code !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
        ctx.ui.notify(`skill-hell: summon failed (${engine.binPath}): ${detail}`, "error");
        return;
      }

      let outcome: SummonOutcome;
      try {
        outcome = JSON.parse(result.stdout) as SummonOutcome;
      } catch {
        const detail = result.stderr.trim();
        ctx.ui.notify(`skill-hell: engine returned unreadable output.${detail ? ` ${detail}` : ""}`, "error");
        return;
      }

      const winners = outcome.summoned ?? [];
      if (!winners.length) {
        const lines = [`skill-hell: no skill could be summoned for "${outcome.query ?? intent}".`];
        for (const skipped of outcome.skipped ?? []) {
          lines.push(`skipped ${skipped.id}: ${skipped.reason}`);
        }
        ctx.ui.notify(lines.join("\n"), "error");
        return;
      }

      for (const winner of winners) {
        const skillFile = join(winner.path, "SKILL.md");
        if (!existsSync(skillFile)) {
          ctx.ui.notify(
            `skill-hell: summoned ${winner.id} but its materialized SKILL.md is unavailable at ${skillFile}`,
            "error",
          );
          return;
        }
      }

      const cards = winners.map((winner) => renderSummonedCard(winner));
      for (const winner of winners) {
        pi.appendEntry(summonedSkillEntry, { path: winner.path, id: winner.id });
      }
      const rendered = cards.join("\n\n");
      const widgetLines = rendered.split("\n");
      pi.appendEntry(outputEntry, { content: rendered, widgetLines });
      ctx.ui.setWidget(outputEntry, widgetLines);
      pi.sendMessage({
        customType: messageType,
        content: rendered,
        display: false,
      });

      // Reload is terminal for a command handler. The persisted custom entry is
      // read by the new extension instance's resources_discover hook, which
      // adds the materialized SKILL.md to pi's native skill resources.
      await ctx.reload();
      return;
    },
  });
}
