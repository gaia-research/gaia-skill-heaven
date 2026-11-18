import { randomUUID } from "node:crypto";
import { appendFile, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AgentOps,
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  OperatorVerbs,
  campaignSha256Hex,
  canonicalCampaignJson,
  createCampaignOperatorEvent,
  formatCampaignEvidenceLine,
  formatCampaignTraceLine,
  immutableSnapshot,
  initialCampaignState,
  parseCampaignCharter,
  parseCampaignEvent,
  parseCampaignEvidenceLines,
  parseCampaignManifest,
  parseCampaignTraceLines,
  replayCampaign,
  serializeCampaignRecord,
  stepCampaign,
  toControllerStatus,
  verifyCampaignTraceLines,
  type CampaignCharter,
  type CampaignEvent,
  type CampaignManifest,
  type CampaignOperatorCommand,
  type CampaignQueueItem,
  type CampaignRecon,
  type CampaignState,
  type CampaignTraceEntry,
  type CampaignTraceRecord,
  type CampaignVerificationOptions,
  type ControllerStatus,
  type EngineCommand,
  type OperatorEventCapability,
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
export const CAMPAIGN_GOAL_FILE = "goal.json";
export const CAMPAIGN_RECON_FILE = "recon.json";
export const CAMPAIGN_CHARTER_FILE = "charter.json";
export const CAMPAIGN_OPERATOR_LOG_FILE = "operator.jsonl";
export const CAMPAIGN_GOAL_STAGE_FILE = ".goal.stage.json";
export const CAMPAIGN_RECON_STAGE_FILE = ".recon.stage.json";
export const CAMPAIGN_CHARTER_STAGE_FILE = ".charter.stage.json";

export type CampaignCharterArsenalItem = Readonly<{
  gapIndex: number;
  gap: string;
  cardRef: string;
  skillId: string;
  name: string;
  lane: string;
  invocation: string;
  convergenceOnly: boolean;
  phase: string;
}>;

export type CampaignCharterAuthoritySplit = Readonly<{
  automatic: readonly string[];
  humanOnly: readonly string[];
}>;

export type CampaignCharterTemplate = Readonly<{
  schema: typeof CAMPAIGN_SCHEMA_IDS.charter;
  revision: number;
  reconId: string;
  goal: string;
  phases: readonly string[];
  arsenal: readonly CampaignCharterArsenalItem[];
  allowedSkills: readonly string[];
  queue: readonly CampaignQueueItem[];
  authority: CampaignCharterAuthoritySplit;
  recoverLimit: number;
  reopenLimit: number;
  sessionRetention: number;
  checkpoints: readonly string[];
  stops: readonly string[];
  clauses: readonly string[];
  charterSha256: string;
  shortDigest: string;
}>;

export type PersistedCampaignCharterStrategy = Readonly<{
  schema: typeof CAMPAIGN_SCHEMA_IDS.charter;
  charter: CampaignCharter;
  charterTemplate: CampaignCharterTemplate;
  manifest: CampaignManifest;
  reconId: string;
  charterSha256: string;
  shortDigest: string;
}>;

export function computeCharterStrategySha256(
  strategy: PersistedCampaignCharterStrategy,
): string {
  return campaignSha256Hex(canonicalCampaignJson(strategy));
}

export function stripSelfCharterShaClause(
  revision: number,
  clauses: readonly string[],
): string[] {
  const prefix = `charter-sha256:r${revision}:`;
  return clauses.filter((c) => !c.startsWith(prefix));
}

export function computeCharterCoreSha256(strategy: {
  schema: string;
  reconId: string;
  charter: CampaignCharter;
  charterTemplate: CampaignCharterTemplate;
  manifest: CampaignManifest;
}): string {
  return campaignSha256Hex(
    canonicalCampaignJson({
      schema: strategy.schema,
      reconId: strategy.reconId,
      charter: {
        ...strategy.charter,
        clauses: stripSelfCharterShaClause(
          strategy.charter.revision,
          strategy.charter.clauses,
        ),
      },
      charterTemplate: {
        ...strategy.charterTemplate,
        clauses: stripSelfCharterShaClause(
          strategy.charter.revision,
          strategy.charterTemplate.clauses,
        ),
      },
      manifest: strategy.manifest,
    }),
  );
}

export function formatCharterSha256Clause(
  revision: number,
  sha256: string,
): string {
  return `charter-sha256:r${revision}:${sha256}`;
}

const CHARTER_SHA256_CLAUSE_RE = /^charter-sha256:r(\d+):([0-9a-f]{64})$/;

export type CampaignGoalContract = Readonly<{
  goal: string;
  workUniverse: readonly string[];
  repositories: readonly string[];
  acceptanceCommands: readonly string[];
  humanOnlyOperations: readonly string[];
  stopConditions: readonly string[];
}>;

export type PersistedReconArtifactStore = Readonly<{
  schema: typeof CAMPAIGN_SCHEMA_IDS.recon;
  reconId: string;
  gaps: readonly unknown[];
  findings: readonly string[];
  citations: readonly string[];
  records: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}>;

export function computeGoalContractSha256(
  contract: CampaignGoalContract,
): string {
  return campaignSha256Hex(canonicalCampaignJson(contract));
}

export function stripSelfReconShaCitation(
  reconId: string,
  citations: readonly string[],
): string[] {
  const prefix = `recon-sha256:${reconId}:`;
  return citations.filter((c) => !c.startsWith(prefix));
}

export function computeReconCoreSha256(record: {
  schema: string;
  reconId: string;
  gaps: readonly unknown[];
  findings: readonly string[];
  citations: readonly string[];
}): string {
  return campaignSha256Hex(
    canonicalCampaignJson({
      schema: record.schema,
      reconId: record.reconId,
      gaps: record.gaps,
      findings: record.findings,
      citations: stripSelfReconShaCitation(record.reconId, record.citations),
    }),
  );
}

export function formatReconSha256Citation(
  reconId: string,
  sha256: string,
): string {
  return `recon-sha256:${reconId}:${sha256}`;
}

const GOAL_CONTRACT_KEYS = [
  "goal",
  "workUniverse",
  "repositories",
  "acceptanceCommands",
  "humanOnlyOperations",
  "stopConditions",
] as const;

function parseNonEmptyTrimmedStringArray(arr: unknown): string[] | null {
  if (!Array.isArray(arr) || Object.getPrototypeOf(arr) !== Array.prototype) {
    return null;
  }
  if (Reflect.ownKeys(arr).length !== arr.length + 1) {
    return null;
  }
  if (arr.length === 0) {
    return null;
  }
  const result: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const d = Object.getOwnPropertyDescriptor(arr, String(i));
    if (
      !d ||
      !Object.hasOwn(d, "value") ||
      !d.enumerable ||
      typeof d.value !== "string"
    ) {
      return null;
    }
    const trimmed = d.value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    result.push(trimmed);
  }
  return result;
}

export function parseCampaignGoalContract(
  value: unknown,
): CampaignGoalContract | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const allowed = new Set<string>(GOAL_CONTRACT_KEYS);
    if (
      Reflect.ownKeys(value).some(
        (k) => typeof k !== "string" || !allowed.has(k),
      )
    ) {
      return null;
    }
    for (const key of GOAL_CONTRACT_KEYS) {
      const d = descriptors[key];
      if (!d || !Object.hasOwn(d, "value") || d.enumerable !== true) {
        return null;
      }
    }
    const goalRaw = descriptors.goal!.value;
    if (typeof goalRaw !== "string" || goalRaw.trim().length === 0) {
      return null;
    }
    const workUniverse = parseNonEmptyTrimmedStringArray(
      descriptors.workUniverse!.value,
    );
    const repositories = parseNonEmptyTrimmedStringArray(
      descriptors.repositories!.value,
    );
    const acceptanceCommands = parseNonEmptyTrimmedStringArray(
      descriptors.acceptanceCommands!.value,
    );
    const humanOnlyOperations = parseNonEmptyTrimmedStringArray(
      descriptors.humanOnlyOperations!.value,
    );
    const stopConditions = parseNonEmptyTrimmedStringArray(
      descriptors.stopConditions!.value,
    );
    if (
      !workUniverse ||
      !repositories ||
      !acceptanceCommands ||
      !humanOnlyOperations ||
      !stopConditions
    ) {
      return null;
    }
    return immutableSnapshot({
      goal: goalRaw.trim(),
      workUniverse,
      repositories,
      acceptanceCommands,
      humanOnlyOperations,
      stopConditions,
    });
  } catch {
    return null;
  }
}

