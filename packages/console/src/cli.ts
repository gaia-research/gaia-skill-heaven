import { buildConsoleView, renderConsoleText, harnessById, CONSOLE_SURFACES, type HarnessId, type ConsoleSurface } from "../../status/src/index.js";
import { ledgerState, agyState, unknownState, observedState, MAX_BYTES } from "./reader.js";

const args = process.argv.slice(2);
function value(flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`missing ${flag}`);
  return v;
}
try {
  const host = value("--host") as HarnessId;
  if (!["codex", "grok", "hermes", "agy"].includes(host)) throw new Error("explicit --host required");
  const root = value("--session-root");
  const transcript = value("--transcript");
  const stdin = args.includes("--observations-stdin");
  if (Number(!!root) + Number(!!transcript) + Number(stdin) > 1) throw new Error("choose one exact session source");
  if (transcript && host !== "agy") throw new Error("transcript reader is agy-only");
  if (stdin && host !== "hermes") throw new Error("observation pipe is Hermes-only");
  let state = root ? ledgerState(root) : transcript ? agyState(transcript) : unknownState();
  if (stdin) {
    let text = "";
    for await (const chunk of process.stdin) {
      text += chunk.toString();
      if (Buffer.byteLength(text) > MAX_BYTES) throw new Error("observation pipe exceeds bound");
    }
    const frame = JSON.parse(text) as { rows?: unknown; complete?: unknown };
    if (!Array.isArray(frame.rows)) throw new Error("observation rows required");
    state = observedState(frame.rows);
    if (frame.complete !== true) state.status = { ...state.status, skills: null, summons: null };
  }
  const surface = value("--surface") ?? "all";
  if (surface !== "all" && !CONSOLE_SURFACES.includes(surface as ConsoleSurface)) throw new Error("unknown surface");
  if (!root && !transcript && !stdin) console.log("No exact session binding supplied. Counts are unknown, not zero. Supply the sessionRoot returned by your Core tool.");
  console.log(renderConsoleText(buildConsoleView(state, harnessById(host)), { surface: surface as ConsoleSurface | "all" }));
} catch {
  // Never echo raw paths, prompts or parser errors into the host transcript.
  console.error("Skill Heaven console: session source unavailable or invalid; no session was guessed.");
  process.exitCode = 1;
}
