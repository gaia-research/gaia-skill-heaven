// Issue #144 — configured permission policy was silently lost at claude-zero
// launch.
//
// THE DEFECT, precisely. Every non-native posture composes `--setting-sources ''`
// (KC4's clean room: an EMPTY allowlist, not an omitted flag). That eviction is
// total, and it takes the user's permission configuration with it: a user whose
// `~/.claude/settings.json` carries `permissions.defaultMode` — including
// `"bypassPermissions"` — is handed a session with NO permission intent at all,
// which is what the issue reports as "reverts to auto-mode". The door chose
// clean-room skill/MCP/plugin isolation, and paid for it by deleting a decision
// the user had already made about their own machine.
//
// THE FIX IS DELIBERATELY NARROW, in three parts:
//
//   1. EXPLICIT permission flags are forwarded verbatim, on both the direct and
//      the post-`--` path, with the mode value consumed ATOMICALLY so a missing
//      value is an argument error instead of a silently swallowed mode.
//   2. WHERE the posture evicts ambient settings (product-floor, curated), the
//      door selectively carries ONE thing back: a default permission mode, and
//      nothing else. Not `permissions.allow`, not hooks, not plugins, not MCP
//      servers, not env, not credentials, not additional directories. Copying a
//      whole settings object would reintroduce exactly the ambient behavior the
//      clean room exists to remove (P3/KC4).
//   3. An explicit permission flag on the command line WINS over inheritance,
//      including a SAFER mode over an inherited bypass. `--allow-
//      dangerously-skip-permissions` is capability enablement — it is never
//      treated as a request to ENTER bypass mode, and it never suppresses
//      inheritance.
//
// PROBED, NOT ASSUMED (claude 2.1.288 — see PROBE.md, issue #144). Six live
// cells in a disposable fixture, all harmless writes to a temp file, decided by
// whether the file appeared — a host signal, never a model's self-report:
//
//   A  session `--settings` {permissions:{defaultMode:"acceptEdits"}} + the
//      full `--setting-sources ''` isolation ..... WROTE the file
//   B  session `--settings` with no permission key ......................... did not
//   C  A plus an explicit `--permission-mode default` ...................... did not
//      -> explicit CLI mode beats settings defaultMode (matches the 2.1.288
//         `permissionModeSuppliedOnInvocation` flag in the binary)
//   D  session `--settings` {defaultMode:"bypassPermissions"}, no CLI flag .. WROTE
//      -> THE FIX'S MECHANISM: an inherited bypass is honored through the same
//         settings channel the user's own setting used
//   E  explicit `--dangerously-skip-permissions`, no settings permission key  WROTE
//   F  `--allow-dangerously-skip-permissions` alone ......................... did not
//      -> enablement is not bypass
//
// So the settings channel carries a mode correctly, and the CLI wins over it.
// That is the whole contract; everything below is an implementation of those
// two facts with the narrowest possible surface.
//
// SAFEGUARDS THIS MODULE DELIBERATELY DOES NOT TOUCH. The door preserves the
// user's INTENT and stops there. It never sets `skipDangerousModePermissionPrompt`
// (auto-acknowledging the bypass prompt would be circumventing a safeguard the
// user put there), never writes `permissions.allow`/`deny` rules, and never
// overrides managed/organization policy — 2.1.288 string evidence shows managed
// and IDE-owned sessions can ignore a settings bypass on their own
// (`settings defaultMode "bypassPermissions" ignored for a VS Code-owned session
// without the allow-bypass setting`), and that stays VISIBLE here rather than
// being papered over. P3: this module READS one settings file and writes
// nothing at all.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Posture } from "skill-zero";

/**
 * Modes `claude --permission-mode` accepts — `claude --help`, 2.1.288:
 * "(choices: acceptEdits, auto, bypassPermissions, manual, dontAsk, plan)".
 *
 * The door does NOT validate user-supplied flag values against this list (a
 * newer Claude may add modes, and pinning the launcher to one version's enum
 * would reject a valid future value). It is used for the one thing the door
 * itself must interpret: a mode read out of the user's settings.
 */
export const CLI_PERMISSION_MODES = [
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "manual",
  "dontAsk",
  "plan",
] as const;

