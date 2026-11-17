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
  replayCampaign,
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
import {
  acquireCampaignStoreClaimForRoot,
  assertCampaignStoreClaimBorrowActive,
  assertSessionClaimActive,
  isCampaignClaimPresentReadOnly,
  type CampaignStoreClaimBorrow,
} from "../summon/session-ownership.js";

export const CAMPAIGN_DIR_NAME = "campaign";
export const CAMPAIGN_TRACE_FILE = "trace.jsonl";
export const CAMPAIGN_EVIDENCE_FILE = "evidence.jsonl";
export const CAMPAIGN_STATUS_FILE = "status.json";

export type CampaignStoreAppendResult = Readonly<{
  state: CampaignState;
  entry: CampaignTraceEntry;
  status: ControllerStatus;
}>;

export type CampaignStoreLoadOptions = CampaignVerificationOptions & {
  refreshStatus?: boolean;
  claimBorrow?: CampaignStoreClaimBorrow;
};

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
  #hasCompleteEvidence: boolean;
  #evidenceError: string | undefined;
  #corrupted: boolean;
  #error: string | undefined;
  #recordSha256: string | undefined;
  #options: CampaignVerificationOptions;
  #appendQueue: Promise<void> = Promise.resolve();

  private constructor(
    sessionRoot: string,
    state: CampaignState,
    lines: PersistedCampaignTraceLine[],
    hasTrace: boolean,
    hasCompleteEvidence: boolean,
    corrupted: boolean,
    error?: string,
    recordSha256?: string,
    options: CampaignVerificationOptions = {},
    evidenceError?: string,
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
    this.#hasCompleteEvidence = hasCompleteEvidence;
    this.#evidenceError = evidenceError;
    this.#corrupted = corrupted;
    this.#error = error;
    this.#recordSha256 = recordSha256;
    this.#options = options;
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

  get recordSha256(): string | undefined {
    return this.#recordSha256;
  }

  static async load(
    sessionRoot: string,
    options: CampaignStoreLoadOptions = {},
  ): Promise<CampaignStore> {
    const refreshStatus = options.refreshStatus ?? true;
    const claimBorrow = options.claimBorrow;
    const verificationOptions: CampaignVerificationOptions = {
      authorize: options.authorize,
      expectedRecord: options.expectedRecord,
    };
    const campaignDir = path.join(sessionRoot, CAMPAIGN_DIR_NAME);
    const statusPath = path.join(campaignDir, CAMPAIGN_STATUS_FILE);

    await assertConfinedPath(sessionRoot, campaignDir, "Campaign directory");

    let campaignDirExists = false;
    try {
      const dirStat = await lstat(campaignDir);
      if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
        throw new Error(`Campaign directory ${campaignDir} must be a real directory.`);
      }
      campaignDirExists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    if (!campaignDirExists) {
      if (claimBorrow !== undefined) {
        await assertCampaignStoreClaimBorrowActive(claimBorrow, sessionRoot, {
          fullConfinementCheck: false,
        });
      } else {
        const claimState = await isCampaignClaimPresentReadOnly(sessionRoot);
        if (claimState !== "absent") {
          throw new Error(
            refreshStatus
              ? `Refusing to load campaign store: campaign store ownership claim is ${claimState}`
              : `Refusing unstable read-only campaign load: campaign store ownership claim is ${claimState}`,
          );
        }
      }
      return new CampaignStore(
        sessionRoot,
        initialCampaignState(),
        [],
        false,
        true,
        false,
        undefined,
        undefined,
        verificationOptions,
      );
    }

    if (claimBorrow !== undefined) {
      await assertCampaignStoreClaimBorrowActive(claimBorrow, sessionRoot);
      const verified = await verifyOnDiskState(sessionRoot, verificationOptions);
      if (verified.kind !== "absent" && refreshStatus) {
        await assertCampaignStoreClaimBorrowActive(claimBorrow, sessionRoot);
      }
      return buildLoadedStore(
        sessionRoot,
        statusPath,
        verified,
        refreshStatus,
        verificationOptions,
      );
    }

    if (!refreshStatus) {
      const verified = await verifyReadOnlyConsistentSnapshot(
        sessionRoot,
        verificationOptions,
      );
      return buildLoadedStore(
        sessionRoot,
        statusPath,
        verified,
        false,
        verificationOptions,
      );
    }

    const claim = await acquireCampaignStoreClaimForRoot(sessionRoot);
    if (claim.status !== "acquired") {
      throw new Error(
        `Refusing to load campaign store: campaign store ownership claim is ${claim.status}`,
      );
    }

    try {
      const verified = await verifyOnDiskState(sessionRoot, verificationOptions);
      if (verified.kind !== "absent") {
        await assertSessionClaimActive(
          claim,
          sessionRoot,
          "campaign status refresh",
        );
      }
      return await buildLoadedStore(
        sessionRoot,
        statusPath,
        verified,
        true,
        verificationOptions,
      );
    } finally {
      await claim.release();
    }
  }

  async append(event: CampaignEvent | unknown): Promise<CampaignStoreAppendResult> {
    const run = this.#appendQueue.then(() => this.#appendSerialized(event));
    this.#appendQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #appendSerialized(
    event: CampaignEvent | unknown,
  ): Promise<CampaignStoreAppendResult> {
    if (this.#corrupted) {
      throw new Error(
        `Refusing to append to corrupted campaign trace (${this.#error ?? "FAILED_SAFE"})`,
      );
    }
    if (!this.#hasCompleteEvidence) {
      throw new Error(
        `Refusing to append: ${this.#evidenceError ?? "historical campaign evidence is absent"}`,
      );
    }

    await assertConfinedPath(this.sessionRoot, this.campaignDir, "Campaign directory");
    await assertConfinedPath(this.sessionRoot, this.tracePath, "Campaign trace");
    await assertConfinedPath(
      this.sessionRoot,
      this.evidencePath,
      "Campaign evidence",
    );
    await assertConfinedPath(this.sessionRoot, this.statusPath, "Campaign status");

    const claim = await acquireCampaignStoreClaimForRoot(this.sessionRoot);
    if (claim.status !== "acquired") {
      throw new Error(
        `Refusing to append: campaign store ownership claim is ${claim.status}`,
      );
    }

    try {
      await this.#assertDiskMatchesMemory();

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

      await ensureConfinedCampaignDir(this.sessionRoot, this.campaignDir);
      await assertConfinedPath(this.sessionRoot, this.tracePath, "Campaign trace");
      await assertConfinedPath(
        this.sessionRoot,
        this.evidencePath,
        "Campaign evidence",
      );
      await assertConfinedPath(this.sessionRoot, this.statusPath, "Campaign status");
      await assertSessionClaimActive(claim, this.sessionRoot, "campaign append");

      try {
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
      } catch (error) {
        this.#corrupted = true;
        this.#error = `Partial write failure during campaign append: ${error instanceof Error ? error.message : String(error)}`;
        throw error;
      }

      this.#state = step.state;
      this.#lines = nextLines;
      this.#hasTrace = true;
      this.#hasCompleteEvidence = true;
      this.#evidenceError = undefined;
      this.#recordSha256 = evidenceLine.recordSha256;

      return { state: step.state, entry: step.entry, status };
    } finally {
      await claim.release();
    }
  }

  async #assertDiskMatchesMemory(): Promise<void> {
    if (!this.#hasTrace) {
      for (const target of [this.tracePath, this.evidencePath, this.statusPath]) {
        try {
          await lstat(target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw error;
        }
        this.#corrupted = true;
        this.#error = "Campaign trace on disk changed since load";
        throw new Error(
          `Refusing to append: ${this.#error} (${target})`,
        );
      }
      return;
    }

    const disk = await verifyOnDiskState(this.sessionRoot, {
      authorize: this.#options.authorize,
    });
    if (disk.kind === "absent") {
      this.#corrupted = true;
      this.#error = "Campaign trace on disk was removed since load";
      throw new Error(`Refusing to append: ${this.#error}`);
    }
    if (disk.kind === "failed_safe") {
      this.#corrupted = true;
      this.#error = disk.error;
      throw new Error(
        `Refusing to append to corrupted campaign trace (${disk.error})`,
      );
    }
    if (
      disk.lines.length !== this.#lines.length ||
      canonicalCampaignJson(disk.lines) !== canonicalCampaignJson(this.#lines)
    ) {
      this.#corrupted = true;
      this.#error = "Campaign trace on disk changed since load";
      throw new Error(`Refusing to append: ${this.#error}`);
    }
    if (disk.lines.length > 0 && !disk.hasEvidence) {
      this.#hasCompleteEvidence = false;
      this.#evidenceError = disk.evidenceError;
      throw new Error(
        `Refusing to append: ${disk.evidenceError ?? "historical campaign evidence is absent"}`,
      );
    }
  }

  private static createLoaded(
    sessionRoot: string,
    state: CampaignState,
    lines: PersistedCampaignTraceLine[],
    hasTrace: boolean,
    hasCompleteEvidence: boolean,
    corrupted: boolean,
    error?: string,
    recordSha256?: string,
    options: CampaignVerificationOptions = {},
    evidenceError?: string,
  ): CampaignStore {
    return new CampaignStore(
      sessionRoot,
      state,
      lines,
      hasTrace,
      hasCompleteEvidence,
      corrupted,
      error,
      recordSha256,
      options,
      evidenceError,
    );
  }
}

async function buildLoadedStore(
  sessionRoot: string,
  statusPath: string,
  verified: OnDiskVerificationResult,
  refreshStatus: boolean,
  verificationOptions: CampaignVerificationOptions,
): Promise<CampaignStore> {
  if (verified.kind === "absent") {
    return CampaignStore["createLoaded"](
      sessionRoot,
      initialCampaignState(),
      [],
      false,
      true,
      false,
      undefined,
      undefined,
      verificationOptions,
    );
  }

  if (verified.kind === "failed_safe") {
    const failedState = immutableSnapshot({
      ...initialCampaignState(),
      state: CampaignStates.failedSafe,
    });
    if (refreshStatus) {
      await syncStatusIfNeeded(
        sessionRoot,
        statusPath,
        toControllerStatus(failedState),
      );
    }
    return CampaignStore["createLoaded"](
      sessionRoot,
      failedState,
      [],
      true,
      false,
      true,
      verified.error,
      undefined,
      verificationOptions,
      verified.error,
    );
  }

  if (refreshStatus) {
    const expectedStatus = toControllerStatus(
      verified.state,
      verified.lines.at(-1)?.entry,
    );
    await syncStatusIfNeeded(sessionRoot, statusPath, expectedStatus);
  }

  const hasCompleteEvidence =
    verified.lines.length === 0 || verified.hasEvidence;
  return CampaignStore["createLoaded"](
    sessionRoot,
    verified.state,
    verified.lines,
    true,
    hasCompleteEvidence,
    false,
    undefined,
    verified.recordSha256,
    verificationOptions,
    hasCompleteEvidence ? undefined : verified.evidenceError,
  );
}

type OnDiskVerificationResult =
  | { kind: "absent" }
  | { kind: "failed_safe"; error: string }
  | {
      kind: "valid";
      state: CampaignState;
      lines: PersistedCampaignTraceLine[];
      recordSha256: string;
      hasEvidence: boolean;
      evidenceError?: string;
    };

type FileMetaSnapshot = {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
};

type CampaignRawSnapshot =
  | {
      traceExists: false;
      anyArtifactExists: boolean;
    }
  | {
      traceExists: true;
      traceStat: FileMetaSnapshot;
      traceRaw: string;
      evidenceExists: false;
    }
  | {
      traceExists: true;
      traceStat: FileMetaSnapshot;
      traceRaw: string;
      evidenceExists: true;
      evidenceNonRegular: true;
    }
  | {
      traceExists: true;
      traceStat: FileMetaSnapshot;
      traceRaw: string;
      evidenceExists: true;
      evidenceNonRegular: false;
      evidenceStat: FileMetaSnapshot;
      evidenceRaw: string;
    };

function metaSnapshot(stat: {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
}): FileMetaSnapshot {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function metaSnapshotsEqual(a: FileMetaSnapshot, b: FileMetaSnapshot): boolean {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs
  );
}

function snapshotsEqual(
  a: CampaignRawSnapshot,
  b: CampaignRawSnapshot,
): boolean {
  if (!a.traceExists || !b.traceExists) {
    return (
      a.traceExists === b.traceExists &&
      !a.traceExists &&
      !b.traceExists &&
      a.anyArtifactExists === b.anyArtifactExists
    );
  }
  if (!metaSnapshotsEqual(a.traceStat, b.traceStat) || a.traceRaw !== b.traceRaw) {
    return false;
  }
  if (a.evidenceExists !== b.evidenceExists) {
    return false;
  }
  if (!a.evidenceExists || !b.evidenceExists) {
    return true;
  }
  if (a.evidenceNonRegular || b.evidenceNonRegular) {
    return a.evidenceNonRegular === b.evidenceNonRegular;
  }
  return (
    metaSnapshotsEqual(a.evidenceStat, b.evidenceStat) &&
    a.evidenceRaw === b.evidenceRaw
  );
}

async function readCampaignRawSnapshot(
  sessionRoot: string,
): Promise<CampaignRawSnapshot> {
  const campaignDir = path.join(sessionRoot, CAMPAIGN_DIR_NAME);
  const tracePath = path.join(campaignDir, CAMPAIGN_TRACE_FILE);
  const evidencePath = path.join(campaignDir, CAMPAIGN_EVIDENCE_FILE);
  const statusPath = path.join(campaignDir, CAMPAIGN_STATUS_FILE);

  await assertConfinedPath(sessionRoot, tracePath, "Campaign trace");
  await assertConfinedPath(sessionRoot, evidencePath, "Campaign evidence");

  let traceStat;
  try {
    traceStat = await lstat(tracePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        traceExists: false,
        anyArtifactExists: await anyCampaignArtifactExists([
          evidencePath,
          statusPath,
        ]),
      };
    }
    throw error;
  }

  if (traceStat.isSymbolicLink() || !traceStat.isFile()) {
    throw new Error(`Campaign trace must be a regular file: ${tracePath}`);
  }

  const traceRaw = await readFile(tracePath, "utf8");

  let evidenceStat;
  try {
    evidenceStat = await lstat(evidencePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        traceExists: true,
        traceStat: metaSnapshot(traceStat),
        traceRaw,
        evidenceExists: false,
      };
    }
    throw error;
  }

  if (evidenceStat.isSymbolicLink() || !evidenceStat.isFile()) {
    return {
      traceExists: true,
      traceStat: metaSnapshot(traceStat),
      traceRaw,
      evidenceExists: true,
      evidenceNonRegular: true,
    };
  }

  const evidenceRaw = await readFile(evidencePath, "utf8");
  return {
    traceExists: true,
    traceStat: metaSnapshot(traceStat),
    traceRaw,
    evidenceExists: true,
    evidenceNonRegular: false,
    evidenceStat: metaSnapshot(evidenceStat),
    evidenceRaw,
  };
}

