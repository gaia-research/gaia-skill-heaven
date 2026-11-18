import {
  AgentOps,
  CampaignDecisions,
  CampaignStates,
  EngineOps,
  UnitReportOutcomes,
  WorkUnitStates,
  activateWorkUnit,
  blockWorkUnit,
  canReceiptCloseUnit,
  createAttestedReceipt,
  createCampaignEngineAdapter,
  createCampaignEngineEvent,
  immutableSnapshot,
  markWorkUnitNeedsHuman,
  recordRetrievalRefusal,
  reportUnitVerification,
  resumeWorkUnitFromHuman,
  toControllerStatus,
  unblockWorkUnit,
  updateWorkUnitInQueue,
  type CampaignState,
  type CampaignTraceEntry,
  type ControllerStatus,
  type SteeringState,
  type UnitReportOutcome,
  type VerifyReceipt,
  type WorkUnitRecord,
} from "skill-zero";

import { CampaignStore } from "../store.js";
import {
  buildCampaignDigest,
  type CampaignDigest,
  type CampaignRefusalError,
} from "./status.js";

const engineAdapter = createCampaignEngineAdapter();

const FORBIDDEN_RETRIEVAL_KEYS = new Set([
  "score",
  "margin",
  "noMatch",
  "matchKind",
  "retrieval",
  "ranking",
  "classified",
  "nameMatchesQuery",
  "filtered",
  "cards",
  "previewed",
]);

export type CampaignReportResult =
  | Readonly<{
      ok: true;
      refused: false;
      op: typeof AgentOps.report;
      outcome: UnitReportOutcome;
      decision: (typeof CampaignDecisions)[keyof typeof CampaignDecisions];
      unit?: WorkUnitRecord;
      receipt?: VerifyReceipt;
      steering: SteeringState;
      state: CampaignState;
      entry?: CampaignTraceEntry;
      status: ControllerStatus;
      digest: CampaignDigest;
    }>
  | Readonly<{
      ok: false;
      refused: true;
      op: typeof AgentOps.report;
      state: CampaignState;
      status: ControllerStatus;
      digest: CampaignDigest;
      error: CampaignRefusalError;
    }>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function findForbiddenRetrievalKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenRetrievalKey(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_RETRIEVAL_KEYS.has(key)) {
      return key;
    }
    const found = findForbiddenRetrievalKey(nested);
    if (found) return found;
  }
  return null;
}

function getLatestAcceptedOperator(
  trace: readonly CampaignTraceEntry[],
): CampaignTraceEntry | undefined {
  return [...trace]
    .reverse()
    .find((entry) => entry.channel === "operator" && entry.accepted);
}

function refuseReport(
  state: CampaignState,
  status: ControllerStatus,
  digest: CampaignDigest,
  code: string,
  message: string,
): CampaignReportResult {
  return immutableSnapshot({
    ok: false,
    refused: true,
    op: AgentOps.report,
    state,
    status,
    digest,
    error: {
      code,
      message,
      retryable: false,
    },
  });
}

