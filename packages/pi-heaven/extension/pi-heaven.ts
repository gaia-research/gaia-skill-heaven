import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
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
  level: string;
  trustMagnitude?: number;
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
  const explicit = process.env.GAIA_HELL_BIN;
  if (explicit) {
    if (existsSync(explicit)) return asEngine(explicit);
    checked.push(`$GAIA_HELL_BIN — set to ${explicit}, but nothing exists there`);
  } else {
    checked.push("$GAIA_HELL_BIN — not set");
  }

  const onPath = executableOnPath("gaia-hell");
  if (onPath) return asEngine(onPath);
  checked.push("`gaia-hell` on $PATH — not found");

  const gaiaMcpHome = process.env.GAIA_MCP_HOME;
  if (gaiaMcpHome) {
    const candidate = join(gaiaMcpHome, "dist", "bin", "gaia-hell.js");
    if (existsSync(candidate)) return asEngine(candidate);
    checked.push(`$GAIA_MCP_HOME/dist/bin/gaia-hell.js — not found at ${candidate}`);
  } else {
    checked.push("$GAIA_MCP_HOME — not set");
  }

  const fallback = join(homedir(), "gaia-mcp", "dist", "bin", "gaia-hell.js");
  if (existsSync(fallback)) return asEngine(fallback);
  checked.push(`~/gaia-mcp/dist/bin/gaia-hell.js — not found at ${fallback}`);

  throw new Error(
    [
      "gaia-hell binary not found. Checked, in order:",
      ...checked.map((line, index) => `  ${index + 1}. ${line}`),
    ].join("\n"),
  );
}

async function ensureHellSession(pi: ExtensionAPI, engine: HellEngine): Promise<void> {
  if (process.env.GAIA_HELL_SESSION) return;
  const result = await pi.exec(engine.command, [...engine.args, "path"], { timeout: summonTimeoutMs });
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
    throw new Error(`gaia-hell: could not create a persistent summon session: ${detail}`);
  }
  const sessionPath = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!sessionPath || !existsSync(join(sessionPath, "session.json"))) {
    throw new Error("gaia-hell: path did not return a usable session directory");
  }
  process.env.GAIA_HELL_SESSION = sessionPath;
  process.env[ownedHellSessionEnv] = sessionPath;
}

function renderSummonedHeader(winner: SummonedSkill): string {
  const trust = typeof winner.trustMagnitude === "number" ? winner.trustMagnitude.toFixed(1) : "n/a";
  const cache = winner.cache ?? winner.cacheState;
  const cost =
    typeof winner.totalSeconds === "number" && cache
      ? `  (${winner.totalSeconds.toFixed(2)}s, ${cache})`
      : "";
  const files =
    typeof winner.fileCount === "number"
      ? `  (${winner.fileCount} file${winner.fileCount === 1 ? "" : "s"})`
      : "";
  return [
    `  ${"summoned".padEnd(8)}  ${winner.id}  ${winner.level}  TM ${trust}${cost}`,
    `${" ".repeat(12)}-> ${winner.path}${files}`,
  ].join("\n");
}

function renderPosture(manifest: LaunchManifest | null, loadedSkillCount: number, error?: string): string {
  if (!manifest) {
    return [
      "⚡ Skill Heaven — posture",
      "   session: vanilla pi — no pi-heaven launch manifest.",
      `   skills admitted by pi now: ${loadedSkillCount}`,
      ...(error ? [`   manifest error: ${error}`] : []),
      "",
      "   ⊘  hell          LOCKED (P2). /skill-hell is a locked door, not an activator.",
      "",
      "   No boot posture can be inferred from this session. This command does not",
      "   offer subtractive recomposition: nothing can be taken out of a session",
      "   that is already running.",
    ].join("\n");
  }

  const planned =
    manifest.admittedSkillCount === null
      ? "not knowable by the launcher for native posture"
      : String(manifest.admittedSkillCount);
  const lines = [
    "⚡ Skill Heaven — posture",
    `   session: launched at ${manifest.posture} via pi-heaven`,
    `   argv: ${formatInvocation(manifest.command, manifest.argv)}`,
    `   skills admitted by pi now: ${loadedSkillCount} (planned at boot: ${planned})`,
    "",
    "   compiler notes (verbatim):",
    ...manifest.notes.map((note) => `   - ${note}`),
    "",
    "   ⊘  hell          LOCKED (P2). /skill-hell is a locked door, not an activator.",
  ];

  if (manifest.posture !== "floor") {
    lines.push(
      "   ⊘  cleaner       Composed at boot, never mid-session (D12) — not a policy",
      "                     hold, a harness limit: no in-session command removes",
      "                     already loaded resources while preserving this conversation.",
    );
  }

  lines.push(
    "",
    "   A session moves UP only, from the posture it launched at: nothing can be",
    "   taken out of a session that is already running. This command reports the",
    "   launch composition; it cannot restart or recompose pi for you.",
  );
  return lines.join("\n");
}

export default function piHeavenExtension(pi: ExtensionAPI) {
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
    if (event.reason !== "quit" || !ownedSession || process.env.GAIA_HELL_SESSION !== ownedSession) return;
    try {
      const engine = resolveHellEngine();
      await pi.exec(engine.command, [...engine.args, "close"], { timeout: summonTimeoutMs });
    } finally {
      delete process.env.GAIA_HELL_SESSION;
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
    description: "Summon the best matching skill for an intent",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const intent = args.trim();
      if (!intent) {
        ctx.ui.notify("gaia-hell: no intent given — usage: /skill-hell <intent>", "error");
        return;
      }

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
        [...engine.args, "summon", intent, "--limit", "1", "--json"],
        { timeout: summonTimeoutMs },
      );
      if (result.code !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
        ctx.ui.notify(`gaia-hell: summon failed (${engine.binPath}): ${detail}`, "error");
        return;
      }

      let outcome: SummonOutcome;
      try {
        outcome = JSON.parse(result.stdout) as SummonOutcome;
      } catch {
        const detail = result.stderr.trim();
        ctx.ui.notify(`gaia-hell: engine returned unreadable output.${detail ? ` ${detail}` : ""}`, "error");
        return;
      }

      const winner = outcome.summoned?.[0];
      if (!winner) {
        const lines = [`gaia-hell: no skill could be summoned for "${outcome.query ?? intent}".`];
        for (const skipped of outcome.skipped ?? []) {
          lines.push(`skipped ${skipped.id}: ${skipped.reason}`);
        }
        ctx.ui.notify(lines.join("\n"), "error");
        return;
      }

      const skillFile = join(winner.path, "SKILL.md");
      let body: string;
      try {
        body = readFileSync(skillFile, "utf8");
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(
          `gaia-hell: summoned ${winner.id} but could not read its materialized SKILL.md at ${skillFile}: ${detail}`,
          "error",
        );
        return;
      }

      const header = renderSummonedHeader(winner);
      const rendered = `${header}\n\n${body}`;
      pi.appendEntry(summonedSkillEntry, { path: winner.path, id: winner.id });
      const widgetLines = header.split("\n");
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
