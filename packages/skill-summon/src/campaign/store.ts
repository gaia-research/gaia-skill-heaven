import { appendFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  campaignSha256Hex,
  canonicalCampaignJson,
  formatCampaignEvidenceLine,
  formatCampaignTraceLine,
  immutableSnapshot,
  initialCampaignState,
  parseCampaignEvent,
  parseCampaignEvidenceLines,
  parseCampaignTraceLines,
  serializeCampaignRecord,
  stepCampaign,
  toControllerStatus,
  verifyCampaignTraceLines,
  type CampaignEvent,
  type CampaignOperatorCommand,
  type CampaignState,
  type CampaignTraceEntry,
  type CampaignTraceRecord,
  type CampaignVerificationOptions,
  type ControllerStatus,
  type EngineCommand,
  type PersistedCampaignEvidenceLine,
  type PersistedCampaignTraceLine,
} from "skill-zero";

import { assertConfinedPath } from "../summon/session.js";

export const CAMPAIGN_DIR_NAME = "campaign";
export const CAMPAIGN_TRACE_FILE = "trace.jsonl";
export const CAMPAIGN_EVIDENCE_FILE = "evidence.jsonl";
export const CAMPAIGN_STATUS_FILE = "status.json";

export type CampaignStoreAppendResult = Readonly<{
  state: CampaignState;
  entry: CampaignTraceEntry;
  status: ControllerStatus;
}>;

/**
 * Persistent campaign store confined to `<sessionRoot>/campaign/`.
 *
 * Threat model for separately bound persistence evidence (`evidence.jsonl`):
 * - Serialized `operator` and `engine` events in `trace.jsonl` have NO intrinsic
 *   authority. Replay and verification NEVER authorize an event merely because
 *   of its `channel`, `accepted` flag, or any assertion inside `trace.jsonl`.
 * - In-process `append()` receives live branded `CampaignEvent` instances
 *   (`stepCampaign` checks the private engine WeakSets). For each step, the
 *   store records a separate `evidence.jsonl` entry binding `(seq,
 *   authorizedPrivileged, sha256(canonical(event)), sha256(canonicalRecord))`.
 * - Against trace-only tampering (editing/truncating/reordering `trace.jsonl`,
 *   forging `operator`/`engine` claims, flipping `accepted`, or deleting a
 *   trailing no-op), `evidence.jsonl` mismatches and load fails closed into
 *   `FAILED_SAFE` without repairing or rewriting `trace.jsonl`.
 * - Against an attacker with arbitrary write access to the entire `campaign/`
 *   directory (who could rewrite both `trace.jsonl` and `evidence.jsonl`
 *   consistently), a sibling file cannot provide cryptographic root-of-trust;
 *   callers requiring stronger guarantees must supply an out-of-band
 *   `authorize(event, index)` callback and/or `expectedRecord` commitment via
 *   `CampaignVerificationOptions`.
 */
export class CampaignStore {
  readonly sessionRoot: string;
  readonly campaignDir: string;
  readonly tracePath: string;
  readonly evidencePath: string;
  readonly statusPath: string;

  #initial: CampaignState;
  #state: CampaignState;
  #lines: PersistedCampaignTraceLine[];
  #hasTrace: boolean;
  #corrupted: boolean;
  #error: string | undefined;

  private constructor(
    sessionRoot: string,
    state: CampaignState,
    lines: PersistedCampaignTraceLine[],
    hasTrace: boolean,
    corrupted: boolean,
    error?: string,
  ) {
    this.sessionRoot = sessionRoot;
    this.campaignDir = path.join(sessionRoot, CAMPAIGN_DIR_NAME);
    this.tracePath = path.join(this.campaignDir, CAMPAIGN_TRACE_FILE);
    this.evidencePath = path.join(this.campaignDir, CAMPAIGN_EVIDENCE_FILE);
    this.statusPath = path.join(this.campaignDir, CAMPAIGN_STATUS_FILE);
    this.#initial = initialCampaignState();
    this.#state = state;
    this.#lines = lines;
    this.#hasTrace = hasTrace;
    this.#corrupted = corrupted;
    this.#error = error;
  }

  get state(): CampaignState {
    return this.#state;
  }

  get trace(): readonly CampaignTraceEntry[] {
    return this.#lines.map((line) => line.entry);
  }

  get hasTrace(): boolean {
    return this.#hasTrace;
  }

  get corrupted(): boolean {
    return this.#corrupted;
  }

  get error(): string | undefined {
    return this.#error;
  }

