// Non-Claude Full pieces. Registration is argv-only; display strings are not executable recipes.
import type { HarnessId, HarnessPath, InstallStep, PieceSteps } from "./compat.js";
import type { ConsoleProjection, SurfaceSupport } from "./console-host.js";

const step = (argv: readonly string[], run: string, effect: string): InstallStep => ({ where: "shell", argv, run, effect });
const piece = (register: InstallStep[], update: InstallStep[], remove: InstallStep[]): PieceSteps => ({ register, update, remove });
const degraded = (via: string, note: string): SurfaceSupport => ({ level: "degraded", via, note });
const ROOT = "https://github.com/gaia-research/gaia-skill-heaven/blob/main";

export function adapterPath(id: Exclude<HarnessId, "claude" | "other">): Pick<HarnessPath, "console" | "core" | "consolePiece" | "fullBlocked"> {
  const pi = id === "pi";
  const hermes = id === "hermes";
  const agy = id === "agy";
  const versions = { pi: "1.0.4", codex: "0.161.0", hermes: "0.20.0", grok: "1.0.46", agy: "1.3.1" };
  const register = (console: boolean): InstallStep[] => {
    const dir = console ? "{{CONSOLE_DIR}}" : "{{PLUGIN_DIR}}";
    const name = console ? "skill-heaven-console" : "skill-heaven";
    if (pi) return [step(["pi", "install", dir, "--approve"], `pi install "${dir}" --approve`, `registers only ${name} as a Pi package`)];
    if (id === "codex") return [
      ...(console ? [] : [step(["codex", "plugin", "marketplace", "add", "{{MARKETPLACE_DIR}}"], 'codex plugin marketplace add "{{MARKETPLACE_DIR}}"', "registers the staged marketplace")]),
      step(["codex", "plugin", "add", `${name}@gaia-skill-heaven`], `codex plugin add ${name}@gaia-skill-heaven`, `registers only ${name}`),
    ];
    if (hermes) return [step(["hermes", "plugins", "install", `file://${dir}`, "--enable"], `hermes plugins install "file://${dir}" --enable`, `registers ${name}; staging MUST supply an independent Git root (Hermes clones Git sources)` )];
    if (id === "grok") return [step(["grok", "plugin", "install", dir, "--trust"], `grok plugin install "${dir}" --trust`, `registers only ${name}`)];
    return [step(["agy", "plugin", "install", dir], `agy plugin install "${dir}"`, `registers only ${name}; real HOME required`)];
  };
  const remove = (console: boolean): InstallStep[] => {
    const name = console ? "skill-heaven-console" : "skill-heaven";
    const dir = console ? "{{CONSOLE_DIR}}" : "{{PLUGIN_DIR}}";
    if (pi) return [step(["pi", "remove", dir], `pi remove "${dir}"`, `removes only ${name}`)];
    if (id === "codex") return [step(["codex", "plugin", "remove", `${name}@gaia-skill-heaven`], `codex plugin remove ${name}@gaia-skill-heaven`, `removes only ${name}`)];
    // Disable is independently reversible and needs no guessed/piped confirmation.
    if (hermes) return [step(["hermes", "plugins", "disable", name], `hermes plugins disable ${name}`, `disables only ${name}; host retains its cached copy`)];
    if (agy) return [step(["agy", "plugin", "disable", name], `agy plugin disable ${name}`, `disables only ${name}; uninstall is a separate interactive action`)];
    return [step(["grok", "plugin", "uninstall", name], `grok plugin uninstall ${name}`, `removes only ${name}`)];
  };
  const update = (console: boolean): InstallStep[] => {
    if (pi) return []; // local packages load staged files directly; pi update would touch unrelated packages
    if (hermes) {
      const steps = register(console);
      return steps.map(s => ({ ...s, argv: [...s.argv!, "--force"], run: s.run + " --force", effect: s.effect + "; replaces this cached copy" }));
    }
    if (agy) return register(console); // host install replaces its cached directory, per saved 1.3.1 evidence
    if (id === "codex") return [...remove(console), ...register(console)];
    return [...remove(console), ...register(console)]; // refresh the staged copy even at the same manifest version
  };
  const command = agy ? "/skill-heaven-console:heaven" : "/heaven";
  const report = pi ? "ctx.ui.setWidget (own key, below editor)" : hermes ? "native register_command /heaven report" : "explicit console skill/command (model-mediated)";
  const console: ConsoleProjection = {
    kind: pi ? "extension-ui" : "command-backed",
    mechanism: pi ? "Separate Pi extension: own setStatus key and command-opened widget. /lens uses Core's in-process preview bridge." : `${report}; one canonical renderConsoleText report, no fake HUD or status configuration rewrite.`,
    command,
    commandPrefix: agy ? "skill-heaven:" : "",
    surfaces: {
      status: pi ? { level: "native", via: "ctx.ui.setStatus(skill-heaven-console)", note: "Appends an owned entry; does not replace the footer." } : degraded(report, "Report only, not a persistent status contribution."),
      lens: degraded(pi ? "/lens + /heaven fill" : hermes ? "/lens + dispatch_tool on Core" : `${command} lens`, pi ? "Same Core server preview; explicit fill only, never submits." : hermes ? "Explicit preview:true on the existing Core tool; printed handoff." : "Explicit model-mediated preview:true on the existing Core tool; printed handoff, no automatic tool call."),
      session: degraded(report, "Bounded receipt window. Exact session binding required; no newest-directory guess."),
      scope: degraded(report, "Printed controls, not enforcement. Ultra controller remains unavailable."),
      flow: { level: "unsupported", via: report, note: "No implemented, empirically pinned agent-id attribution. Summons attributed to main; no invented agents." },
      trust: degraded(report, "Lists capabilities and limits; does not rate them."),
    },
    observes: { summon: pi ? "observed" : "reported", read: pi ? "observed" : "unavailable", agents: "unavailable", rung: pi ? "observed" : "unavailable" },
    summonTools: pi ? ["summon"] : agy ? ["skill-heaven_skill-summon/summon"] : id === "codex" ? ["mcp__skill-summon__summon"] : [],
    trust: [
      { id: "skill-heaven", profile: "core", kind: "harness runtime package", version: "0.1.2", summary: "Five entropy surfaces and the bundled summon engine.", reads: ["configured skill source"], writes: ["disposable engine session directory"], network: "Core fetches the configured skill source", disable: remove(false)[0]!.run },
      { id: "skill-heaven-console", profile: "full", kind: pi ? "Pi extension package" : hermes ? "Hermes native Python plugin + Node painter" : "command/skill plugin + Node report", version: "0.1.0", summary: "Read-only projection of the shared console model; independently removable.", reads: pi ? ["exact Core summon results", "successful read events", "active session branch"] : hermes ? ["caller-supplied exact Core sessionRoot ledger", "exact result of an explicit Lens command"] : ["caller-supplied exact Core sessionRoot ledger", ...(agy ? ["optional exact conversation transcript and confined result files"] : [])], writes: [], network: "none of its own; explicit Lens uses the existing Core tool", disable: remove(true)[0]!.run, notes: ["No hidden submission, automatic materialization, daemon, global configuration rewrite or independent summon server.", ...(pi ? ["Restored branches cannot prove successful body reads or rung selection; those facts are not replayed."] : ["Without an exact binding, counts are unknown. Command/skill output may pass through the model."])] },
    ],
    probe: { version: versions[id], summary: `Saved ${versions[id]} API/layout evidence informed this adapter. Compiled artifact and synthetic conformance tests are NOT an empirical Full compatibility receipt; live install, Lens and console-only removal still need a probe.`, href: `${ROOT}/plugins/skill-heaven-console-${id}/README.md` },
  };
  return { console, core: piece(register(false), update(false), remove(false)), consolePiece: hermes ? null : piece(register(true), update(true), remove(true)), fullBlocked: null };
}