export type CampaignStoreAppendResult = Readonly<{
  state: CampaignState;
  entry: CampaignTraceEntry;
  status: ControllerStatus;
}>;

export type CampaignStoreAppendOptions = Readonly<{
  goalContract?: CampaignGoalContract;
  reconRecord?: Readonly<Record<string, unknown>>;
  charterStrategy?: PersistedCampaignCharterStrategy;
  requireGoalContractOnOpen?: boolean;
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
  readonly goalPath: string;
  readonly reconPath: string;
  readonly charterPath: string;
  readonly operatorLogPath: string;
  readonly goalStagePath: string;
  readonly reconStagePath: string;
  readonly charterStagePath: string;

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
  #goalContract: CampaignGoalContract | null = null;
  #reconArtifact: PersistedReconArtifactStore | null = null;
  #charterStrategy: PersistedCampaignCharterStrategy | null = null;

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
    goalContract: CampaignGoalContract | null = null,
    reconArtifact: PersistedReconArtifactStore | null = null,
    charterStrategy: PersistedCampaignCharterStrategy | null = null,
  ) {
    this.sessionRoot = sessionRoot;
    this.campaignDir = path.join(sessionRoot, CAMPAIGN_DIR_NAME);
    this.tracePath = path.join(this.campaignDir, CAMPAIGN_TRACE_FILE);
    this.evidencePath = path.join(this.campaignDir, CAMPAIGN_EVIDENCE_FILE);
    this.statusPath = path.join(this.campaignDir, CAMPAIGN_STATUS_FILE);
    this.goalPath = path.join(this.campaignDir, CAMPAIGN_GOAL_FILE);
    this.reconPath = path.join(this.campaignDir, CAMPAIGN_RECON_FILE);
    this.charterPath = path.join(this.campaignDir, CAMPAIGN_CHARTER_FILE);
    this.operatorLogPath = path.join(this.campaignDir, CAMPAIGN_OPERATOR_LOG_FILE);
    this.goalStagePath = path.join(this.campaignDir, CAMPAIGN_GOAL_STAGE_FILE);
    this.reconStagePath = path.join(this.campaignDir, CAMPAIGN_RECON_STAGE_FILE);
    this.charterStagePath = path.join(this.campaignDir, CAMPAIGN_CHARTER_STAGE_FILE);
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
    this.#goalContract = goalContract;
    this.#reconArtifact = reconArtifact;
    this.#charterStrategy = charterStrategy;
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

  async saveGoalContract(
    contract: CampaignGoalContract,
  ): Promise<CampaignGoalContract> {
    const parsed = parseCampaignGoalContract(contract);
    if (!parsed) {
      throw new Error("Invalid campaign goal contract.");
    }
    await ensureConfinedCampaignDir(this.sessionRoot, this.campaignDir);
    await assertConfinedPath(
      this.sessionRoot,
      this.goalPath,
      "Campaign goal contract",
    );
    const tmpPath = path.join(
      this.campaignDir,
      `.${CAMPAIGN_GOAL_FILE}.tmp-${process.pid}-${randomUUID()}`,
    );
    let renamed = false;
    try {
      await writeFile(tmpPath, `${JSON.stringify(parsed, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      try {
        const targetStat = await lstat(this.goalPath);
        if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
          throw new Error(
            `Campaign goal contract must be a regular file: ${this.goalPath}`,
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      await rename(tmpPath, this.goalPath);
      renamed = true;
    } finally {
      if (!renamed) {
        await rm(tmpPath, { force: true }).catch(() => {});
      }
    }
    this.#goalContract = parsed;
    return parsed;
  }

  async loadGoalContract(): Promise<CampaignGoalContract | null> {
    if (this.#corrupted) {
      throw new Error(
        this.#error ?? "Campaign store is corrupted (FAILED_SAFE).",
      );
    }
    if (!this.#hasTrace) {
      return null;
    }
    const disk = await verifyOnDiskState(this.sessionRoot, {
      authorize: this.#options.authorize,
    });
    if (disk.kind === "failed_safe") {
      this.#corrupted = true;
      this.#error = disk.error;
      throw new Error(disk.error);
    }
    if (disk.kind === "absent") {
      this.#goalContract = null;
      this.#reconArtifact = null;
      return null;
    }
    this.#goalContract = disk.goalContract;
    this.#reconArtifact = disk.reconArtifact;
    return disk.goalContract;
  }

  async saveReconArtifact<T>(record: T): Promise<T> {
    const serialized = JSON.stringify(record, null, 2);
    if (serialized === undefined) {
      throw new Error("Campaign recon artifact is not JSON-serializable.");
    }
    await ensureConfinedCampaignDir(this.sessionRoot, this.campaignDir);
    await assertConfinedPath(
      this.sessionRoot,
      this.reconPath,
      "Campaign recon artifact",
    );
    const tmpPath = path.join(
      this.campaignDir,
      `.${CAMPAIGN_RECON_FILE}.tmp-${process.pid}-${randomUUID()}`,
    );
    let renamed = false;
    try {
      await writeFile(tmpPath, `${serialized}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      try {
        const targetStat = await lstat(this.reconPath);
        if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
          throw new Error(
            `Campaign recon artifact must be a regular file: ${this.reconPath}`,
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      await rename(tmpPath, this.reconPath);
      renamed = true;
    } finally {
      if (!renamed) {
        await rm(tmpPath, { force: true }).catch(() => {});
      }
    }
    const parsedEnvelope = parsePersistedReconArtifactStore(record);
    if (parsedEnvelope) {
      this.#reconArtifact = parsedEnvelope;
    }
    return record;
  }

  async loadReconArtifact(
    reconId?: string,
  ): Promise<PersistedReconArtifactStore | Readonly<Record<string, unknown>> | null> {
    if (this.#corrupted) {
      throw new Error(
        this.#error ?? "Campaign store is corrupted (FAILED_SAFE).",
      );
    }
    if (!this.#hasTrace) {
      return null;
    }
    const disk = await verifyOnDiskState(this.sessionRoot, {
      authorize: this.#options.authorize,
    });
    if (disk.kind === "failed_safe") {
      this.#corrupted = true;
      this.#error = disk.error;
      throw new Error(disk.error);
    }
    if (disk.kind === "absent") {
      this.#goalContract = null;
      this.#reconArtifact = null;
      return null;
    }
    this.#goalContract = disk.goalContract;
    this.#reconArtifact = disk.reconArtifact;
    if (!disk.reconArtifact) {
      return null;
    }
    if (reconId !== undefined) {
      return disk.reconArtifact.records[reconId] ?? null;
    }
    return disk.reconArtifact;
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

  async openCampaign(
    goalContract: CampaignGoalContract,
  ): Promise<CampaignStoreAppendResult> {
    const validatedGoal = parseCampaignGoalContract(goalContract);
    if (!validatedGoal) {
      throw new Error("Invalid campaign goal contract.");
    }
    const goalSha256 = computeGoalContractSha256(validatedGoal);
    return this.append(
      { channel: "agent", op: AgentOps.open, goalSha256 },
      { goalContract: validatedGoal, requireGoalContractOnOpen: true },
    );
  }

  async appendRecon(
    reconRecord: Readonly<Record<string, unknown>>,
    traceRecon: CampaignRecon,
  ): Promise<CampaignStoreAppendResult> {
    return this.append(
      { channel: "agent", op: AgentOps.recon, recon: traceRecon },
      { reconRecord },
    );
  }

  async proposeCharter(
    charter: CampaignCharter,
    charterStrategy: PersistedCampaignCharterStrategy,
  ): Promise<CampaignStoreAppendResult> {
    return this.append(
      { channel: "agent", op: AgentOps.propose, charter },
      { charterStrategy },
    );
  }

  async amendCharter(
    capability: OperatorEventCapability,
    command: Extract<CampaignOperatorCommand, { op: typeof OperatorVerbs.amend }>,
    charterStrategy: PersistedCampaignCharterStrategy,
  ): Promise<CampaignStoreAppendResult> {
    const event = createCampaignOperatorEvent(capability, command);
    return this.append(event, { charterStrategy });
  }

  async loadCharterStrategy(): Promise<PersistedCampaignCharterStrategy | null> {
    if (this.#corrupted) {
      throw new Error(
        this.#error ?? "Campaign store is corrupted (FAILED_SAFE).",
      );
    }
    if (!this.#hasTrace) {
      return null;
    }
    const disk = await verifyOnDiskState(this.sessionRoot, {
      authorize: this.#options.authorize,
    });
    if (disk.kind === "failed_safe") {
      this.#corrupted = true;
      this.#error = disk.error;
      throw new Error(disk.error);
    }
    if (disk.kind === "absent") {
      this.#goalContract = null;
      this.#reconArtifact = null;
      this.#charterStrategy = null;
      return null;
    }
    this.#goalContract = disk.goalContract;
    this.#reconArtifact = disk.reconArtifact;
    this.#charterStrategy = disk.charterStrategy;
    return disk.charterStrategy;
  }

  async appendOperatorLog(entry: Readonly<Record<string, unknown>>): Promise<void> {
    const run = this.#appendQueue.then(() =>
      this.#appendOperatorLogSerialized(entry),
    );
    this.#appendQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #appendOperatorLogSerialized(
    entry: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await ensureConfinedCampaignDir(this.sessionRoot, this.campaignDir);
    await assertConfinedPath(
      this.sessionRoot,
      this.operatorLogPath,
      "Campaign operator log",
    );
    await assertRegularOrMissingTarget(
      this.sessionRoot,
      this.operatorLogPath,
      "Campaign operator log",
    );
    const claim = await acquireCampaignStoreClaimForRoot(this.sessionRoot);
    if (claim.status !== "acquired") {
      throw new Error(
        `Refusing to append operator log: campaign store ownership claim is ${claim.status}`,
      );
    }
    try {
      await assertConfinedPath(
        this.sessionRoot,
        this.operatorLogPath,
        "Campaign operator log",
      );
      await assertRegularOrMissingTarget(
        this.sessionRoot,
        this.operatorLogPath,
        "Campaign operator log",
      );
      await appendFile(this.operatorLogPath, `${JSON.stringify(entry)}\n`, {
        encoding: "utf8",
        flag: "a",
      });
    } finally {
      await claim.release();
    }
  }

  async append(
    event: CampaignEvent | unknown,
    options?: CampaignStoreAppendOptions,
  ): Promise<CampaignStoreAppendResult> {
    const run = this.#appendQueue.then(() =>
      this.#appendSerialized(event, options),
    );
    this.#appendQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #appendSerialized(
    event: CampaignEvent | unknown,
    options?: CampaignStoreAppendOptions,
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

      let validatedGoal: CampaignGoalContract | undefined;
      let validatedReconRecord: ValidatedReconRecord | undefined;
      let validatedCharterStrategy: PersistedCampaignCharterStrategy | undefined;
      let artifactSha256: string | undefined;

      if (options?.goalContract !== undefined && step.entry.accepted) {
        const parsedGoal = parseCampaignGoalContract(options.goalContract);
        if (!parsedGoal) {
          throw new Error("Invalid campaign goal contract.");
        }
        validatedGoal = parsedGoal;
        artifactSha256 = computeGoalContractSha256(parsedGoal);
      }

      if (options?.reconRecord !== undefined && step.entry.accepted) {
        const parsedRecon = parseSingleReconRecord(options.reconRecord);
        if (!parsedRecon) {
          throw new Error("Invalid campaign recon record.");
        }
        validatedReconRecord = parsedRecon;
        artifactSha256 = computeReconCoreSha256(parsedRecon);
      }

      if (options?.charterStrategy !== undefined && step.entry.accepted) {
        const parsedStrategy = parsePersistedCharterStrategy(
          options.charterStrategy,
        );
        if (!parsedStrategy) {
          throw new Error("Invalid campaign charter strategy.");
        }
        validatedCharterStrategy = parsedStrategy;
        artifactSha256 = computeCharterCoreSha256(parsedStrategy);
      }

      const authorizedPrivileged =
        (step.entry.channel === "operator" || step.entry.channel === "engine") &&
        step.entry.accepted === true;
      const evidenceLine: PersistedCampaignEvidenceLine = {
        seq,
        authorizedPrivileged,
        eventSha256: campaignSha256Hex(canonicalCampaignJson(descriptor)),
        recordSha256: campaignSha256Hex(serializeCampaignRecord(nextRecord)),
        ...(artifactSha256 !== undefined ? { artifactSha256 } : {}),
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

      let nextReconEnvelope: PersistedReconArtifactStore | undefined;

      if (validatedGoal !== undefined) {
        await assertRegularOrMissingTarget(
          this.sessionRoot,
          this.goalPath,
          "Campaign goal contract",
        );
        await writeAtomicJsonArtifact(
          this.sessionRoot,
          this.campaignDir,
          this.goalStagePath,
          `.${CAMPAIGN_GOAL_STAGE_FILE}`,
          "Campaign goal stage",
          `${JSON.stringify(validatedGoal, null, 2)}\n`,
        );
      }

      if (validatedReconRecord !== undefined) {
        const priorRecon = await capturePriorArtifactBytes(
          this.sessionRoot,
          this.reconPath,
          "Campaign recon artifact",
        );
        const existingRecords = extractExistingReconRecords(priorRecon.raw);
        const nextRecords: Record<string, Readonly<Record<string, unknown>>> = {
          ...existingRecords,
          [validatedReconRecord.reconId]: validatedReconRecord,
        };
        nextReconEnvelope = {
          schema: CAMPAIGN_SCHEMA_IDS.recon,
          reconId: validatedReconRecord.reconId,
          gaps: validatedReconRecord.gaps,
          findings: validatedReconRecord.findings,
          citations: validatedReconRecord.citations,
          records: nextRecords,
        };
        try {
          await writeAtomicJsonArtifact(
            this.sessionRoot,
            this.campaignDir,
            this.reconStagePath,
            `.${CAMPAIGN_RECON_STAGE_FILE}`,
            "Campaign recon stage",
            `${JSON.stringify(nextReconEnvelope, null, 2)}\n`,
          );
        } catch (error) {
          if (validatedGoal !== undefined) {
            await rm(this.goalStagePath, { force: true }).catch(() => {});
          }
          throw error;
        }
      }

      if (validatedCharterStrategy !== undefined) {
        await assertRegularOrMissingTarget(
          this.sessionRoot,
          this.charterPath,
          "Campaign charter strategy",
        );
        await writeAtomicJsonArtifact(
          this.sessionRoot,
          this.campaignDir,
          this.charterStagePath,
          `.${CAMPAIGN_CHARTER_STAGE_FILE}`,
          "Campaign charter stage",
          `${JSON.stringify(validatedCharterStrategy, null, 2)}\n`,
        );
      }

      let traceMutated = false;
      try {
        await appendFile(
          this.tracePath,
          `${formatCampaignTraceLine(line)}\n`,
          { encoding: "utf8", flag: "a" },
        );
        traceMutated = true;
        await appendFile(
          this.evidencePath,
          `${formatCampaignEvidenceLine(evidenceLine)}\n`,
          { encoding: "utf8", flag: "a" },
        );
        if (validatedGoal !== undefined) {
          await rename(this.goalStagePath, this.goalPath);
        }
        if (validatedReconRecord !== undefined) {
          await rename(this.reconStagePath, this.reconPath);
        }
        if (validatedCharterStrategy !== undefined) {
          await rename(this.charterStagePath, this.charterPath);
        }
        await writeFile(
          this.statusPath,
          `${JSON.stringify(status, null, 2)}\n`,
          "utf8",
        );
      } catch (error) {
        if (!traceMutated) {
          if (validatedGoal !== undefined) {
            await rm(this.goalStagePath, { force: true }).catch(() => {});
          }
          if (validatedReconRecord !== undefined) {
            await rm(this.reconStagePath, { force: true }).catch(() => {});
          }
          if (validatedCharterStrategy !== undefined) {
            await rm(this.charterStagePath, { force: true }).catch(() => {});
          }
          throw error;
        }
        this.#corrupted = true;
        this.#error = `Partial write failure during campaign append: ${error instanceof Error ? error.message : String(error)}`;
        throw error;
      }

      if (validatedGoal !== undefined) {
        this.#goalContract = validatedGoal;
      }
      if (nextReconEnvelope !== undefined) {
        this.#reconArtifact = nextReconEnvelope;
      }
      if (validatedCharterStrategy !== undefined) {
        this.#charterStrategy = validatedCharterStrategy;
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
      for (const target of [
        this.tracePath,
        this.evidencePath,
        this.statusPath,
        this.goalPath,
        this.reconPath,
        this.charterPath,
      ]) {
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
      await rm(this.goalStagePath, { force: true }).catch(() => {});
      await rm(this.reconStagePath, { force: true }).catch(() => {});
      await rm(this.charterStagePath, { force: true }).catch(() => {});
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
    await reconcileStagedArtifacts(
      this.sessionRoot,
      this.campaignDir,
      disk.promoteGoalStage,
      disk.promoteReconStage,
      disk.promoteCharterStage,
      disk.recoveredTrailingEvidenceLine,
    );
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
    goalContract: CampaignGoalContract | null = null,
    reconArtifact: PersistedReconArtifactStore | null = null,
    charterStrategy: PersistedCampaignCharterStrategy | null = null,
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
      goalContract,
      reconArtifact,
      charterStrategy,
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
  const campaignDir = path.join(sessionRoot, CAMPAIGN_DIR_NAME);
  if (verified.kind === "absent") {
    if (refreshStatus) {
      await rm(path.join(campaignDir, CAMPAIGN_GOAL_STAGE_FILE), {
        force: true,
      }).catch(() => {});
      await rm(path.join(campaignDir, CAMPAIGN_RECON_STAGE_FILE), {
        force: true,
      }).catch(() => {});
      await rm(path.join(campaignDir, CAMPAIGN_CHARTER_STAGE_FILE), {
        force: true,
      }).catch(() => {});
    }
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
    await reconcileStagedArtifacts(
      sessionRoot,
      campaignDir,
      verified.promoteGoalStage,
      verified.promoteReconStage,
      verified.promoteCharterStage,
      verified.recoveredTrailingEvidenceLine,
    );
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
    verified.goalContract,
    verified.reconArtifact,
    verified.charterStrategy,
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
      goalContract: CampaignGoalContract | null;
      reconArtifact: PersistedReconArtifactStore | null;
      charterStrategy: PersistedCampaignCharterStrategy | null;
      promoteGoalStage: boolean;
      promoteReconStage: boolean;
      promoteCharterStage: boolean;
      recoveredTrailingEvidenceLine?: PersistedCampaignEvidenceLine;
    };

type FileMetaSnapshot = {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
};

type OptionalArtifactSnapshot =
  | { exists: false }
  | { exists: true; nonRegular: true }
  | { exists: true; nonRegular: false; stat: FileMetaSnapshot; raw: string };

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
      goal: OptionalArtifactSnapshot;
      recon: OptionalArtifactSnapshot;
      charter: OptionalArtifactSnapshot;
      goalStage: OptionalArtifactSnapshot;
      reconStage: OptionalArtifactSnapshot;
      charterStage: OptionalArtifactSnapshot;
    }
  | {
      traceExists: true;
      traceStat: FileMetaSnapshot;
      traceRaw: string;
      evidenceExists: true;
      evidenceNonRegular: true;
      goal: OptionalArtifactSnapshot;
      recon: OptionalArtifactSnapshot;
      charter: OptionalArtifactSnapshot;
      goalStage: OptionalArtifactSnapshot;
      reconStage: OptionalArtifactSnapshot;
      charterStage: OptionalArtifactSnapshot;
    }
  | {
      traceExists: true;
      traceStat: FileMetaSnapshot;
      traceRaw: string;
      evidenceExists: true;
      evidenceNonRegular: false;
      evidenceStat: FileMetaSnapshot;
      evidenceRaw: string;
      goal: OptionalArtifactSnapshot;
      recon: OptionalArtifactSnapshot;
      charter: OptionalArtifactSnapshot;
      goalStage: OptionalArtifactSnapshot;
      reconStage: OptionalArtifactSnapshot;
      charterStage: OptionalArtifactSnapshot;
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

function optionalArtifactSnapshotsEqual(
  a: OptionalArtifactSnapshot,
  b: OptionalArtifactSnapshot,
): boolean {
  if (!a.exists || !b.exists) {
    return a.exists === b.exists;
  }
  if (a.nonRegular || b.nonRegular) {
    return a.nonRegular === b.nonRegular;
  }
  return metaSnapshotsEqual(a.stat, b.stat) && a.raw === b.raw;
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
  if (
    !optionalArtifactSnapshotsEqual(a.goal, b.goal) ||
    !optionalArtifactSnapshotsEqual(a.recon, b.recon) ||
    !optionalArtifactSnapshotsEqual(a.charter, b.charter) ||
    !optionalArtifactSnapshotsEqual(a.goalStage, b.goalStage) ||
    !optionalArtifactSnapshotsEqual(a.reconStage, b.reconStage) ||
    !optionalArtifactSnapshotsEqual(a.charterStage, b.charterStage)
  ) {
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

async function readOptionalArtifactSnapshot(
  sessionRoot: string,
  targetPath: string,
  label: string,
): Promise<OptionalArtifactSnapshot> {
  let stat;
  try {
    stat = await lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false };
    }
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return { exists: true, nonRegular: true };
  }
  await assertConfinedPath(sessionRoot, targetPath, label);
  const raw = await readFile(targetPath, "utf8");
  return {
    exists: true,
    nonRegular: false,
    stat: metaSnapshot(stat),
    raw,
  };
}

async function readCampaignRawSnapshot(
  sessionRoot: string,
): Promise<CampaignRawSnapshot> {
  const campaignDir = path.join(sessionRoot, CAMPAIGN_DIR_NAME);
  const tracePath = path.join(campaignDir, CAMPAIGN_TRACE_FILE);
  const evidencePath = path.join(campaignDir, CAMPAIGN_EVIDENCE_FILE);
  const statusPath = path.join(campaignDir, CAMPAIGN_STATUS_FILE);
  const goalPath = path.join(campaignDir, CAMPAIGN_GOAL_FILE);
  const reconPath = path.join(campaignDir, CAMPAIGN_RECON_FILE);
  const charterPath = path.join(campaignDir, CAMPAIGN_CHARTER_FILE);
  const goalStagePath = path.join(campaignDir, CAMPAIGN_GOAL_STAGE_FILE);
  const reconStagePath = path.join(campaignDir, CAMPAIGN_RECON_STAGE_FILE);
  const charterStagePath = path.join(campaignDir, CAMPAIGN_CHARTER_STAGE_FILE);

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
          goalPath,
          reconPath,
          charterPath,
        ]),
      };
    }
    throw error;
  }

  if (traceStat.isSymbolicLink() || !traceStat.isFile()) {
    throw new Error(`Campaign trace must be a regular file: ${tracePath}`);
  }

  const traceRaw = await readFile(tracePath, "utf8");
  const goal = await readOptionalArtifactSnapshot(
    sessionRoot,
    goalPath,
    "Campaign goal contract",
  );
  const recon = await readOptionalArtifactSnapshot(
    sessionRoot,
    reconPath,
    "Campaign recon artifact",
  );
  const charter = await readOptionalArtifactSnapshot(
    sessionRoot,
    charterPath,
    "Campaign charter strategy",
  );
  const goalStage = await readOptionalArtifactSnapshot(
    sessionRoot,
    goalStagePath,
    "Campaign goal stage",
  );
  const reconStage = await readOptionalArtifactSnapshot(
    sessionRoot,
    reconStagePath,
    "Campaign recon stage",
  );
  const charterStage = await readOptionalArtifactSnapshot(
    sessionRoot,
    charterStagePath,
    "Campaign charter stage",
  );

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
        goal,
        recon,
        charter,
        goalStage,
        reconStage,
        charterStage,
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
      goal,
      recon,
      charter,
      goalStage,
      reconStage,
      charterStage,
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
    goal,
    recon,
    charter,
    goalStage,
    reconStage,
    charterStage,
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

function tryRecoverPendingStagedEvidenceLine(
  snap: Extract<CampaignRawSnapshot, { traceExists: true }>,
  parsedLines: readonly PersistedCampaignTraceLine[],
  existingEvidenceLines: readonly PersistedCampaignEvidenceLine[] | undefined,
): PersistedCampaignEvidenceLine | undefined {
  if (parsedLines.length === 0) {
    return undefined;
  }
  const seq = parsedLines.length - 1;
  if (seq === 0) {
    if (existingEvidenceLines !== undefined && existingEvidenceLines.length > 0) {
      return undefined;
    }
  } else {
    if (
      existingEvidenceLines === undefined ||
      existingEvidenceLines.length !== seq
    ) {
      return undefined;
    }
    const prefixStandalone = validateStandaloneEvidence(
      parsedLines.slice(0, seq),
      existingEvidenceLines,
    );
    if (!prefixStandalone.ok) {
      return undefined;
    }
  }

  const lastLine = parsedLines[seq]!;
  if (
    lastLine.seq !== seq ||
    lastLine.entry.accepted !== true ||
    lastLine.entry.channel !== "agent" ||
    lastLine.event?.channel !== "agent"
  ) {
    return undefined;
  }

  let artifactSha256: string | undefined;
  if (lastLine.event.op === AgentOps.open) {
    if (
      typeof lastLine.event.goalSha256 !== "string" ||
      lastLine.event.goalSha256.length === 0 ||
      snap.goal.exists ||
      !snap.goalStage.exists ||
      snap.goalStage.nonRegular
    ) {
      return undefined;
    }
    const checkedStage = parseGoalSnapshotForCommitments(
      snap.goalStage,
      lastLine.event.goalSha256,
      undefined,
    );
    if (!checkedStage.ok) {
      return undefined;
    }
    artifactSha256 = lastLine.event.goalSha256;
  } else if (lastLine.event.op === AgentOps.recon) {
    if (!snap.reconStage.exists || snap.reconStage.nonRegular) {
      return undefined;
    }
    let parsedStageJson: unknown;
    try {
      parsedStageJson = JSON.parse(snap.reconStage.raw) as unknown;
    } catch {
      return undefined;
    }
    const parsedStageEnvelope =
      parsePersistedReconArtifactStore(parsedStageJson);
    if (!parsedStageEnvelope) {
      return undefined;
    }
    if (
      canonicalCampaignJson(parsedStageEnvelope.citations) !==
      canonicalCampaignJson(lastLine.event.recon.citations)
    ) {
      return undefined;
    }
    const selfShaPrefix = `recon-sha256:${parsedStageEnvelope.reconId}:`;
    const selfShaCitations = lastLine.event.recon.citations.filter((c) =>
      c.startsWith(selfShaPrefix),
    );
    const stageSha = computeReconCoreSha256(parsedStageEnvelope);
    if (
      selfShaCitations.length !== 1 ||
      selfShaCitations[0] !==
        formatReconSha256Citation(parsedStageEnvelope.reconId, stageSha)
    ) {
      return undefined;
    }
    artifactSha256 = stageSha;
  } else if (lastLine.event.op === AgentOps.propose) {
    if (
      snap.charter.exists ||
      !snap.charterStage.exists ||
      snap.charterStage.nonRegular
    ) {
      return undefined;
    }
    let parsedStageJson: unknown;
    try {
      parsedStageJson = JSON.parse(snap.charterStage.raw) as unknown;
    } catch {
      return undefined;
    }
    const parsedStage = parsePersistedCharterStrategy(parsedStageJson);
    if (!parsedStage) {
      return undefined;
    }
    if (
      canonicalCampaignJson(parsedStage.charter) !==
      canonicalCampaignJson(lastLine.event.charter)
    ) {
      return undefined;
    }
    const selfShaPrefix = `charter-sha256:r${parsedStage.charter.revision}:`;
    const selfShaClauses = lastLine.event.charter.clauses.filter((c) =>
      c.startsWith(selfShaPrefix),
    );
    const stageSha = computeCharterCoreSha256(parsedStage);
    if (
      selfShaClauses.length !== 1 ||
      selfShaClauses[0] !==
        formatCharterSha256Clause(parsedStage.charter.revision, stageSha)
    ) {
      return undefined;
    }
    artifactSha256 = stageSha;
  } else {
    return undefined;
  }

  const sidecarAuthorize = (
    event: CampaignOperatorCommand | EngineCommand,
    index: number,
  ): boolean => {
    const ev = existingEvidenceLines?.[index];
    if (!ev || ev.seq !== index || !ev.authorizedPrivileged) return false;
    return ev.eventSha256 === campaignSha256Hex(canonicalCampaignJson(event));
  };

  const verification = verifyCampaignTraceLines(parsedLines, {
    authorize: sidecarAuthorize,
  });
  if (!verification.valid) {
    return undefined;
  }

  return Object.freeze({
    seq,
    authorizedPrivileged: false,
    eventSha256: campaignSha256Hex(canonicalCampaignJson(lastLine.event)),
    recordSha256: campaignSha256Hex(
      serializeCampaignRecord(verification.record),
    ),
    artifactSha256,
  });
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

  const recoveredTrailingEvidenceLine = tryRecoverPendingStagedEvidenceLine(
    snap,
    parsedTrace.lines,
    evidenceLines,
  );
  if (recoveredTrailingEvidenceLine !== undefined) {
    evidenceLines = [...(evidenceLines ?? []), recoveredTrailingEvidenceLine];
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

  const artifactCheck = verifyBoundArtifacts(
    parsedTrace.lines,
    evidenceLines,
    snap.goal,
    snap.recon,
    snap.charter,
    snap.goalStage,
    snap.reconStage,
    snap.charterStage,
  );
  if (!artifactCheck.ok) {
    return { kind: "failed_safe", error: artifactCheck.error };
  }
  if (
    recoveredTrailingEvidenceLine !== undefined &&
    !artifactCheck.promoteGoalStage &&
    !artifactCheck.promoteReconStage &&
    !artifactCheck.promoteCharterStage
  ) {
    return {
      kind: "failed_safe",
      error: "Campaign trailing evidence recovery requires an unpromoted stage artifact",
    };
  }

  return {
    kind: "valid",
    state: verification.record.final,
    lines: [...parsedTrace.lines],
    recordSha256: actualRecordSha,
    hasEvidence: standalone.ok,
    goalContract: artifactCheck.goalContract,
    reconArtifact: artifactCheck.reconArtifact,
    charterStrategy: artifactCheck.charterStrategy,
    promoteGoalStage: artifactCheck.promoteGoalStage,
    promoteReconStage: artifactCheck.promoteReconStage,
    promoteCharterStage: artifactCheck.promoteCharterStage,
    ...(recoveredTrailingEvidenceLine !== undefined
      ? { recoveredTrailingEvidenceLine }
      : {}),
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

type ValidatedReconRecord = Readonly<{
  schema: typeof CAMPAIGN_SCHEMA_IDS.recon;
  reconId: string;
  gaps: readonly unknown[];
  findings: readonly string[];
  citations: readonly string[];
}> &
  Readonly<Record<string, unknown>>;

function isPlainRecordObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isStringArray(v: unknown): v is readonly string[] {
  return Array.isArray(v) && v.every((item) => typeof item === "string");
}

function parseSingleReconRecord(v: unknown): ValidatedReconRecord | null {
  if (!isPlainRecordObject(v)) return null;
  if (
    v.schema !== CAMPAIGN_SCHEMA_IDS.recon ||
    typeof v.reconId !== "string" ||
    v.reconId.length === 0 ||
    !Array.isArray(v.gaps) ||
    !isStringArray(v.findings) ||
    !isStringArray(v.citations)
  ) {
    return null;
  }
  return v as ValidatedReconRecord;
}

function parsePersistedReconArtifactStore(
  v: unknown,
): PersistedReconArtifactStore | null {
  if (!isPlainRecordObject(v)) return null;
  if (
    v.schema !== CAMPAIGN_SCHEMA_IDS.recon ||
    typeof v.reconId !== "string" ||
    v.reconId.length === 0 ||
    !Array.isArray(v.gaps) ||
    !isStringArray(v.findings) ||
    !isStringArray(v.citations) ||
    !isPlainRecordObject(v.records)
  ) {
    return null;
  }
  const records: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const [key, entry] of Object.entries(v.records)) {
    const parsedEntry = parseSingleReconRecord(entry);
    if (!parsedEntry || parsedEntry.reconId !== key) {
      return null;
    }
    records[key] = parsedEntry;
  }
  return {
    schema: CAMPAIGN_SCHEMA_IDS.recon,
    reconId: v.reconId,
    gaps: v.gaps,
    findings: v.findings,
    citations: v.citations,
    records,
  };
}

function extractExistingReconRecords(
  raw: string | null,
): Record<string, Readonly<Record<string, unknown>>> {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    const store = parsePersistedReconArtifactStore(parsed);
    if (store) {
      return { ...store.records };
    }
    const single = parseSingleReconRecord(parsed);
    if (single) {
      return { [single.reconId]: single };
    }
  } catch {
    // Ignore unparseable prior file; caller will overwrite or fail verification on load.
  }
  return {};
}

const RECON_SHA256_CITATION_RE = /^recon-sha256:([^:]+):([0-9a-f]{64})$/;

function parseGoalSnapshotForCommitments(
  snap: OptionalArtifactSnapshot,
  openEventGoalSha: string | undefined,
  openEvidenceGoalSha: string | undefined,
): { ok: true; goalContract: CampaignGoalContract } | { ok: false; error: string } {
  if (!snap.exists || snap.nonRegular) {
    return {
      ok: false,
      error: "Campaign goal contract is missing or invalid",
    };
  }
  let parsedGoalJson: unknown;
  try {
    parsedGoalJson = JSON.parse(snap.raw) as unknown;
  } catch {
    return {
      ok: false,
      error: "Campaign goal contract shape is invalid",
    };
  }
  const parsedGoal = parseCampaignGoalContract(parsedGoalJson);
  if (!parsedGoal) {
    return {
      ok: false,
      error: "Campaign goal contract shape is invalid",
    };
  }
  const actualSha = computeGoalContractSha256(parsedGoal);
  if (
    (openEventGoalSha === undefined && openEvidenceGoalSha === undefined) ||
    (openEventGoalSha !== undefined && actualSha !== openEventGoalSha) ||
    (openEvidenceGoalSha !== undefined && actualSha !== openEvidenceGoalSha)
  ) {
    return {
      ok: false,
      error: "Campaign goal contract commitment mismatch",
    };
  }
  return { ok: true, goalContract: parsedGoal };
}

function validateReconEnvelopeSnapshot(
  reconSnap: OptionalArtifactSnapshot,
  committedById: ReadonlyMap<string, string>,
  traceCitationsById: ReadonlyMap<string, readonly string[]>,
  evidenceReconHashes: readonly { seq: number; sha256: string }[],
  reconLines: readonly PersistedCampaignTraceLine[],
  evidenceLines: readonly PersistedCampaignEvidenceLine[] | undefined,
  latestCommittedReconId: string | undefined,
  latestCommittedReconSha256: string | undefined,
):
  | { ok: true; reconArtifact: PersistedReconArtifactStore }
  | { ok: false; error: string } {
  if (!reconSnap.exists || reconSnap.nonRegular) {
    return {
      ok: false,
      error: "Campaign recon artifact is missing or invalid",
    };
  }
  let parsedReconJson: unknown;
  try {
    parsedReconJson = JSON.parse(reconSnap.raw) as unknown;
  } catch {
    return {
      ok: false,
      error: "Campaign recon artifact shape is invalid",
    };
  }
  const parsedEnvelope = parsePersistedReconArtifactStore(parsedReconJson);
  if (!parsedEnvelope) {
    return {
      ok: false,
      error: "Campaign recon artifact shape is invalid",
    };
  }

  for (const [reconId, expectedSha256] of committedById.entries()) {
    const rec = parsedEnvelope.records[reconId];
    const validated = rec ? parseSingleReconRecord(rec) : null;
    if (!validated) {
      return {
        ok: false,
        error: `Campaign recon artifact commitment mismatch for ${reconId}`,
      };
    }
    const selfShaPrefix = `recon-sha256:${reconId}:`;
    const selfShaCitations = validated.citations.filter((c) =>
      c.startsWith(selfShaPrefix),
    );
    if (
      selfShaCitations.length !== 1 ||
      !validated.citations.includes(
        formatReconSha256Citation(reconId, expectedSha256),
      ) ||
      computeReconCoreSha256(validated) !== expectedSha256
    ) {
      return {
        ok: false,
        error: `Campaign recon artifact commitment mismatch for ${reconId}`,
      };
    }
    const expectedTraceCitations = traceCitationsById.get(reconId);
    if (
      expectedTraceCitations !== undefined &&
      canonicalCampaignJson(validated.citations) !==
        canonicalCampaignJson(expectedTraceCitations)
    ) {
      return {
        ok: false,
        error: `Campaign recon citations mismatch for ${reconId}`,
      };
    }
  }

  const recordHashes = new Set<string>();
  for (const key of Object.keys(parsedEnvelope.records)) {
    if (!committedById.has(key)) {
      return {
        ok: false,
        error: `Uncommitted recon record ${key} in recon.json`,
      };
    }
    const validated = parseSingleReconRecord(parsedEnvelope.records[key]);
    if (validated) {
      recordHashes.add(computeReconCoreSha256(validated));
    }
  }

  for (const item of evidenceReconHashes) {
    if (!recordHashes.has(item.sha256)) {
      return {
        ok: false,
        error: "Campaign recon evidence commitment mismatch",
      };
    }
  }

  const latestReconLine = reconLines.at(-1);
  const latestEvSha = latestReconLine
    ? evidenceLines?.[latestReconLine.seq]?.artifactSha256
    : undefined;
  const topRecord = parsedEnvelope.records[parsedEnvelope.reconId];
  const validatedTop = topRecord ? parseSingleReconRecord(topRecord) : null;
  if (
    !validatedTop ||
    canonicalCampaignJson({
      schema: parsedEnvelope.schema,
      reconId: parsedEnvelope.reconId,
      gaps: parsedEnvelope.gaps,
      findings: parsedEnvelope.findings,
      citations: parsedEnvelope.citations,
    }) !==
      canonicalCampaignJson({
        schema: validatedTop.schema,
        reconId: validatedTop.reconId,
        gaps: validatedTop.gaps,
        findings: validatedTop.findings,
        citations: validatedTop.citations,
      })
  ) {
    return {
      ok: false,
      error: "Campaign recon top-level envelope does not match latest record",
    };
  }
  if (
    latestCommittedReconId !== undefined &&
    parsedEnvelope.reconId !== latestCommittedReconId
  ) {
    return {
      ok: false,
      error: "Campaign recon top-level envelope does not match latest trace recon record",
    };
  }
  if (
    latestCommittedReconSha256 !== undefined &&
    computeReconCoreSha256(validatedTop) !== latestCommittedReconSha256
  ) {
    return {
      ok: false,
      error: "Campaign recon top-level envelope does not match latest trace recon commitment",
    };
  }
  if (
    latestReconLine?.event?.channel === "agent" &&
    latestReconLine.event.op === AgentOps.recon &&
    canonicalCampaignJson(parsedEnvelope.citations) !==
      canonicalCampaignJson(latestReconLine.event.recon.citations)
  ) {
    return {
      ok: false,
      error: "Campaign recon top-level envelope does not match latest trace recon payload",
    };
  }
  if (
    latestEvSha !== undefined &&
    computeReconCoreSha256(validatedTop) !== latestEvSha
  ) {
    return {
      ok: false,
      error: "Campaign recon evidence commitment mismatch",
    };
  }

  return { ok: true, reconArtifact: parsedEnvelope };
}

function parsePersistedCharterStrategy(
  v: unknown,
): PersistedCampaignCharterStrategy | null {
  if (!isPlainRecordObject(v)) return null;
  if (v.schema !== CAMPAIGN_SCHEMA_IDS.charter) return null;
  const charter = parseCampaignCharter(v.charter);
  if (!charter) return null;
  const manifest = parseCampaignManifest(v.manifest);
  if (!manifest) return null;
  if (
    typeof v.reconId !== "string" ||
    v.reconId.length === 0 ||
    manifest.reconId !== v.reconId ||
    typeof v.charterSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(v.charterSha256) ||
    typeof v.shortDigest !== "string" ||
    v.shortDigest !== v.charterSha256.slice(0, 12)
  ) {
    return null;
  }
  if (!isPlainRecordObject(v.charterTemplate)) return null;
  const tmpl = v.charterTemplate;
  if (
    tmpl.schema !== CAMPAIGN_SCHEMA_IDS.charter ||
    tmpl.revision !== charter.revision ||
    tmpl.reconId !== v.reconId ||
    tmpl.charterSha256 !== v.charterSha256 ||
    tmpl.shortDigest !== v.shortDigest
  ) {
    return null;
  }
  return v as PersistedCampaignCharterStrategy;
}

function parseCharterStrategySnapshotForCommitments(
  snap: OptionalArtifactSnapshot,
  expectedCharter: CampaignCharter,
  expectedArtifactSha: string | undefined,
):
  | { ok: true; charterStrategy: PersistedCampaignCharterStrategy }
  | { ok: false; error: string } {
  if (!snap.exists || snap.nonRegular) {
    return {
      ok: false,
      error: "Campaign charter strategy is missing or invalid",
    };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(snap.raw) as unknown;
  } catch {
    return {
      ok: false,
      error: "Campaign charter strategy shape is invalid",
    };
  }
  const parsed = parsePersistedCharterStrategy(parsedJson);
  if (!parsed) {
    return {
      ok: false,
      error: "Campaign charter strategy shape is invalid",
    };
  }
  if (
    canonicalCampaignJson(parsed.charter) !==
    canonicalCampaignJson(expectedCharter)
  ) {
    return {
      ok: false,
      error: "Campaign charter strategy does not match trace charter",
    };
  }
  if (
    expectedArtifactSha !== undefined &&
    computeCharterCoreSha256(parsed) !== expectedArtifactSha
  ) {
    return {
      ok: false,
      error: "Campaign charter strategy evidence commitment mismatch",
    };
  }
  return { ok: true, charterStrategy: parsed };
}

function verifyBoundArtifacts(
  lines: readonly PersistedCampaignTraceLine[],
  evidenceLines: readonly PersistedCampaignEvidenceLine[] | undefined,
  goalSnap: OptionalArtifactSnapshot,
  reconSnap: OptionalArtifactSnapshot,
  charterSnap: OptionalArtifactSnapshot,
  goalStageSnap: OptionalArtifactSnapshot = { exists: false },
  reconStageSnap: OptionalArtifactSnapshot = { exists: false },
  charterStageSnap: OptionalArtifactSnapshot = { exists: false },
):
  | {
      ok: true;
      goalContract: CampaignGoalContract | null;
      reconArtifact: PersistedReconArtifactStore | null;
      charterStrategy: PersistedCampaignCharterStrategy | null;
      promoteGoalStage: boolean;
      promoteReconStage: boolean;
      promoteCharterStage: boolean;
    }
  | { ok: false; error: string } {
  let goalContract: CampaignGoalContract | null = null;
  let promoteGoalStage = false;
  let promoteReconStage = false;
  let promoteCharterStage = false;

  const openLine = lines.find(
    (line) =>
      line.event?.channel === "agent" &&
      line.event.op === AgentOps.open &&
      line.entry.accepted === true,
  );
  const openEv =
    openLine && evidenceLines ? evidenceLines[openLine.seq] : undefined;
  const openEventGoalSha =
    openLine?.event?.channel === "agent" && openLine.event.op === AgentOps.open
      ? openLine.event.goalSha256
      : undefined;
  const openEvidenceGoalSha = openEv?.artifactSha256;

  if (
    openEventGoalSha !== undefined &&
    openEvidenceGoalSha !== undefined &&
    openEventGoalSha !== openEvidenceGoalSha
  ) {
    return {
      ok: false,
      error:
        "Campaign goal contract commitment mismatch between trace and evidence",
    };
  }

  if (
    openEventGoalSha !== undefined ||
    openEvidenceGoalSha !== undefined ||
    goalSnap.exists
  ) {
    if (!openLine) {
      return {
        ok: false,
        error: "Campaign goal contract is missing or invalid",
      };
    }
    if (goalSnap.exists) {
      const checked = parseGoalSnapshotForCommitments(
        goalSnap,
        openEventGoalSha,
        openEvidenceGoalSha,
      );
      if (!checked.ok) {
        return checked;
      }
      goalContract = checked.goalContract;
    } else if (goalStageSnap.exists) {
      const checkedStage = parseGoalSnapshotForCommitments(
        goalStageSnap,
        openEventGoalSha,
        openEvidenceGoalSha,
      );
      if (!checkedStage.ok) {
        return checkedStage;
      }
      goalContract = checkedStage.goalContract;
      promoteGoalStage = true;
    } else {
      return {
        ok: false,
        error: "Campaign goal contract is missing or invalid",
      };
    }
  }

  const reconLines = lines.filter(
    (line) =>
      line.event?.channel === "agent" &&
      line.event.op === AgentOps.recon &&
      line.entry.accepted === true,
  );

  const committedById = new Map<string, string>();
  const traceCitationsById = new Map<string, readonly string[]>();
  const evidenceReconHashes: Array<{ seq: number; sha256: string }> = [];
  let latestCommittedReconId: string | undefined;
  let latestCommittedReconSha256: string | undefined;

  for (const line of reconLines) {
    const ev = evidenceLines?.[line.seq];
    if (ev?.artifactSha256 !== undefined) {
      evidenceReconHashes.push({ seq: line.seq, sha256: ev.artifactSha256 });
    }
    if (line.event?.channel === "agent" && line.event.op === AgentOps.recon) {
      const newIdsForLine: string[] = [];
      let lastMatchedIdInLine: string | undefined;
      for (const citation of line.event.recon.citations) {
        const match = RECON_SHA256_CITATION_RE.exec(citation);
        if (match) {
          const id = match[1]!;
          const sha = match[2]!;
          lastMatchedIdInLine = id;
          const prev = committedById.get(id);
          if (prev !== undefined && prev !== sha) {
            return {
              ok: false,
              error: `Conflicting recon commitments for ${id}`,
            };
          }
          if (prev === undefined) {
            committedById.set(id, sha);
            newIdsForLine.push(id);
          }
        }
      }
      if (newIdsForLine.length === 1) {
        const lineId = newIdsForLine[0]!;
        traceCitationsById.set(lineId, line.event.recon.citations);
        latestCommittedReconId = lineId;
        latestCommittedReconSha256 = committedById.get(lineId);
      } else {
        const seqId = `recon-${line.seq}`;
        for (const id of newIdsForLine) {
          if (id === seqId) {
            traceCitationsById.set(id, line.event.recon.citations);
          }
        }
        const chosenId = newIdsForLine.includes(seqId)
          ? seqId
          : committedById.has(seqId)
            ? seqId
            : lastMatchedIdInLine;
        if (chosenId !== undefined) {
          latestCommittedReconId = chosenId;
          latestCommittedReconSha256 = committedById.get(chosenId);
        }
      }
    }
  }

  let reconArtifact: PersistedReconArtifactStore | null = null;
  if (
    committedById.size > 0 ||
    evidenceReconHashes.length > 0 ||
    (reconSnap.exists && !reconSnap.nonRegular)
  ) {
    const primary = validateReconEnvelopeSnapshot(
      reconSnap,
      committedById,
      traceCitationsById,
      evidenceReconHashes,
      reconLines,
      evidenceLines,
      latestCommittedReconId,
      latestCommittedReconSha256,
    );
    if (primary.ok) {
      reconArtifact = primary.reconArtifact;
    } else if (reconStageSnap.exists && !reconStageSnap.nonRegular) {
      const staged = validateReconEnvelopeSnapshot(
        reconStageSnap,
        committedById,
        traceCitationsById,
        evidenceReconHashes,
        reconLines,
        evidenceLines,
        latestCommittedReconId,
        latestCommittedReconSha256,
      );
      if (staged.ok) {
        reconArtifact = staged.reconArtifact;
        promoteReconStage = true;
      } else {
        return primary;
      }
    } else {
      return primary;
    }
  }

  const charterLines = lines.filter(
    (line) =>
      line.entry.accepted === true &&
      ((line.event?.channel === "agent" && line.event.op === AgentOps.propose) ||
        (line.event?.channel === "operator" &&
          line.event.op === OperatorVerbs.amend)),
  );
  const latestCharterLine = charterLines.at(-1);
  let charterStrategy: PersistedCampaignCharterStrategy | null = null;
  if (latestCharterLine) {
    const ev = evidenceLines?.[latestCharterLine.seq];
    const expectedEvidenceSha = ev?.artifactSha256;
    const expectedCharter =
      latestCharterLine.event?.channel === "agent" &&
      latestCharterLine.event.op === AgentOps.propose
        ? latestCharterLine.event.charter
        : latestCharterLine.event?.channel === "operator" &&
            latestCharterLine.event.op === OperatorVerbs.amend
          ? latestCharterLine.event.charter
          : undefined;

    let expectedTraceSha: string | undefined;
    if (expectedCharter) {
      for (const clause of expectedCharter.clauses) {
        const match = CHARTER_SHA256_CLAUSE_RE.exec(clause);
        if (match) {
          const rev = Number(match[1]);
          const sha = match[2]!;
          if (rev === expectedCharter.revision) {
            if (expectedTraceSha !== undefined && expectedTraceSha !== sha) {
              return {
                ok: false,
                error: `Conflicting charter commitments for r${rev}`,
              };
            }
            expectedTraceSha = sha;
          }
        }
      }
    }

    if (
      expectedTraceSha !== undefined &&
      expectedEvidenceSha !== undefined &&
      expectedTraceSha !== expectedEvidenceSha
    ) {
      return {
        ok: false,
        error:
          "Campaign charter commitment mismatch between trace and evidence",
      };
    }

    const expectedArtifactSha = expectedTraceSha ?? expectedEvidenceSha;

    if (
      expectedCharter &&
      (expectedTraceSha !== undefined ||
        expectedEvidenceSha !== undefined ||
        charterSnap.exists ||
        charterStageSnap.exists)
    ) {
      if (charterSnap.exists) {
        const checked = parseCharterStrategySnapshotForCommitments(
          charterSnap,
          expectedCharter,
          expectedArtifactSha,
        );
        if (!checked.ok) {
          if (charterStageSnap.exists) {
            const staged = parseCharterStrategySnapshotForCommitments(
              charterStageSnap,
              expectedCharter,
              expectedArtifactSha,
            );
            if (staged.ok) {
              charterStrategy = staged.charterStrategy;
              promoteCharterStage = true;
            } else {
              return checked;
            }
          } else {
            return checked;
          }
        } else {
          charterStrategy = checked.charterStrategy;
        }
      } else if (charterStageSnap.exists) {
        const staged = parseCharterStrategySnapshotForCommitments(
          charterStageSnap,
          expectedCharter,
          expectedArtifactSha,
        );
        if (!staged.ok) {
          return staged;
        }
        charterStrategy = staged.charterStrategy;
        promoteCharterStage = true;
      } else {
        return {
          ok: false,
          error: "Campaign charter strategy is missing or invalid",
        };
      }
    }
  } else if (charterSnap.exists) {
    return {
      ok: false,
      error: "Campaign charter strategy exists without a trace charter event",
    };
  }

  return {
    ok: true,
    goalContract,
    reconArtifact,
    charterStrategy,
    promoteGoalStage,
    promoteReconStage,
    promoteCharterStage,
  };
}

type PriorArtifactBytes =
  | { existed: false; raw: null }
  | { existed: true; raw: string };

async function capturePriorArtifactBytes(
  sessionRoot: string,
  targetPath: string,
  label: string,
): Promise<PriorArtifactBytes> {
  await assertConfinedPath(sessionRoot, targetPath, label);
  try {
    const stat = await lstat(targetPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`${label} must be a regular file: ${targetPath}`);
    }
    const raw = await readFile(targetPath, "utf8");
    return { existed: true, raw };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { existed: false, raw: null };
    }
    throw error;
  }
}

async function assertRegularOrMissingTarget(
  sessionRoot: string,
  targetPath: string,
  label: string,
): Promise<void> {
  await assertConfinedPath(sessionRoot, targetPath, label);
  try {
    const stat = await lstat(targetPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`${label} must be a regular file: ${targetPath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function reconcileStagedArtifacts(
  sessionRoot: string,
  campaignDir: string,
  promoteGoalStage: boolean,
  promoteReconStage: boolean,
  promoteCharterStage: boolean,
  recoveredTrailingEvidenceLine?: PersistedCampaignEvidenceLine,
): Promise<void> {
  const evidencePath = path.join(campaignDir, CAMPAIGN_EVIDENCE_FILE);
  const goalStagePath = path.join(campaignDir, CAMPAIGN_GOAL_STAGE_FILE);
  const goalPath = path.join(campaignDir, CAMPAIGN_GOAL_FILE);
  const reconStagePath = path.join(campaignDir, CAMPAIGN_RECON_STAGE_FILE);
  const reconPath = path.join(campaignDir, CAMPAIGN_RECON_FILE);
  const charterStagePath = path.join(campaignDir, CAMPAIGN_CHARTER_STAGE_FILE);
  const charterPath = path.join(campaignDir, CAMPAIGN_CHARTER_FILE);

  if (recoveredTrailingEvidenceLine !== undefined) {
    await assertRegularOrMissingTarget(
      sessionRoot,
      evidencePath,
      "Campaign evidence",
    );
    let existingCount = 0;
    try {
      const raw = await readFile(evidencePath, "utf8");
      const parsed = parseCampaignEvidenceLines(raw);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      existingCount = parsed.lines.length;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    if (existingCount === recoveredTrailingEvidenceLine.seq) {
      await appendFile(
        evidencePath,
        `${formatCampaignEvidenceLine(recoveredTrailingEvidenceLine)}\n`,
        { encoding: "utf8", flag: "a" },
      );
    }
  }

  if (promoteGoalStage) {
    await assertRegularOrMissingTarget(
      sessionRoot,
      goalPath,
      "Campaign goal contract",
    );
    await rename(goalStagePath, goalPath);
  } else {
    await rm(goalStagePath, { force: true }).catch(() => {});
  }

  if (promoteReconStage) {
    await assertRegularOrMissingTarget(
      sessionRoot,
      reconPath,
      "Campaign recon artifact",
    );
    await rename(reconStagePath, reconPath);
  } else {
    await rm(reconStagePath, { force: true }).catch(() => {});
  }

  if (promoteCharterStage) {
    await assertRegularOrMissingTarget(
      sessionRoot,
      charterPath,
      "Campaign charter strategy",
    );
    await rename(charterStagePath, charterPath);
  } else {
    await rm(charterStagePath, { force: true }).catch(() => {});
  }
}

async function writeAtomicJsonArtifact(
  sessionRoot: string,
  campaignDir: string,
  targetPath: string,
  tmpPrefix: string,
  label: string,
  content: string,
): Promise<void> {
  await assertConfinedPath(sessionRoot, targetPath, label);
  const tmpPath = path.join(
    campaignDir,
    `${tmpPrefix}.tmp-${process.pid}-${randomUUID()}`,
  );
  let renamed = false;
  try {
    await writeFile(tmpPath, content, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    try {
      const targetStat = await lstat(targetPath);
      if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
        throw new Error(`${label} must be a regular file: ${targetPath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    await rename(tmpPath, targetPath);
    renamed = true;
  } finally {
    if (!renamed) {
      await rm(tmpPath, { force: true }).catch(() => {});
    }
  }
}