  static async load(
    sessionRoot: string,
    options: CampaignVerificationOptions = {},
  ): Promise<CampaignStore> {
    const campaignDir = path.join(sessionRoot, CAMPAIGN_DIR_NAME);
    const tracePath = path.join(campaignDir, CAMPAIGN_TRACE_FILE);
    const evidencePath = path.join(campaignDir, CAMPAIGN_EVIDENCE_FILE);
    const statusPath = path.join(campaignDir, CAMPAIGN_STATUS_FILE);

    await assertConfinedPath(sessionRoot, tracePath, "Campaign trace");
    await assertConfinedPath(sessionRoot, evidencePath, "Campaign evidence");
    await assertConfinedPath(sessionRoot, statusPath, "Campaign status");

    let traceStat;
    try {
      traceStat = await lstat(tracePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new CampaignStore(
          sessionRoot,
          initialCampaignState(),
          [],
          false,
          false,
        );
      }
      throw error;
    }

    if (traceStat.isSymbolicLink() || !traceStat.isFile()) {
      throw new Error(`Campaign trace must be a regular file: ${tracePath}`);
    }

    const traceRaw = await readFile(tracePath, "utf8");
    const parsedTrace = parseCampaignTraceLines(traceRaw);
    if (!parsedTrace.ok) {
      return CampaignStore.#failedSafe(sessionRoot, parsedTrace.error);
    }

    let evidenceLines: readonly PersistedCampaignEvidenceLine[] | undefined;
    let evidencePresent = false;
    try {
      const evidenceStat = await lstat(evidencePath);
      if (evidenceStat.isSymbolicLink() || !evidenceStat.isFile()) {
        return CampaignStore.#failedSafe(
          sessionRoot,
          "Campaign evidence must be a regular file",
        );
      }
      evidencePresent = true;
      const evidenceRaw = await readFile(evidencePath, "utf8");
      const parsedEvidence = parseCampaignEvidenceLines(evidenceRaw);
      if (!parsedEvidence.ok) {
        return CampaignStore.#failedSafe(sessionRoot, parsedEvidence.error);
      }
      evidenceLines = parsedEvidence.lines;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    if (evidencePresent && evidenceLines!.length !== parsedTrace.lines.length) {
      return CampaignStore.#failedSafe(
        sessionRoot,
        `Campaign evidence length (${evidenceLines!.length}) does not match trace length (${parsedTrace.lines.length})`,
      );
    }

    const authorize = (
      event: CampaignOperatorCommand | EngineCommand,
      index: number,
    ): boolean => {
      if (options.authorize) {
        return options.authorize(event, index) === true;
      }
      if (!evidenceLines) return false;
      const ev = evidenceLines[index];
      if (!ev || ev.seq !== index || !ev.authorizedPrivileged) return false;
      return ev.eventSha256 === campaignSha256Hex(canonicalCampaignJson(event));
    };

    const verification = verifyCampaignTraceLines(parsedTrace.lines, {
      authorize,
      expectedRecord: options.expectedRecord,
    });
    if (!verification.valid) {
      return CampaignStore.#failedSafe(sessionRoot, verification.error);
    }

    if (evidenceLines && parsedTrace.lines.length > 0) {
      const lastEvidence = evidenceLines[parsedTrace.lines.length - 1]!;
      const actualRecordSha = campaignSha256Hex(
        serializeCampaignRecord(verification.record),
      );
      if (lastEvidence.recordSha256 !== actualRecordSha) {
        return CampaignStore.#failedSafe(sessionRoot, "Campaign record commitment mismatch");
      }
    }

    return new CampaignStore(
      sessionRoot,
      verification.record.final,
      [...parsedTrace.lines],
      true,
      false,
    );
  }

  async append(event: CampaignEvent | unknown): Promise<CampaignStoreAppendResult> {
    if (this.#corrupted) {
      throw new Error(
        `Refusing to append to corrupted campaign trace (${this.#error ?? "FAILED_SAFE"})`,
      );
    }

    await ensureConfinedCampaignDir(this.sessionRoot, this.campaignDir);
    await assertConfinedPath(this.sessionRoot, this.tracePath, "Campaign trace");
    await assertConfinedPath(
      this.sessionRoot,
      this.evidencePath,
      "Campaign evidence",
    );
    await assertConfinedPath(this.sessionRoot, this.statusPath, "Campaign status");

    const seq = this.#lines.length;
    const step = stepCampaign(this.#state, event, seq);
    const descriptor = parseCampaignEvent(event);
    const line: PersistedCampaignTraceLine = {
      seq,
      event: descriptor,
      entry: step.entry,
    };

    const nextLines = [...this.#lines, line];
    const nextRecord: CampaignTraceRecord = {
      schema: CAMPAIGN_SCHEMA_IDS.trace,
      initial: this.#initial,
      final: step.state,
      events: nextLines.map((item) => item.event),
      trace: nextLines.map((item) => item.entry),
    };

    const authorizedPrivileged =
      (step.entry.channel === "operator" || step.entry.channel === "engine") &&
      step.entry.accepted === true;
    const evidenceLine: PersistedCampaignEvidenceLine = {
      seq,
      authorizedPrivileged,
      eventSha256: campaignSha256Hex(canonicalCampaignJson(descriptor)),
      recordSha256: campaignSha256Hex(serializeCampaignRecord(nextRecord)),
    };

    const status = toControllerStatus(step.state, step.entry);

    await appendFile(
      this.tracePath,
      `${formatCampaignTraceLine(line)}\n`,
      { encoding: "utf8", flag: "a" },
    );
    await appendFile(
      this.evidencePath,
      `${formatCampaignEvidenceLine(evidenceLine)}\n`,
      { encoding: "utf8", flag: "a" },
    );
    await writeFile(
      this.statusPath,
      `${JSON.stringify(status, null, 2)}\n`,
      "utf8",
    );

    this.#state = step.state;
    this.#lines = nextLines;
    this.#hasTrace = true;

    return { state: step.state, entry: step.entry, status };
  }

  static #failedSafe(sessionRoot: string, error: string): CampaignStore {
    const failedState = immutableSnapshot({
      ...initialCampaignState(),
      state: CampaignStates.failedSafe,
    });
    return new CampaignStore(sessionRoot, failedState, [], true, true, error);
  }
}

async function ensureConfinedCampaignDir(
  sessionRoot: string,
  campaignDir: string,
): Promise<void> {
  await assertConfinedPath(sessionRoot, campaignDir, "Campaign directory");
  try {
    const stat = await lstat(campaignDir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Campaign directory ${campaignDir} must be a real directory.`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(campaignDir);
  }
  await assertConfinedPath(sessionRoot, campaignDir, "Campaign directory");
}