/**
 * Modes `permissions.defaultMode` accepts. A SUPERSET of the CLI choices on
 * 2.1.288: the settings schema also knows `default`, which `--permission-mode`
 * does not offer. Both halves are probed/string-evidenced, not guessed.
 */
export const SETTINGS_PERMISSION_MODES = [...CLI_PERMISSION_MODES, "default"] as const;

export type PermissionMode = (typeof SETTINGS_PERMISSION_MODES)[number];

/** The canonical Claude settings key, and the two issue-reported compatibility keys. */
export const CANONICAL_MODE_KEY = "permissions.defaultMode";
export const COMPAT_MODE_KEY = "permissionMode";
export const COMPAT_BYPASS_KEY = "dangerouslySkipPermissions";

export interface UserPermissionIntent {
  /** An inherited default mode, from the canonical or the compatibility key. */
  mode?: PermissionMode;
  /** An explicit boolean bypass request from the compatibility key. `false`
   * grants nothing — it is the absence of intent, not a safer mode. */
  bypass: boolean;
  /** Which key produced `mode` / `bypass` — for an honest disclosure. Never the
   * value of anything else in the file. */
  modeKey?: string;
  bypassKey?: string;
}

export interface ExplicitPermissionSelection {
  /** An explicit `--permission-mode <mode>` at a real option position. */
  mode?: string;
  /** An explicit `--dangerously-skip-permissions` at a real option position. */
  bypass: boolean;
  /** `--allow-dangerously-skip-permissions`: capability enablement ONLY. It is
   * never converted into the bypass flag and never suppresses inheritance. */
  allowBypass: boolean;
}

export interface ResolvedPermissions {
  source: "cli" | "user-settings" | "default";
  /** The mode to write into the SESSION settings file as
   * `permissions.defaultMode` — undefined when nothing is inherited. */
  settingsMode?: PermissionMode;
  /** Flags to insert before the caller's untouched `claudeArgs` tail. Empty
   * whenever a mode alone expresses the intent (cell D beats needing this). */
  argv: string[];
  /** One short line for the user. Never contains settings content or paths. */
  disclosure?: string;
  /** Compose-time notes, so the evidence travels inside the plan itself. */
  notes: string[];
}

export const NATIVE_NO_INHERITANCE_NOTE =
  "claude-zero: posture native is claude untouched (P3) — claude-zero reads no " +
  "user settings and injects no permission flag there; claude's own settings " +
  "precedence applies unchanged.";

const NO_INTENT_NOTE =
  "claude-zero: your Claude settings carry no permission mode, so none is " +
  "inherited and claude's own default applies. The door never invents a mode.";

/**
 * Claude options that consume the NEXT token as their value, on 2.1.288. The
 * scanner uses this so a value that merely CONTAINS a permission flag is not
 * mistaken for one — the failure mode the issue's own prose invites (a prompt
 * string saying "--dangerously-skip-permissions" is not a flag).
 *
 * `--print` is deliberately NOT here: `claude --help` documents it as a boolean
 * (`--print, -p  Print response and exit`), and treating it as value-taking would
 * swallow the token after it — so a real `--permission-mode` behind a `--print`
 * would go unseen and an inherited mode would silently override the user.
 *
 * LIMIT, stated rather than hidden: this is not a reimplementation of claude's
 * parser. An unlisted option that takes a value could still hide one. Unknown
 * options are treated as booleans on purpose — the alternative (guessing that
 * any unknown flag takes a value) would swallow real permission flags, which is
 * the one error class that would silently grant bypass.
 */
const VALUE_TAKING_OPTIONS = new Set([
  "-p",
  "--model",
  "--fallback-model",
  "--effort",
  "--settings",
  "--mcp-config",
  "--permission-mode",
  "--permission-prompts",
  "--output-format",
  "--input-format",
  "--append-system-prompt",
  "--system-prompt",
  "--session-id",
  "--agents",
  "--add-dir",
  "--allowed-tools",
  "--disallowed-tools",
  "-c",
  "--config",
]);

/** Throwaway-fixture/override inputs. Both are explicit so tests never read the
 * developer's real `~/.claude`. */
export interface PermissionLookupOptions {
  /** `CLAUDE_CONFIG_DIR` when the caller supplies one; the settings file is
   * `<configDir>/settings.json`. */
  configDir?: string;
  /** Used only when no config root is supplied: `<home>/.claude/settings.json`. */
  home?: string;
}

