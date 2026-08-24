// Structured R2 companion receipt. This is intentionally NOT hh-ledger/v1:
// the upstream ledger field set is frozen (D6), while runtime provenance needs
// an exact rung and sandbox/bundle evidence.

import { createHash } from "node:crypto";
import { floorOf, type Harness, type Posture } from "./compile.js";
import type { ProvisionEvidence } from "./exec.js";
import type { TrialRung } from "./record.js";
import type { LedgerRecord } from "./vendor/ledger-record.js";

export const RUN_RECEIPT_SCHEMA = "skill-zero/r2-run-receipt/v1" as const;

export interface RunReceipt {
  schema: typeof RUN_RECEIPT_SCHEMA;
  recordedAt: string;
  ledger: {
    benchmarkId: string;
    task: string;
    arm: LedgerRecord["arm"];
    repeatIndex: number;
    recordSha256: string;
  };
  coordinate: {
    rung: TrialRung;
    posture: Posture;
    floor: "benchmark" | "product" | null;
    activation: "doorless-placebo" | "product-floor" | "summon";
  };
  harness: {
    name: Harness;
    pinnedVersion: string;
    reportedVersion: string;
    bundleEntry: string;
    bundleContentSha256: string;
    entryContentSha256: string;
  };
  sandbox: {
    provisioning: "copied-pinned-bundle";
    disposable: boolean;
    sharedStateMutation: false;
    keptTemp: boolean;
  };
  skillsLoaded: LedgerRecord["skillsLoaded"];
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assembleRunReceipt(args: {
  record: LedgerRecord;
  rung: TrialRung;
  posture: Posture;
  harnessName: Harness;
  provision: ProvisionEvidence;
  keptTemp: boolean;
}): RunReceipt {
  const activation = args.rung === "benchmark-floor"
    ? "doorless-placebo"
    : args.rung === "zero"
      ? "product-floor"
      : "summon";
  return {
    schema: RUN_RECEIPT_SCHEMA,
    recordedAt: args.record.recordedAt,
    ledger: {
      benchmarkId: args.record.benchmarkId,
      task: args.record.task,
      arm: args.record.arm,
      repeatIndex: args.record.repeatIndex,
      recordSha256: sha256Json(args.record),
    },
    coordinate: {
      rung: args.rung,
      posture: args.posture,
      floor: floorOf(args.posture),
      activation,
    },
    harness: {
      name: args.harnessName,
      pinnedVersion: args.provision.pinnedVersion,
      reportedVersion: args.provision.reportedVersion,
      bundleEntry: args.provision.entry,
      bundleContentSha256: args.provision.bundleContentSha256,
      entryContentSha256: args.provision.entryContentSha256,
    },
    sandbox: {
      provisioning: "copied-pinned-bundle",
      disposable: !args.keptTemp,
      sharedStateMutation: false,
      keptTemp: args.keptTemp,
    },
    skillsLoaded: args.record.skillsLoaded,
  };
}
