// Session-scoped reduced-tool policy (issue #147).
//
// EVIDENCE (docs/evidence/tools-147/PROBE.md, claude 2.1.318, REAL authenticated
// sessions read from the stream-json `init` event's `tools` list):
//   --tools <names>             restricts the BUILT-IN set only. MCP tools stay.
//                               `--tools ""` removes every built-in.
//   --disallowedTools <names>   removes a named built-in AND a named MCP tool
//                               (`mcp__<server>__<tool>`); removing the summon
//                               tool made it vanish from the init list.
//   --allowedTools              DOES NOT restrict (a permission allow-rule only).
//                               Never used here.
// So the surface is two-layered and this module keeps them apart:
//   built-in tools  -> --tools (allowlist) and/or --disallowedTools (denylist)
//   MCP tools       -> --disallowedTools mcp__... only; the SET of MCP servers
//                      is the posture's business (--strict-mcp-config).
//
// P3: flags only. Nothing here reads or writes ~/.claude or any settings file.

/** Presets for `--tools`. Built-in names only; MCP is untouched by `--tools`. */
export const TOOL_PRESETS: Readonly<Record<string, readonly string[]>> = {
  // Read-only inspection. Skill is kept so plugin slash commands (/summon,
  // /skill-heaven, /skill-hell) can still run; the summon MCP tool is not a
  // built-in, so it is unaffected either way.
  minimal: ["Read", "Grep", "Glob", "Skill"],
  // No built-in tools at all (MCP, including summon, remains).
  none: [],
};

/** Reserved word: leave claude's own default built-in set untouched. */
export const TOOLS_DEFAULT = "default";

/** Every spelling under which the summon MCP tool can appear. The door's own
 * server is `skill-summon` (door-mcp.json); the installed plugin's is the
 * `plugin_skill-heaven_skill-summon` form seen in native sessions. */
const SUMMON_MARKERS = ["skill-summon"];

export class ToolPolicyError extends Error {}

export interface ToolPolicy {
  /** The user-visible spelling, for --print / manifest / statusline. */
  preset: string | null;
  /** Built-in allowlist passed as `--tools`. null = default set (no --tools). */
  builtinAllow: string[] | null;
  /** Built-in tools removed via --disallowedTools. */
  builtinDeny: string[];
  /** MCP tools removed via --disallowedTools (`mcp__...`). */
  mcpDeny: string[];
  /** True when the summon MCP tool is among the removals. */
  summonRemoved: boolean;
  /** Warnings to show BEFORE launch (also carried in --print notes). */
  warnings: string[];
}

export interface ToolPolicyInput {
  /** value of --tools: preset name, "default", or a comma list of built-ins */
  tools?: string;
  /** values of --remove-tools (each a comma list), built-in and/or mcp__ names */
  removeTools: string[];
}