export function userSettingsPath(opts: PermissionLookupOptions = {}): string {
  if (opts.configDir) return join(opts.configDir, "settings.json");
  return join(opts.home ?? homedir(), ".claude", "settings.json");
}

/**
 * Read an OWN property only.
 *
 * This is a security-sensitive read: an inherited mode can grant permission
 * bypass. Ordinary property lookup would also see anything on
 * `Object.prototype`, so a polluted prototype (from any other module sharing the
 * process) could invent a configured permission mode that the user's file never
 * contained. Own-property reads close that door, and `JSON.parse` puts
 * `__proto__` in the file as an ordinary own key rather than as a prototype, so
 * nothing legitimate is lost.
 */
function own(obj: object, key: string): unknown {
  return Object.hasOwn(obj, key) ? (obj as Record<string, unknown>)[key] : undefined;
}

function invalid(message: string): Error {
  // Deliberately no path and no file content: the door must not print either.
  return new Error(`claude-zero: ${message}`);
}

function readMode(value: unknown, key: string): PermissionMode {
  if (typeof value !== "string") {
    throw invalid(
      `${key} must be a permission mode string, got ${typeof value}. ` +
        `Supported: ${SETTINGS_PERMISSION_MODES.join(", ")}.`,
    );
  }
  if (!(SETTINGS_PERMISSION_MODES as readonly string[]).includes(value)) {
    throw invalid(
      `${key} is "${value}", which claude 2.1.288 does not support. ` +
        `Supported: ${SETTINGS_PERMISSION_MODES.join(", ")}. ` +
        `Refusing to launch silently in a different permission mode — pass ` +
        `--permission-mode <mode> to choose one explicitly, or fix settings.json.`,
    );
  }
  return value as PermissionMode;
}

/**
 * Read the user's OWN permission intent out of their Claude settings file — and
 * only that. A missing file is the normal case (nothing configured, nothing
 * inherited). A file that EXISTS but cannot be interpreted is a launch error:
 * silently falling back to a different permission mode is the bug this module
 * exists to close, so the door refuses instead of guessing.
 */
