// SUPERSEDED: this extension is scheduled to be replaced by a forthcoming
// `pi-heaven` extension that consumes `plugins/skill-heaven` directly. Agent
// Plugin is a universal standard (see CLAUDE.md's one-mechanic/one-line/
// four-surfaces model), so other harnesses are expected to install or pick up
// that plugin rather than each re-implementing their own summon path. Until
// pi-heaven ships: the `/skill-hell` command below can still render the
// chooser and arm a rung, but it can no longer summon a skill by intent — the
// external `gaia-mcp` engine it used to shell out to is deprecated and this
// extension has not been rewired to the in-repo summon engine
// (`packages/skill-summon`). See the honest-degrade notice in the handler.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type HellLevel,
  type SummonedSkill,
  renderArmed,
  renderHellChooser,
  renderSummonedCard,
  HELL_RUNGS,
} from "../src/hell-presentation.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const profileEnv = "PI_ZERO_PROFILE";
const outputEntry = "pi-zero-output";
const summonedSkillEntry = "pi-zero-summoned-skill";

interface LaunchManifest {
  schema: "pi-zero/profile@1";
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
    manifest.schema === "pi-zero/profile@1" &&
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

// Honest-degrade notice for the removed intent-summon path. It used to shell
// out to the external `gaia-mcp` package's `skill-hell` binary (hunted for
// across $SKILL_HELL_BIN, $PATH, $GAIA_MCP_HOME, and ~/gaia-mcp); that
// package is deprecated and this extension has not been rewired to the
// in-repo summon engine. Told to the user verbatim — never silently no-op,
// never pretend a summon ran.
const SUMMON_BY_INTENT_UNAVAILABLE =
  "skill-hell: summon-by-intent is not wired in pi-zero. It used to shell out to " +
  "the deprecated external gaia-mcp package; this extension has not been rewired " +
  "to the in-repo summon engine and will be superseded by pi-heaven, built on the " +
  "plugins/skill-heaven Agent Plugin. Arm a rung (high|xhigh|max) here, or use " +
  "/summon in a harness that already has the Skill Heaven plugin installed.";

function renderPosture(manifest: LaunchManifest | null, loadedSkillCount: number, error?: string): string {
  if (!manifest) {
    return [
      "⚡ Skill Zero · off · low · med",
      "   Skill Zero postures are boot-time decisions and this session was not launched by pi-zero.",
      "   Start one with: → pi-zero --level low --skill <path>",
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
    "⚡ Skill Zero · off · low · med",
    `   session: launched at ${current} via pi-zero · ${loadedSkillCount} loaded now · ${planned} planned`,
    `   argv: ${formatInvocation(manifest.command, manifest.argv)}`,
    "   Skill Zero changes are boot-time choices; relaunch to move downward (D12).",
  ].join("\n");
}

export default function piZeroExtension(pi: ExtensionAPI) {
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

  pi.registerCommand("skill-zero", {
    description: "Show this session's Skill Zero posture",
    handler: async (_args, ctx) => {
      const { manifest, error } = loadManifest();
      const loadedSkillCount = ctx.getSystemPromptOptions().skills?.length ?? 0;
      const rendered = renderPosture(manifest, loadedSkillCount, error);
      pi.appendEntry(outputEntry, { content: rendered });
      ctx.ui.setWidget(outputEntry, undefined);
    },
  });

  pi.registerCommand("skill-hell", {
    description: "Show the Skill Hell chooser, or arm a rung (high|xhigh|max)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const input = args.trim();
      if (!input) {
        pi.appendEntry(outputEntry, { content: renderHellChooser() });
        ctx.ui.setWidget(outputEntry, undefined);
        return;
      }
      if (input === "ultra") {
        // Not a refusal. `ultra` is the crown rung (N13) and nothing on the line
        // refuses — but this door has not built the controller surface yet, so
        // it says exactly that rather than pretending either way.
        ctx.ui.notify(
          "ultra is the crown rung: the controller picks direction + depth per gap. " +
            "pi-zero has not built that surface yet — arm high|xhigh|max instead.",
          "warning",
        );
        return;
      }
      if ((HELL_RUNGS as readonly string[]).includes(input)) {
        armedLevel = input as HellLevel;
        const rendered = renderArmed(armedLevel);
        pi.appendEntry(outputEntry, { content: rendered, widgetLines: rendered.split("\n") });
        ctx.ui.setWidget(outputEntry, rendered.split("\n"));
        return;
      }
      // Summon-by-intent used to shell out to the external gaia-mcp engine.
      // That engine is deprecated and this extension has not been rewired to
      // the in-repo summon engine (see the header comment) — so this reports
      // the gap honestly instead of pretending a summon ran.
      ctx.ui.notify(SUMMON_BY_INTENT_UNAVAILABLE, "error");
      return;
    },
  });
}

export { renderArmed, renderHellChooser, renderSummonedCard, HELL_RUNGS };
export type { HellLevel, SummonedSkill };
