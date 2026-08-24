// D6 cross-repo gate helper (CI). Assembles a record through core's OWN
// assembleRecord — the exact shape `--record` emits — with fixed, synthetic
// inputs (no live harness run), and prints it as one JSONL line. CI pipes this
// to gaia-research's `scripts/hell-heaven-bench/ledger.ts validate` so a change
// that drifts our emitted record out of the upstream schema fails the build.
//
//   npx tsx packages/core/scripts/emit-sample-record.ts > rec.jsonl
//   npx tsx <gaia-research>/scripts/hell-heaven-bench/ledger.ts validate --file rec.jsonl
import { assembleRecord } from "../src/record.js";

const rec = assembleRecord({
  model: "haiku",
  harness: { name: "claude", version: "2.1.216 (Claude Code)" },
  wallClockMs: 1234,
  recordedAt: "2026-07-22T00:00:00.000Z",
  resultText: "NONE",
  usage: { input_tokens: 4, output_tokens: 5, cache_creation_input_tokens: 10, cache_read_input_tokens: 100 },
  opts: { benchmarkId: "hh-m2-smoke", task: "listing-probe", arm: "placebo", rung: "benchmark-floor", repeatIndex: 0, endpointRegex: "^NONE$" },
  posture: "floor",
  skills: [],
});
process.stdout.write(JSON.stringify(rec) + "\n");