const splitList = (s: string): string[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

const isMcpName = (n: string): boolean => n.startsWith("mcp__");
const isSummonName = (n: string): boolean => isMcpName(n) && SUMMON_MARKERS.some((m) => n.includes(m));

/** Resolve CLI input to a policy, or undefined when the user asked for nothing. */
export function resolveToolPolicy(input: ToolPolicyInput): ToolPolicy | undefined {
  const removed = input.removeTools.flatMap(splitList);
  if (input.tools === undefined && removed.length === 0) return undefined;

  let preset: string | null = null;
  let builtinAllow: string[] | null = null;
  if (input.tools !== undefined) {
    const raw = input.tools.trim();
    if (raw === "") {
      throw new ToolPolicyError(
        `--tools needs a value: a preset (${Object.keys(TOOL_PRESETS).join("|")}), "${TOOLS_DEFAULT}", or a comma list of built-in tool names.`,
      );
    }
    if (raw === TOOLS_DEFAULT) {
      preset = TOOLS_DEFAULT;
    } else if (Object.hasOwn(TOOL_PRESETS, raw)) {
      preset = raw;
      builtinAllow = [...TOOL_PRESETS[raw]!];
    } else {
      const names = splitList(raw);
      const mcp = names.filter(isMcpName);
      if (mcp.length > 0) {
        throw new ToolPolicyError(
          `--tools selects BUILT-IN tools only; claude's --tools does not govern MCP tools (${mcp.join(", ")}). ` +
            `Remove an MCP tool with --remove-tools ${mcp[0]}.`,
        );
      }
      if (names.length === 0) throw new ToolPolicyError(`--tools "${input.tools}" names no tools.`);
      builtinAllow = names;
    }
  }

  const builtinDeny = removed.filter((n) => !isMcpName(n));
  const mcpDeny = removed.filter(isMcpName);
  const summonRemoved = mcpDeny.some(isSummonName);

  const warnings: string[] = [];
  if (summonRemoved) {
    warnings.push(
      "you removed the summon MCP tool: /summon, /skill-heaven and /skill-hell cannot pull a skill into this session. " +
        "Drop that --remove-tools entry to keep them working.",
    );
  }
  if (builtinAllow !== null && builtinAllow.length === 0) {
    warnings.push("every built-in tool is removed: the model can still call MCP tools (the summon tool stays) but cannot read or edit files or run commands.");
  }
  if (builtinAllow !== null) {
    const conflict = builtinDeny.filter((n) => !builtinAllow!.includes(n));
    if (conflict.length > 0) {
      warnings.push(`--remove-tools ${conflict.join(",")} already absent from the --tools allowlist; no effect.`);
    }
  }
  return { preset, builtinAllow, builtinDeny, mcpDeny, summonRemoved, warnings };
}

/** The claude argv for a policy. Only verified flags: --tools, --disallowedTools. */
export function toolPolicyArgv(p: ToolPolicy | undefined): string[] {
  if (!p) return [];
  const argv: string[] = [];
  if (p.builtinAllow !== null) argv.push("--tools", p.builtinAllow.join(","));
  const deny = [...p.builtinDeny, ...p.mcpDeny];
  if (deny.length > 0) argv.push("--disallowedTools", deny.join(","));
  return argv;
}

/** Disclosure carried in the manifest (and read by the statusline). */
export interface ToolPolicyDisclosure {
  /** "default" or the preset name, or "custom" for an explicit list */
  tools: string;
  builtin: { mode: "default" | "allowlist"; allow?: string[]; removed: string[] };
  mcp: { removed: string[]; summonRemoved: boolean };
}

export function toolPolicyDisclosure(p: ToolPolicy | undefined): ToolPolicyDisclosure | undefined {
  if (!p) return undefined;
  return {
    tools: p.preset ?? (p.builtinAllow ? "custom" : "default"),
    builtin: {
      mode: p.builtinAllow ? "allowlist" : "default",
      ...(p.builtinAllow ? { allow: p.builtinAllow } : {}),
      removed: p.builtinDeny,
    },
    mcp: { removed: p.mcpDeny, summonRemoved: p.summonRemoved },
  };
}

/** Claude flags the door owns when a reduced-tool option is on; passing them
 * through as well would silently fight the door's policy. */
export const CLAUDE_TOOL_FLAGS = ["--tools", "--disallowedTools", "--disallowed-tools"] as const;

/** One-line human description, shared by the statusline and notes. */
export function describeToolPolicy(d: ToolPolicyDisclosure): string {
  const parts: string[] = [];
  if (d.builtin.mode === "allowlist") parts.push(`built-in: ${d.builtin.allow!.length === 0 ? "none" : d.builtin.allow!.join("+")}`);
  if (d.builtin.removed.length > 0) parts.push(`built-in removed: ${d.builtin.removed.join("+")}`);
  if (d.mcp.removed.length > 0) parts.push(`mcp removed: ${d.mcp.removed.length}${d.mcp.summonRemoved ? " (incl. summon)" : ""}`);
  return parts.join("; ") || "default";
}