async function verifyReadOnlyConsistentSnapshot(
  sessionRoot: string,
  options: CampaignVerificationOptions = {},
): Promise<OnDiskVerificationResult> {
  const claimBefore = await isCampaignClaimPresentReadOnly(sessionRoot);
  if (claimBefore !== "absent") {
    throw new Error(
      `Refusing unstable read-only campaign load: campaign store ownership claim is ${claimBefore}`,
    );
  }

  const snap1 = await readCampaignRawSnapshot(sessionRoot);

  const claimMid = await isCampaignClaimPresentReadOnly(sessionRoot);
  if (claimMid !== "absent") {
    throw new Error(
      `Refusing unstable read-only campaign load: campaign store ownership claim is ${claimMid}`,
    );
  }

  const snap2 = await readCampaignRawSnapshot(sessionRoot);
  if (!snapshotsEqual(snap1, snap2)) {
    throw new Error(
      "Refusing unstable read-only campaign load: campaign files changed during read",
    );
  }

  const claimAfter = await isCampaignClaimPresentReadOnly(sessionRoot);
  if (claimAfter !== "absent") {
    throw new Error(
      `Refusing unstable read-only campaign load: campaign store ownership claim is ${claimAfter}`,
    );
  }

  return verifyCampaignRawSnapshot(snap1, options);
}