export async function executeReport(
  session: { readonly root: string },
  rawArgs: unknown,
): Promise<CampaignReportResult> {
  const store = await CampaignStore.load(session.root);
  const status = toControllerStatus(store.state, store.trace.at(-1));
  const latestAcceptedOperator = getLatestAcceptedOperator(store.trace);
  const digest = buildCampaignDigest(
    store.state,
    status,
    latestAcceptedOperator,
  );

  if (store.corrupted) {
    return refuseReport(
      store.state,
      status,
      digest,
      "campaign-corrupted",
      store.error ?? "Campaign trace failed verification (FAILED_SAFE).",
    );
  }

  const forbiddenKey = findForbiddenRetrievalKey(rawArgs);
  if (forbiddenKey !== null) {
    return refuseReport(
      store.state,
      status,
      digest,
      "retrieval-signal-rejected",
      `Refusing report: retrieval-derived signal "${forbiddenKey}" cannot drive campaign steering or work-unit state.`,
    );
  }

  if (
    store.state.state !== CampaignStates.executing ||
    !store.state.approved ||
    store.state.charter === null
  ) {
    return refuseReport(
      store.state,
      status,
      digest,
      "campaign-not-executing",
      `Cannot report work unit in state ${store.state.state} (approved=${store.state.approved}).`,
    );
  }

  if (!isPlainObject(rawArgs)) {
    return refuseReport(
      store.state,
      status,
      digest,
      "invalid-report-args",
      "Report arguments must be a plain object.",
    );
  }

  const unitId =
    typeof rawArgs.unitId === "string" && rawArgs.unitId.trim().length > 0
      ? rawArgs.unitId.trim()
      : undefined;

  if (
    rawArgs.outcome === UnitReportOutcomes.retrievalRefusal ||
    rawArgs.retrievalRefusal === true
  ) {
    let updatedUnit: WorkUnitRecord | undefined;
    if (unitId) {
      const queue = await store.loadUnitsState();
      if (queue) {
        const target = queue.units.find((u) => u.id === unitId);
        if (target) {
          const refused = recordRetrievalRefusal(target);
          updatedUnit = refused.unit;
          await store.saveUnitsState(updateWorkUnitInQueue(queue, refused.unit));
        }
      }
    }

    return immutableSnapshot({
      ok: true,
      refused: false,
      op: AgentOps.report,
      outcome: UnitReportOutcomes.retrievalRefusal,
      decision: CampaignDecisions.hold,
      ...(updatedUnit ? { unit: updatedUnit } : {}),
      steering: store.state.steering,
      state: store.state,
      status,
      digest,
    });
  }

  let outcome: UnitReportOutcome | undefined;
  if (typeof rawArgs.outcome === "string") {
    outcome = rawArgs.outcome as UnitReportOutcome;
  } else if (typeof rawArgs.passed === "boolean") {
    outcome = rawArgs.passed
      ? UnitReportOutcomes.pass
      : UnitReportOutcomes.fail;
  }

  if (!outcome) {
    return refuseReport(
      store.state,
      status,
      digest,
      "invalid-report-outcome",
      "Report requires outcome or boolean passed.",
    );
  }

  if (!unitId) {
    return refuseReport(
      store.state,
      status,
      digest,
      "missing-unit-id",
      "Report requires a non-empty unitId.",
    );
  }

  const queue = await store.loadUnitsState();
  if (!queue) {
    return refuseReport(
      store.state,
      status,
      digest,
      "work-unit-not-found",
      `Work unit "${unitId}" not found: units.json has not been initialized.`,
    );
  }

  const unit = queue.units.find((u) => u.id === unitId);
  if (!unit) {
    return refuseReport(
      store.state,
      status,
      digest,
      "work-unit-not-found",
      `Work unit "${unitId}" not found in queue.`,
    );
  }

  if (
    outcome === UnitReportOutcomes.pass ||
    outcome === UnitReportOutcomes.fail
  ) {
    if (
      unit.state !== WorkUnitStates.active &&
      unit.state !== WorkUnitStates.verifying
    ) {
      return refuseReport(
        store.state,
        status,
        digest,
        "invalid-work-unit-state",
        `Cannot report verification for work unit "${unitId}" in state ${unit.state}.`,
      );
    }

    const command =
      typeof rawArgs.command === "string" ? rawArgs.command.trim() : "";
    if (!command) {
      return refuseReport(
        store.state,
        status,
        digest,
        "invalid-verify-command",
        "Verification report requires a non-empty command string.",
      );
    }

    let exitCode: number;
    if (outcome === UnitReportOutcomes.pass) {
      if (rawArgs.exitCode !== undefined && rawArgs.exitCode !== 0) {
        return refuseReport(
          store.state,
          status,
          digest,
          "invalid-exit-code",
          "Passing verification report requires exitCode === 0.",
        );
      }
      exitCode = 0;
    } else {
      exitCode = rawArgs.exitCode === undefined ? 1 : Number(rawArgs.exitCode);
      if (!Number.isSafeInteger(exitCode) || exitCode < 1) {
        return refuseReport(
          store.state,
          status,
          digest,
          "invalid-exit-code",
          "Failing verification report requires a positive integer exitCode.",
        );
      }
    }

    let receipt: VerifyReceipt;
    try {
      receipt = createAttestedReceipt({
        unitId,
        command,
        ...(typeof rawArgs.output === "string"
          ? { output: rawArgs.output }
          : {}),
        ...(typeof rawArgs.outputSha256 === "string"
          ? { outputSha256: rawArgs.outputSha256 }
          : {}),
        exitCode,
      });
    } catch (error) {
      return refuseReport(
        store.state,
        status,
        digest,
        "invalid-receipt",
        error instanceof Error ? error.message : "Invalid verification receipt.",
      );
    }

    const goalContract = await store.loadGoalContract();
    const charterCommands =
      store.state.charter.acceptanceCommands ??
      goalContract?.acceptanceCommands ??
      [];

    if (
      outcome === UnitReportOutcomes.pass &&
      !canReceiptCloseUnit(receipt, unitId, charterCommands)
    ) {
      return refuseReport(
        store.state,
        status,
        digest,
        "unlisted-verify-command",
        `Refusing to close work unit "${unitId}": command ${JSON.stringify(command)} is not in the charter's acceptanceCommands.`,
      );
    }

    const unitResult = reportUnitVerification(unit, {
      outcome,
      bounds: queue.bounds,
      charterCommands,
      receipt,
    });

    const clause = store.state.charter.clauses.includes("verify-command")
      ? "verify-command"
      : store.state.charter.clauses[0]!;

    const event = createCampaignEngineEvent(engineAdapter, {
      channel: "engine",
      op: EngineOps.verify,
      passed: outcome === UnitReportOutcomes.pass,
      clause,
      workUnit: unitId,
      receipt,
      ...(outcome === UnitReportOutcomes.pass ? { closesUnit: true } : {}),
    });

    const appended = await store.append(event);
    await store.saveUnitsState(updateWorkUnitInQueue(queue, unitResult.unit));
    await store.appendReceipt(receipt);

    const nextDigest = buildCampaignDigest(
      appended.state,
      appended.status,
      latestAcceptedOperator,
    );

    return immutableSnapshot({
      ok: true,
      refused: false,
      op: AgentOps.report,
      outcome,
      decision: unitResult.decision,
      unit: unitResult.unit,
      receipt,
      steering: appended.state.steering,
      state: appended.state,
      entry: appended.entry,
      status: appended.status,
      digest: nextDigest,
    });
  }

  let nextUnit: WorkUnitRecord;
  try {
    if (outcome === UnitReportOutcomes.block) {
      const reason = typeof rawArgs.reason === "string" ? rawArgs.reason : "";
      nextUnit = blockWorkUnit(unit, reason);
    } else if (outcome === UnitReportOutcomes.unblock) {
      nextUnit = unblockWorkUnit(unit);
    } else if (outcome === UnitReportOutcomes.needsHuman) {
      const reason = typeof rawArgs.reason === "string" ? rawArgs.reason : "";
      nextUnit = markWorkUnitNeedsHuman(unit, reason);
    } else if (outcome === UnitReportOutcomes.resume) {
      if (
        unit.state === WorkUnitStates.recovering ||
        unit.state === WorkUnitStates.reopened
      ) {
        nextUnit = activateWorkUnit(unit);
      } else if (unit.state === WorkUnitStates.needsHuman) {
        nextUnit = resumeWorkUnitFromHuman(unit);
      } else {
        return refuseReport(
          store.state,
          status,
          digest,
          "invalid-work-unit-state",
          `Cannot resume work unit "${unitId}" from state ${unit.state}.`,
        );
      }
    } else {
      return refuseReport(
        store.state,
        status,
        digest,
        "invalid-report-outcome",
        `Unsupported report outcome: ${String(outcome)}.`,
      );
    }
  } catch (error) {
    return refuseReport(
      store.state,
      status,
      digest,
      "invalid-work-unit-transition",
      error instanceof Error
        ? error.message
        : "Invalid work unit state transition.",
    );
  }

  await store.saveUnitsState(updateWorkUnitInQueue(queue, nextUnit));
  return immutableSnapshot({
    ok: true,
    refused: false,
    op: AgentOps.report,
    outcome,
    decision: CampaignDecisions.hold,
    unit: nextUnit,
    steering: store.state.steering,
    state: store.state,
    status,
    digest,
  });
}