export function readUserPermissionIntent(
  opts: PermissionLookupOptions = {},
): UserPermissionIntent {
  const settingsPath = userSettingsPath(opts);
  let raw: string;
  try {
    raw = readFileSync(settingsPath, "utf-8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // ENOENT and only ENOENT is "not configured". ENOTDIR is NOT: it means a
    // component of the config path exists but is not a directory (a config root
    // or ~/.claude that is a regular file), which is a broken configuration whose
    // permission mode we cannot read. Treating that as "unset" is precisely the
    // silent fallback this module exists to end.
    if (err.code === "ENOENT") return { bypass: false }; // not configured — normal
    throw invalid(
      `could not read your Claude settings.json (${err.code ?? "read error"}). ` +
        (err.code === "ENOTDIR"
          ? `A configured Claude config path is not a directory, so its ` +
            `permission mode cannot be read. `
          : ``) +
        `claude-zero reads it only to carry your permission mode through the ` +
        `clean room; it is not writing to it. Fix or remove the path, or pass an ` +
        `explicit --permission-mode.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // The parse message can echo a fragment of the file, so it is NOT included.
    throw invalid(
      `your Claude settings.json is not valid JSON, so the permission mode in it ` +
        `cannot be read. Refusing to guess a permission mode. Fix the file, or ` +
        `pass an explicit --permission-mode.`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid(
      `your Claude settings.json is not a JSON object, so the permission mode in ` +
        `it cannot be read. Refusing to guess a permission mode.`,
    );
  }

  const settings = parsed as Record<string, unknown>;
  const intent: UserPermissionIntent = { bypass: false };

  // Canonical: permissions.defaultMode. `permissions: null` is absence, not
  // corruption; any other non-object value is a malformed intent.
  const permissions = own(settings, "permissions");
  if (permissions !== undefined && permissions !== null) {
    if (typeof permissions !== "object" || Array.isArray(permissions)) {
      throw invalid(
        `"permissions" in your Claude settings.json must be an object, got ` +
          `${Array.isArray(permissions) ? "array" : typeof permissions}. Refusing ` +
          `to guess a permission mode.`,
      );
    }
    const perm = permissions as Record<string, unknown>;
    const defaultMode = own(perm, "defaultMode");
    if (defaultMode !== undefined) {
      intent.mode = readMode(defaultMode, "permissions.defaultMode");
      intent.modeKey = "permissions.defaultMode";
    }
  }

  // Compatibility inputs, issue-reported. These are NOT claimed to be claude
  // settings keys — they are launcher-side aliases for users who wrote them.
  const compatMode = own(settings, "permissionMode");
  if (compatMode !== undefined) {
    const mode = readMode(compatMode, '"permissionMode"');
    if (intent.mode !== undefined && intent.mode !== mode) {
      throw invalid(
        `your Claude settings disagree with themselves: ` +
          `permissions.defaultMode is "${intent.mode}" but permissionMode is ` +
          `"${mode}". Refusing to pick one for you. Pass an explicit ` +
          `--permission-mode <mode> to settle it for this launch.`,
      );
    }
    intent.mode ??= mode;
    intent.modeKey ??= "permissionMode";
  }

  const compatBypass = own(settings, "dangerouslySkipPermissions");
  if (compatBypass !== undefined) {
    if (typeof compatBypass !== "boolean") {
      throw invalid(
        `"dangerouslySkipPermissions" in your Claude settings.json must be a ` +
          `boolean, got ${typeof compatBypass}. Refusing to guess whether you ` +
          `asked to bypass permission checks.`,
      );
    }
    if (compatBypass) {
      if (intent.mode !== undefined && intent.mode !== "bypassPermissions") {
        throw invalid(
          `your Claude settings disagree with themselves: ` +
            `dangerouslySkipPermissions is true but the configured mode is ` +
            `"${intent.mode}", not "bypassPermissions". Refusing to pick one. ` +
            `Pass an explicit --permission-mode <mode> to settle it for this launch.`,
        );
      }
      intent.bypass = true;
      intent.bypassKey = "dangerouslySkipPermissions";
    }
  }

  return intent;
}

/**
 * Which permission options are actually present, by OPTION POSITION.
 *
 * A literal `--` ends the scan: everything after it is claude's own tail (cell
 * C's `--permission-mode default` came from a real flag, but a prompt passed
 * with `-- -p --dangerously-skip-permissions` is a prompt, not a flag).
 */
export function explicitPermissionSelection(claudeArgs: readonly string[]): ExplicitPermissionSelection {
  const found: ExplicitPermissionSelection = { bypass: false, allowBypass: false };
  for (let i = 0; i < claudeArgs.length; i++) {
    const arg = claudeArgs[i];
    if (arg === "--") break;
    if (arg === "--dangerously-skip-permissions") {
      found.bypass = true;
      continue;
    }
    if (arg === "--allow-dangerously-skip-permissions") {
      found.allowBypass = true;
      continue;
    }
    if (arg === "--permission-mode") {
      // Only the mode VALUE matters here, and only for the disclosure's
      // precision. A missing value is caught (as an argument error) by the
      // CLI's parser, not here.
      const value = claudeArgs[i + 1];
      if (value !== undefined && !value.startsWith("-")) {
        found.mode = value;
        i++;
      }
      continue;
    }
    if (arg.startsWith("--permission-mode=")) {
      const value = arg.slice("--permission-mode=".length);
      if (value.length > 0) found.mode = value;
      continue;
    }
    if (arg.startsWith("-") && !arg.startsWith("--") && !VALUE_TAKING_OPTIONS.has(arg)) {
      continue; // a clustered short flag: boolean, no value consumed
    }
    // Any other known value-taking option swallows the next token, so a
    // permission flag sitting in that slot is a VALUE, not a flag.
    if (VALUE_TAKING_OPTIONS.has(arg)) i++;
  }
  return found;
}

export interface ResolveLaunchPermissionsInput extends PermissionLookupOptions {
  posture: Posture;
  claudeArgs?: readonly string[];
}

/**
 * Resolve the launch's permission handling from three sources, in order:
 * explicit CLI flags → the user's own settings → nothing (claude's own default).
 *
 * Non-native postures only: `native` is claude untouched (P3), so this returns
 * the no-op resolution there without reading any user file.
 */
export function resolveLaunchPermissions(
  input: ResolveLaunchPermissionsInput,
): ResolvedPermissions {
  if (input.posture === "native") {
    return { source: "default", argv: [], notes: [NATIVE_NO_INHERITANCE_NOTE] };
  }

  const explicit = explicitPermissionSelection(input.claudeArgs ?? []);
  // --allow-dangerously-skip-permissions is capability enablement. It selects no
  // permission mode, so it neither activates bypass nor suppresses inheritance —
  // and it is never converted into the real bypass flag.
  const allowBypassNote = explicit.allowBypass
    ? "claude-zero: --allow-dangerously-skip-permissions only makes bypass " +
      "AVAILABLE; it is not a request to enter bypass mode, so it neither " +
      "activated bypass nor suppressed permission inheritance."
    : undefined;
  const explicitNote =
    `claude-zero: an explicit permission flag on this command line ` +
    `(${[explicit.mode && `--permission-mode ${explicit.mode}`, explicit.bypass && "--dangerously-skip-permissions"]
      .filter(Boolean)
      .join(", ")}) wins over the permission mode configured in your Claude ` +
    `settings, which this clean room would otherwise drop. Nothing was injected.`;

  if (explicit.mode !== undefined || explicit.bypass) {
    // Explicit flags are forwarded verbatim and NOT duplicated, rebuilt, or
    // reordered here: conflicting explicit flags stay claude's to interpret
    // or reject. A SAFER explicit mode over an inherited bypass lands here.
    const notes = [explicitNote, ...(allowBypassNote ? [allowBypassNote] : [])];
    return { source: "cli", argv: [], notes };
  }

  // An explicit selection can bypass the read entirely — including its error
  // path. An explicit --permission-mode IS the answer to "what mode?", so a
  // malformed settings file must not block a launch that already answered it.
  const intent = readUserPermissionIntent({
    ...(input.configDir !== undefined ? { configDir: input.configDir } : {}),
    ...(input.home !== undefined ? { home: input.home } : {}),
  });

  if (intent.mode === undefined && !intent.bypass) {
    return {
      source: "default",
      argv: [],
      notes: [NO_INTENT_NOTE, ...(allowBypassNote ? [allowBypassNote] : [])],
    };
  }

  const resolved: ResolvedPermissions = {
    source: "user-settings",
    argv: [],
    notes: allowBypassNote ? [allowBypassNote] : [],
  };

  if (intent.mode !== undefined) {
    // Cell D: the settings channel carries a mode correctly under full
    // isolation, so a configured mode rides the SAME channel the user's own
    // setting used — including "bypassPermissions", which needs no extra flag
    // and therefore has exactly one source of truth in the session file.
    resolved.settingsMode = intent.mode;
    resolved.notes.push(
      `claude-zero: this launch's clean room (--setting-sources '') would drop ` +
        `the permission mode configured in your Claude settings, so ` +
        `permissions.defaultMode="${intent.mode}"` +
        `${intent.modeKey && intent.modeKey !== "permissions.defaultMode" ? ` (via ${intent.modeKey})` : ""}` +
        ` is re-applied in the session settings file. Nothing else from your ` +
        `settings was imported — no allow/deny rules, hooks, plugins, MCP ` +
        `servers, env, or credentials. An explicit permission flag on the ` +
        `command line still wins.`,
    );
  }

  if (intent.bypass) {
    // Cell E: the real bypass flag reaches claude and works. It is the flag
    // rather than the settings key because the intent arrived as a BOOLEAN
    // compatibility key, not as a mode; claude's own managed policy and bypass
    // acknowledgment still apply (the door never sets
    // skipDangerousModePermissionPrompt).
    resolved.argv = ["--dangerously-skip-permissions"];
    resolved.notes.push(
      `claude-zero: your Claude settings set ${intent.bypassKey}=true, so this ` +
        `launch passes --dangerously-skip-permissions to carry that request ` +
        `through the clean room. This is a request claude may still decline ` +
        `(managed policy, IDE-owned session, or its own bypass acknowledgment) — ` +
        `claude-zero does not suppress any of those, and never sets ` +
        `skipDangerousModePermissionPrompt to skip one.`,
    );
  }

  resolved.disclosure = resolved.notes.map((n) => n.replace(/^claude-zero:\s*/, "")).join(" ");
  return resolved;
}