type StandaloneEvidenceCheck =
  | { ok: true }
  | { ok: false; kind: "absent" | "inconsistent"; error: string };

function validateStandaloneEvidence(
  lines: readonly PersistedCampaignTraceLine[],
  evidenceLines: readonly PersistedCampaignEvidenceLine[] | undefined,
): StandaloneEvidenceCheck {
  if (lines.length === 0) {
    if (evidenceLines && evidenceLines.length > 0) {
      return {
        ok: false,
        kind: "inconsistent",
        error: `Campaign evidence length (${evidenceLines.length}) does not match trace length (0)`,
      };
    }
    return { ok: true };
  }

  if (!evidenceLines) {
    return {
      ok: false,
      kind: "absent",
      error: "historical campaign evidence is absent",
    };
  }

  if (evidenceLines.length !== lines.length) {
    return {
      ok: false,
      kind: "inconsistent",
      error: `Campaign evidence length (${evidenceLines.length}) does not match trace length (${lines.length})`,
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const ev = evidenceLines[i]!;
    if (ev.seq !== i) {
      return {
        ok: false,
        kind: "inconsistent",
        error: `Campaign evidence sequence mismatch at ${i}`,
      };
    }
    const expectedEventSha = campaignSha256Hex(
      canonicalCampaignJson(line.event),
    );
    if (ev.eventSha256 !== expectedEventSha) {
      return {
        ok: false,
        kind: "inconsistent",
        error: `Campaign evidence event hash mismatch at ${i}`,
      };
    }
    const expectedAuthorizedPrivileged =
      (line.entry.channel === "operator" || line.entry.channel === "engine") &&
      line.entry.accepted === true;
    if (ev.authorizedPrivileged !== expectedAuthorizedPrivileged) {
      return {
        ok: false,
        kind: "inconsistent",
        error: `Campaign evidence authorization flag mismatch at ${i}`,
      };
    }
  }

  const sidecarAuthorize = (
    event: CampaignOperatorCommand | EngineCommand,
    index: number,
  ): boolean => {
    const ev = evidenceLines[index];
    if (!ev || ev.seq !== index || !ev.authorizedPrivileged) return false;
    return ev.eventSha256 === campaignSha256Hex(canonicalCampaignJson(event));
  };

  const standaloneVerification = verifyCampaignTraceLines(lines, {
    authorize: sidecarAuthorize,
  });
  if (!standaloneVerification.valid) {
    return {
      ok: false,
      kind: "inconsistent",
      error: standaloneVerification.error,
    };
  }

  const events = lines.map((line) => line.event);
  for (let i = 0; i < lines.length; i++) {
    const prefixReplay = replayCampaign(events.slice(0, i + 1), {
      authorize: sidecarAuthorize,
    });
    const expectedRecordSha = campaignSha256Hex(
      serializeCampaignRecord(prefixReplay.record),
    );
    if (evidenceLines[i]!.recordSha256 !== expectedRecordSha) {
      return {
        ok: false,
        kind: "inconsistent",
        error: `Campaign evidence record commitment mismatch at ${i}`,
      };
    }
  }

  return { ok: true };
}

function verifyCampaignRawSnapshot(
  snap: CampaignRawSnapshot,
  options: CampaignVerificationOptions = {},
): OnDiskVerificationResult {
  if (!snap.traceExists) {
    if (snap.anyArtifactExists) {
      return {
        kind: "failed_safe",
        error: "Campaign trace is missing while campaign artifacts survive",
      };
    }
    return { kind: "absent" };
  }

  const parsedTrace = parseCampaignTraceLines(snap.traceRaw);
  if (!parsedTrace.ok) {
    return { kind: "failed_safe", error: parsedTrace.error };
  }

  let evidenceLines: readonly PersistedCampaignEvidenceLine[] | undefined;
  if (snap.evidenceExists) {
    if (snap.evidenceNonRegular) {
      return {
        kind: "failed_safe",
        error: "Campaign evidence must be a regular file",
      };
    }
    const parsedEvidence = parseCampaignEvidenceLines(snap.evidenceRaw);
    if (!parsedEvidence.ok) {
      return { kind: "failed_safe", error: parsedEvidence.error };
    }
    evidenceLines = parsedEvidence.lines;
  }

  if (evidenceLines && evidenceLines.length !== parsedTrace.lines.length) {
    return {
      kind: "failed_safe",
      error: `Campaign evidence length (${evidenceLines.length}) does not match trace length (${parsedTrace.lines.length})`,
    };
  }

  const standalone = validateStandaloneEvidence(
    parsedTrace.lines,
    evidenceLines,
  );

  if (!options.authorize && evidenceLines !== undefined && !standalone.ok) {
    return { kind: "failed_safe", error: standalone.error };
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
    return { kind: "failed_safe", error: verification.error };
  }

  const actualRecordSha = campaignSha256Hex(
    serializeCampaignRecord(verification.record),
  );
  if (evidenceLines && parsedTrace.lines.length > 0) {
    const lastEvidence = evidenceLines[parsedTrace.lines.length - 1]!;
    if (lastEvidence.recordSha256 !== actualRecordSha) {
      return {
        kind: "failed_safe",
        error: "Campaign record commitment mismatch",
      };
    }
  }

  return {
    kind: "valid",
    state: verification.record.final,
    lines: [...parsedTrace.lines],
    recordSha256: actualRecordSha,
    hasEvidence: standalone.ok,
    ...(standalone.ok
      ? {}
      : {
          evidenceError:
            standalone.kind === "absent"
              ? "historical campaign evidence is absent"
              : `historical campaign evidence is inconsistent (${standalone.error})`,
        }),
  };
}

async function verifyOnDiskState(
  sessionRoot: string,
  options: CampaignVerificationOptions = {},
): Promise<OnDiskVerificationResult> {
  const snap = await readCampaignRawSnapshot(sessionRoot);
  return verifyCampaignRawSnapshot(snap, options);
}

async function anyCampaignArtifactExists(
  paths: readonly string[],
): Promise<boolean> {
  for (const target of paths) {
    try {
      await lstat(target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
  return false;
}

async function syncStatusIfNeeded(
  sessionRoot: string,
  statusPath: string,
  expectedStatus: ControllerStatus,
): Promise<void> {
  await assertConfinedPath(sessionRoot, statusPath, "Campaign status");
  const expectedText = `${JSON.stringify(expectedStatus, null, 2)}\n`;
  try {
    const stat = await lstat(statusPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Campaign status must be a regular file: ${statusPath}`);
    }
    const existingText = await readFile(statusPath, "utf8");
    if (existingText === expectedText) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  await writeFile(statusPath, expectedText, "utf8");
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
