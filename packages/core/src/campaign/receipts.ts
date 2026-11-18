import { campaignSha256Hex } from "./trace-format.js";
import { CAMPAIGN_SCHEMA_IDS, RECEIPT_STATUSES, ReceiptStatuses } from "./vocabulary.js";
import type { ReceiptStatus } from "./vocabulary.js";

export type VerifyReceipt = Readonly<{
  schema: typeof CAMPAIGN_SCHEMA_IDS.receipt;
  unitId: string;
  command: string;
  outputSha256: string;
  exitCode: number;
  status: ReceiptStatus;
  replayedExitCode?: number;
  replayedOutputSha256?: string;
}>;

export type CreateAttestedReceiptInput = Readonly<{
  unitId: string;
  command: string;
  output?: string;
  outputSha256?: string;
  exitCode: number;
}>;

export type ObservedReplayOutput = Readonly<{
  command: string;
  outputSha256: string;
  exitCode: number;
}>;

export type ReceiptReplayUpgradeResult = Readonly<{
  upgraded: boolean;
  receipt: VerifyReceipt;
}>;

export type ParsedVerifyReceiptLines =
  | Readonly<{ ok: true; lines: readonly VerifyReceipt[] }>
  | Readonly<{ ok: false; error: string }>;

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX_PATTERN.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function freezeReceipt(receipt: VerifyReceipt): VerifyReceipt {
  return Object.freeze({
    schema: receipt.schema,
    unitId: receipt.unitId,
    command: receipt.command,
    outputSha256: receipt.outputSha256,
    exitCode: receipt.exitCode,
    status: receipt.status,
    ...(receipt.replayedExitCode !== undefined ? { replayedExitCode: receipt.replayedExitCode } : {}),
    ...(receipt.replayedOutputSha256 !== undefined ? { replayedOutputSha256: receipt.replayedOutputSha256 } : {}),
  });
}

export function computeOutputDigest(output: string): string {
  if (typeof output !== "string") {
    throw new Error("Receipt output must be a string");
  }
  return campaignSha256Hex(output);
}

export function createAttestedReceipt(input: CreateAttestedReceiptInput): VerifyReceipt {
  if (!isPlainObject(input)) {
    throw new Error("Receipt input must be a plain object");
  }
  if (!isNonEmptyText(input.unitId)) {
    throw new Error("Receipt unitId must be a non-empty string");
  }
  if (!isNonEmptyText(input.command)) {
    throw new Error("Receipt command must be a non-empty string");
  }
  if (!isNonNegativeSafeInt(input.exitCode)) {
    throw new Error("Receipt exitCode must be a non-negative safe integer");
  }

  let digest: string;
  if (input.output !== undefined) {
    if (typeof input.output !== "string") {
      throw new Error("Receipt output must be a string");
    }
    digest = computeOutputDigest(input.output);
    if (input.outputSha256 !== undefined && input.outputSha256 !== digest) {
      throw new Error("Receipt outputSha256 does not match output digest");
    }
  } else if (isSha256Hex(input.outputSha256)) {
    digest = input.outputSha256;
  } else {
    throw new Error("Receipt requires output or a valid outputSha256 digest");
  }

  return freezeReceipt({
    schema: CAMPAIGN_SCHEMA_IDS.receipt,
    unitId: input.unitId,
    command: input.command,
    outputSha256: digest,
    exitCode: input.exitCode,
    status: ReceiptStatuses.attested,
  });
}

export function parseVerifyReceipt(value: unknown): VerifyReceipt | null {
  try {
    if (!isPlainObject(value)) return null;
    const allowed = new Set([
      "schema",
      "unitId",
      "command",
      "outputSha256",
      "exitCode",
      "status",
      "replayedExitCode",
      "replayedOutputSha256",
    ]);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.some((k) => typeof k !== "string" || !allowed.has(k))) return null;
    for (const key of keys as string[]) {
      const d = descriptors[key];
      if (!d || !Object.hasOwn(d, "value") || d.enumerable !== true) return null;
    }

    const required = ["schema", "unitId", "command", "outputSha256", "exitCode", "status"] as const;
    for (const key of required) {
      if (!Object.hasOwn(value, key)) return null;
    }

    if (value.schema !== CAMPAIGN_SCHEMA_IDS.receipt) return null;
    if (!isNonEmptyText(value.unitId)) return null;
    if (!isNonEmptyText(value.command)) return null;
    if (!isSha256Hex(value.outputSha256)) return null;
    if (!isNonNegativeSafeInt(value.exitCode)) return null;
    if (typeof value.status !== "string" || !(RECEIPT_STATUSES as readonly string[]).includes(value.status)) {
      return null;
    }

    const hasReplayedExit = Object.hasOwn(value, "replayedExitCode");
    const hasReplayedDigest = Object.hasOwn(value, "replayedOutputSha256");

    if (value.status === ReceiptStatuses.attested) {
      if (hasReplayedExit || hasReplayedDigest) return null;
      return freezeReceipt({
        schema: CAMPAIGN_SCHEMA_IDS.receipt,
        unitId: value.unitId,
        command: value.command,
        outputSha256: value.outputSha256,
        exitCode: value.exitCode,
        status: ReceiptStatuses.attested,
      });
    }

    if (!hasReplayedExit || !hasReplayedDigest) return null;
    if (!isNonNegativeSafeInt(value.replayedExitCode) || !isSha256Hex(value.replayedOutputSha256)) {
      return null;
    }

    return freezeReceipt({
      schema: CAMPAIGN_SCHEMA_IDS.receipt,
      unitId: value.unitId,
      command: value.command,
      outputSha256: value.outputSha256,
      exitCode: value.exitCode,
      status: ReceiptStatuses.replayed,
      replayedExitCode: value.replayedExitCode,
      replayedOutputSha256: value.replayedOutputSha256,
    });
  } catch {
    return null;
  }
}

