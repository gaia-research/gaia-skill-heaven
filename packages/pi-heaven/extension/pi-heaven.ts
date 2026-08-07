import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const profileEnv = "PI_HEAVEN_PROFILE";
const messageType = "pi-heaven";

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
  pi.registerMessageRenderer(messageType, (message, { outputPad }, theme) => {
    const content = typeof message.content === "string" ? message.content : "(unsupported message content)";
    return new Text(theme.fg("customMessageText", content), outputPad, 1);
  });

  pi.registerCommand("skill-heaven", {
    description: "Show this session's Skill Heaven posture",
    handler: async (_args, ctx) => {
      const { manifest, error } = loadManifest();
      const loadedSkillCount = ctx.getSystemPromptOptions().skills?.length ?? 0;
      pi.sendMessage({
        customType: messageType,
        content: renderPosture(manifest, loadedSkillCount, error),
        display: true,
      });
    },
  });
}