export function formatVerifyReceiptLine(receipt: VerifyReceipt): string {
  const parsed = parseVerifyReceipt(receipt);
  if (!parsed) {
    throw new Error("Invalid verify receipt");
  }
  return JSON.stringify(parsed);
}

export function parseVerifyReceiptLines(raw: string): ParsedVerifyReceiptLines {
  if (typeof raw !== "string") {
    return { ok: false, error: "Receipt log must be a string" };
  }
  if (raw === "") return { ok: true, lines: [] };
  const normalized = raw.endsWith("\r\n")
    ? raw.slice(0, -2)
    : raw.endsWith("\n")
      ? raw.slice(0, -1)
      : raw;
  const rawLines = normalized.split("\n");
  const lines: VerifyReceipt[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const lineText = rawLines[i]!;
    if (lineText.length === 0) {
      return { ok: false, error: `Empty receipt line at ${i}` };
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(lineText) as unknown;
    } catch {
      return { ok: false, error: `Malformed JSON at receipt line ${i}` };
    }
    const receipt = parseVerifyReceipt(parsedJson);
    if (!receipt) {
      return { ok: false, error: `Invalid verify receipt at line ${i}` };
    }
    lines.push(receipt);
  }
  return { ok: true, lines: Object.freeze(lines) };
}

export function isCharterNamedVerifyCommand(command: string, charterCommands: readonly string[]): boolean {
  if (!isNonEmptyText(command) || !Array.isArray(charterCommands) || charterCommands.length === 0) {
    return false;
  }
  const trimmed = command.trim();
  return charterCommands.some((candidate) => isNonEmptyText(candidate) && candidate.trim() === trimmed);
}

export function canReceiptCloseUnit(
  receipt: unknown,
  unitId: string,
  charterCommands: readonly string[],
): boolean {
  if (!isNonEmptyText(unitId)) return false;
  const parsed = parseVerifyReceipt(receipt);
  if (!parsed) return false;
  if (parsed.unitId !== unitId) return false;
  if (parsed.exitCode !== 0) return false;
  if (parsed.status === ReceiptStatuses.replayed && parsed.replayedExitCode !== 0) return false;
  return isCharterNamedVerifyCommand(parsed.command, charterCommands);
}

export function upgradeReceiptOnReplay(
  receipt: VerifyReceipt,
  observed: ObservedReplayOutput,
): ReceiptReplayUpgradeResult {
  const parsed = parseVerifyReceipt(receipt);
  if (!parsed) {
    throw new Error("Invalid verify receipt");
  }
  if (!isPlainObject(observed)) {
    throw new Error("Observed replay output must be a plain object");
  }
  if (!isNonEmptyText(observed.command)) {
    throw new Error("Observed command must be a non-empty string");
  }
  if (!isSha256Hex(observed.outputSha256)) {
    throw new Error("Observed outputSha256 must be a valid sha256 hex digest");
  }
  if (!isNonNegativeSafeInt(observed.exitCode)) {
    throw new Error("Observed exitCode must be a non-negative safe integer");
  }

  const matched =
    parsed.command.trim() === observed.command.trim() &&
    parsed.outputSha256 === observed.outputSha256 &&
    parsed.exitCode === observed.exitCode;

  if (matched) {
    return Object.freeze({
      upgraded: true,
      receipt: freezeReceipt({
        schema: parsed.schema,
        unitId: parsed.unitId,
        command: parsed.command,
        outputSha256: parsed.outputSha256,
        exitCode: parsed.exitCode,
        status: ReceiptStatuses.replayed,
        replayedExitCode: observed.exitCode,
        replayedOutputSha256: observed.outputSha256,
      }),
    });
  }

  return Object.freeze({
    upgraded: false,
    receipt: freezeReceipt({
      schema: parsed.schema,
      unitId: parsed.unitId,
      command: parsed.command,
      outputSha256: parsed.outputSha256,
      exitCode: parsed.exitCode,
      status: ReceiptStatuses.attested,
    }),
  });
}
