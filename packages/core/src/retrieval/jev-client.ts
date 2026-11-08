// Safe, bounded, zero-runtime-dependency Jev System One client (TypeSafe System One contract).
//
// Evaluates bounded decision questions (choice) against pinned model jev-1.13.0
// with strict size bounds, safe offline fallback, pluggable transport, and
// atomic budget reservation.

import {
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Pinned constants matching TypeSafe System One contract
export const PINNED_MODEL = "jev-1.13.0";
export const DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const PRICE_PER_INPUT_TOKEN = 0.042 / 1_000_000; // $0.000000042 / token ($0.042 / 1M tokens)
export const RESERVATION_AMOUNT_USD = 0.003;
export const DEFAULT_MONTHLY_LIMIT_USD = 0.5;
export const MAX_MONTHLY_LIMIT_USD = 5.0;
export const DEFAULT_MAX_CALLS = 20;
export const MAX_REQUEST_BYTES = 12000;
export const MAX_RESPONSE_BYTES = 131072;
export const MAX_QUESTIONS = 3;
export const MAX_INPUT_TOKENS = 64000;
export const DEFAULT_TIMEOUT_MS = 10000;

export interface JevQuestion {
  type: "choice" | string;
  instructions: string;
  criteria?: Record<string, string>;
  choices?: string[];
}

export interface JevAnswer {
  type: "choice" | string;
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
}

export type JevFailureReason =
  | "dry_run"
  | "missing_api_key"
  | "budget_exceeded"
  | "max_calls_exceeded"
  | "budget_corrupt"
  | "lock_failed"
  | "request_too_large"
  | "too_many_questions"
  | "invalid_request"
  | "timeout"
  | "network_error"
  | "invalid_response"
  | "model_mismatch"
  | "response_too_large"
  | "http_redirect_prohibited"
  | `http_${number}`
  | string;

export class BudgetCorruptError extends Error {
  override readonly name = "BudgetCorruptError";
}

export class LockFailedError extends Error {
  override readonly name = "LockFailedError";
}

export interface MonthBudgetEntry {
  reserved_usd: number;
  spent_usd: number;
  attempts: number;
  successes: number;
  active_reservations?: number;
  active_attempts?: number;
}

export type BudgetLedger = Record<string, MonthBudgetEntry>;

export function validateBudgetLedger(data: unknown): asserts data is BudgetLedger {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new BudgetCorruptError("Budget ledger must be a dictionary");
  }
  const entries = Object.entries(data);
  for (const [monthKey, entry] of entries) {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      throw new BudgetCorruptError(`Invalid month key '${monthKey}' in budget ledger`);
    }
    const parts = monthKey.split("-");
    const monthVal = parseInt(parts[1]!, 10);
    if (monthVal < 1 || monthVal > 12) {
      throw new BudgetCorruptError(`Invalid calendar month '${monthKey}' in budget ledger`);
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new BudgetCorruptError(`Invalid entry for month '${monthKey}': must be a dictionary`);
    }
    const rec = entry as Record<string, unknown>;
    const {
      reserved_usd,
      spent_usd,
      attempts,
      successes,
      active_reservations,
      active_attempts,
    } = rec;

    if (typeof reserved_usd !== "number" || !Number.isFinite(reserved_usd) || reserved_usd < 0) {
      throw new BudgetCorruptError(`reserved_usd must be a non-negative finite number for month '${monthKey}'`);
    }
    if (typeof spent_usd !== "number" || !Number.isFinite(spent_usd) || spent_usd < 0) {
      throw new BudgetCorruptError(`spent_usd must be a non-negative finite number for month '${monthKey}'`);
    }
    if (typeof attempts !== "number" || !Number.isSafeInteger(attempts) || attempts < 0) {
      throw new BudgetCorruptError(`attempts must be a non-negative safe integer for month '${monthKey}'`);
    }
    if (typeof successes !== "number" || !Number.isSafeInteger(successes) || successes < 0) {
      throw new BudgetCorruptError(`successes must be a non-negative safe integer for month '${monthKey}'`);
    }
    if (
      active_reservations !== undefined &&
      (typeof active_reservations !== "number" ||
        !Number.isFinite(active_reservations) ||
        active_reservations < 0)
    ) {
      throw new BudgetCorruptError(
        `active_reservations must be a non-negative finite number for month '${monthKey}'`,
      );
    }
    if (
      active_attempts !== undefined &&
      (typeof active_attempts !== "number" ||
        !Number.isSafeInteger(active_attempts) ||
        active_attempts < 0)
    ) {
      throw new BudgetCorruptError(
        `active_attempts must be a non-negative safe integer for month '${monthKey}'`,
      );
    }
    if (successes > attempts) {
      throw new BudgetCorruptError(`successes (${successes}) cannot exceed attempts (${attempts}) for month '${monthKey}'`);
    }
    if (attempts === 0) {
      if (
        reserved_usd !== 0 ||
        spent_usd !== 0 ||
        successes !== 0 ||
        (active_reservations ?? 0) !== 0 ||
        (active_attempts ?? 0) !== 0
      ) {
        throw new BudgetCorruptError(`Month '${monthKey}' has 0 attempts but non-zero amounts`);
      }
    } else {
      if (spent_usd > reserved_usd + 1e-9) {
        throw new BudgetCorruptError(`spent_usd (${spent_usd}) cannot exceed reserved_usd (${reserved_usd}) for month '${monthKey}'`);
      }
    }
  }
}

function withBudgetLock<T>(stateDir: string, fn: () => T): T {
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  const lockPath = join(stateDir, "jev.lock");
  const recoveryPath = join(stateDir, "jev.recovery.lock");
  const lockId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  const timeoutMs = 10000;
  let acquired = false;
  let acquiredIno: number | null = null;

  while (!acquired) {
    try {
      const fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR);
      try {
        writeFileSync(
          fd,
          JSON.stringify({ pid: process.pid, lockId, createdAt: Date.now() }),
          "utf-8",
        );
        acquiredIno = statSync(lockPath).ino;
      } finally {
        closeSync(fd);
      }
      acquired = true;
    } catch (err: any) {
      if (err && err.code === "EEXIST") {
        try {
          const stat = statSync(lockPath);
          const ageMs = Date.now() - stat.mtimeMs;
          if (ageMs >= 15000) {
            let isDead = false;
            let currentOwner: { pid?: number; lockId?: string } | null = null;
            try {
              const raw = readFileSync(lockPath, "utf-8");
              currentOwner = JSON.parse(raw);
              if (currentOwner && typeof currentOwner.pid === "number") {
                try {
                  process.kill(currentOwner.pid, 0);
                  // Process is alive: never evict
                } catch (killErr: any) {
                  if (killErr.code === "ESRCH") {
                    isDead = true;
                  }
                }
              } else {
                isDead = true;
              }
            } catch {
              isDead = true;
            }

            if (isDead) {
              let recoveryFd: number | null = null;
              try {
                recoveryFd = openSync(
                  recoveryPath,
                  constants.O_CREAT | constants.O_EXCL | constants.O_RDWR,
                );
              } catch (recErr: any) {
                if (recErr && recErr.code === "EEXIST") {
                  try {
                    const recStat = statSync(recoveryPath);
                    if (Date.now() - recStat.mtimeMs > 15000) {
                      unlinkSync(recoveryPath);
                    }
                  } catch {}
                }
              }

              if (recoveryFd !== null) {
                try {
                  const freshStat = statSync(lockPath);
                  if (freshStat.ino === stat.ino && Date.now() - freshStat.mtimeMs >= 15000) {
                    unlinkSync(lockPath);
                  }
                } catch {
                  // Already removed by another process
                } finally {
                  try {
                    closeSync(recoveryFd);
                    unlinkSync(recoveryPath);
                  } catch {}
                }
              }
            }
          }
        } catch {
          // Lock was released in the meantime; continue loop
        }

        if (Date.now() - startTime > timeoutMs) {
          throw new LockFailedError("Lock timeout acquiring jev.lock");
        }
        try {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
        } catch {
          const end = Date.now() + 25;
          while (Date.now() < end) {}
        }
      } else {
        throw new LockFailedError(`Lock error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  try {
    return fn();
  } finally {
    try {
      if (existsSync(lockPath)) {
        const freshStat = statSync(lockPath);
        if (acquiredIno !== null && freshStat.ino === acquiredIno) {
          const raw = readFileSync(lockPath, "utf-8");
          const data = JSON.parse(raw);
          if (data.lockId === lockId && data.pid === process.pid) {
            unlinkSync(lockPath);
          }
        }
      }
    } catch {}
  }
}

export type CostStatus = "reconciled" | "reserved_unreconciled";

export interface JevSuccessResult {
  ok: true;
  reason: "ok";
  model: string;
  answers: Record<string, JevAnswer>;
  usage: JevUsage;
  costUsd: number;
  latencyMs: number;
  reservedUsd: number;
  costStatus: "reconciled";
}

export interface JevFailureResult {
  ok: false;
  reason: JevFailureReason;
  error?: string;
  costUsd: 0;
  latencyMs: number;
  reservedUsd?: number;
  costStatus?: CostStatus;
}

export type JevResult = JevSuccessResult | JevFailureResult;

export type JevTransport = (
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
) => Promise<{ status: number; body: string }>;

export interface JevClientOptions {
  apiKey?: string;
  endpoint?: string;
  live?: boolean;
  monthlyLimitUsd?: number;
  maxCalls?: number;
  timeoutMs?: number;
  transport?: JevTransport;
  stateDir?: string;
}

export interface BudgetStatus {
  monthlyLimitUsd: number;
  spentUsd: number;
  reservedUsd: number;
  remainingUsd: number;
  calls: number;
  maxCalls: number;
  successes: number;
}

/**
 * Default globalThis.fetch transport with AbortSignal timeout, manual redirect handling,
 * and stream chunk reading with MAX_RESPONSE_BYTES abort to guarantee no unbounded buffering.
 */
async function defaultTransport(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("Timeout"));
  }, timeoutMs);

  try {
    const response = await globalThis.fetch(endpoint, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      redirect: "manual",
    });

    if (!response.body) {
      const text = await response.text();
      return {
        status: response.status,
        body: text,
      };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            controller.abort(new Error(`Response exceeded maximum size of ${MAX_RESPONSE_BYTES} bytes`));
            const err = new Error(`Response exceeded maximum size of ${MAX_RESPONSE_BYTES} bytes`);
            err.name = "ResponseTooLargeError";
            throw err;
          }
          chunks.push(value);
        }
      }
    } finally {
      reader.releaseLock();
    }

    const concatenated = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      concatenated.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder().decode(concatenated);
    return {
      status: response.status,
      body: text,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export class JevClient {
  readonly endpoint: string;
  readonly live: boolean;
  readonly monthlyLimitUsd: number;
  readonly maxCalls: number;
  readonly timeoutMs: number;
  readonly transport: JevTransport;
  readonly apiKey?: string;
  readonly stateDir?: string;

  private inMemoryLedger: BudgetLedger = {};
  private inFlightCount = 0;
  private totalTokens = 0;

  constructor(options: JevClientOptions = {}) {
    this.endpoint =
      options.endpoint ??
      process.env.TYPESAFE_ENDPOINT ??
      process.env.JEV_ENDPOINT ??
      DEFAULT_ENDPOINT;

    this.apiKey =
      options.apiKey !== undefined
        ? options.apiKey
        : (process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY);

    const envLive =
      process.env.SKILL_HEAVEN_JEV_LIVE === "true" ||
      process.env.TYPESAFE_LIVE === "true" ||
      process.env.JEV_LIVE === "true";
    const hasKey = Boolean(this.apiKey?.trim());

    if (options.live !== undefined) {
      this.live = options.live === true;
    } else {
      this.live = envLive && hasKey;
    }

    this.monthlyLimitUsd = Math.min(
      Math.max(0, options.monthlyLimitUsd ?? DEFAULT_MONTHLY_LIMIT_USD),
      MAX_MONTHLY_LIMIT_USD,
    );
    this.maxCalls = options.maxCalls ?? DEFAULT_MAX_CALLS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.transport = options.transport ?? defaultTransport;

    const configuredStateDir = options.stateDir ?? process.env.SKILL_HEAVEN_JEV_STATE_DIR;
    const isTest = Boolean(process.env.VITEST || process.env.NODE_ENV === "test");
    const defaultStateDir = isTest ? undefined : join(homedir(), ".gaia", "jev");
    this.stateDir = configuredStateDir ?? defaultStateDir;
  }

  setLive(live: boolean): void {
    (this as { live: boolean }).live = live;
  }

  private readLedgerLocked(): BudgetLedger {
    if (!this.stateDir) return {};
    const budgetPath = join(this.stateDir, "budget.json");
    if (!existsSync(budgetPath)) return {};
    let data: unknown;
    try {
      const raw = readFileSync(budgetPath, "utf-8");
      data = JSON.parse(raw);
    } catch (err) {
      throw new BudgetCorruptError(
        `Existing budget ledger is corrupt: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    validateBudgetLedger(data);
    return data;
  }

  private writeLedgerLocked(ledger: BudgetLedger): void {
    if (!this.stateDir) return;
    const budgetPath = join(this.stateDir, "budget.json");
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
    const tmpPath = join(
      this.stateDir,
      `budget.json.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`,
    );
    writeFileSync(tmpPath, JSON.stringify(ledger, null, 2), "utf-8");
    renameSync(tmpPath, budgetPath);
  }

  private getMonthEntry(month: string): MonthBudgetEntry {
    let entry = this.inMemoryLedger[month];
    if (!entry) {
      if (this.stateDir) {
        try {
          const ledger = this.readLedgerLocked();
          if (ledger[month]) {
            entry = { ...ledger[month] };
            this.inMemoryLedger[month] = entry;
          }
        } catch {}
      }
      if (!entry) {
        entry = {
          reserved_usd: 0,
          spent_usd: 0,
          attempts: 0,
          successes: 0,
        };
        this.inMemoryLedger[month] = entry;
      }
    }
    return entry;
  }

  get spentAmountUsd(): number {
    const month = new Date().toISOString().slice(0, 7);
    return this.getMonthEntry(month).spent_usd;
  }

  get reservedAmountUsd(): number {
    const month = new Date().toISOString().slice(0, 7);
    return this.getMonthEntry(month).reserved_usd;
  }

  get callCount(): number {
    const month = new Date().toISOString().slice(0, 7);
    return this.getMonthEntry(month).attempts;
  }

  get successCount(): number {
    const month = new Date().toISOString().slice(0, 7);
    return this.getMonthEntry(month).successes;
  }

  get totalInputTokens(): number {
    return this.totalTokens;
  }

  getBudgetStatus(): BudgetStatus {
    const month = new Date().toISOString().slice(0, 7);
    if (this.stateDir) {
      try {
        withBudgetLock(this.stateDir, () => {
          const ledger = this.readLedgerLocked();
          if (ledger[month]) {
            this.inMemoryLedger[month] = { ...ledger[month] };
          } else {
            this.inMemoryLedger[month] = {
              reserved_usd: 0,
              spent_usd: 0,
              attempts: 0,
              successes: 0,
            };
          }
        });
      } catch (err) {
        throw new BudgetCorruptError(
          `Failed to read budget status from ledger: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const entry = this.getMonthEntry(month);
    return {
      monthlyLimitUsd: this.monthlyLimitUsd,
      spentUsd: entry.spent_usd,
      reservedUsd: entry.reserved_usd,
      remainingUsd: Math.max(0, this.monthlyLimitUsd - entry.reserved_usd),
      calls: entry.attempts,
      maxCalls: this.maxCalls,
      successes: entry.successes,
    };
  }

  resetBudget(): void {
    const month = new Date().toISOString().slice(0, 7);
    this.totalTokens = 0;
    if (this.stateDir) {
      try {
        withBudgetLock(this.stateDir, () => {
          let ledger: BudgetLedger;
          try {
            ledger = this.readLedgerLocked();
          } catch {
            ledger = {};
          }
          const entry = ledger[month];
          const activeAttempts = entry?.active_attempts ?? 0;
          const activeReserved = entry?.active_reservations ?? 0;
          if (activeAttempts > 0) {
            ledger[month] = {
              reserved_usd: activeReserved,
              spent_usd: 0,
              attempts: activeAttempts,
              successes: 0,
              active_reservations: activeReserved,
              active_attempts: activeAttempts,
            };
          } else {
            ledger[month] = {
              reserved_usd: 0,
              spent_usd: 0,
              attempts: 0,
              successes: 0,
              active_reservations: 0,
              active_attempts: 0,
            };
          }
          validateBudgetLedger(ledger);
          this.writeLedgerLocked(ledger);
          this.inMemoryLedger[month] = { ...ledger[month] };
        });
      } catch {}
    } else {
      const entry = this.inMemoryLedger[month];
      const activeAttempts = entry?.active_attempts ?? 0;
      const activeReserved = entry?.active_reservations ?? 0;
      if (activeAttempts > 0) {
        this.inMemoryLedger[month] = {
          reserved_usd: activeReserved,
          spent_usd: 0,
          attempts: activeAttempts,
          successes: 0,
          active_reservations: activeReserved,
          active_attempts: activeAttempts,
        };
      } else {
        this.inMemoryLedger[month] = {
          reserved_usd: 0,
          spent_usd: 0,
          attempts: 0,
          successes: 0,
          active_reservations: 0,
          active_attempts: 0,
        };
      }
    }
  }

  /**
   * Evaluate state against bounded Choice questions.
   * Degrades cleanly to `{ ok: false, reason: ... }` on failure, never throws.
   */
  async evaluate(
    state: unknown,
    questions: Record<string, JevQuestion>,
    invocationOptions?: { live?: boolean },
  ): Promise<JevResult> {
    // 1. Request validation
    if (state === undefined || state === null) {
      return {
        ok: false,
        reason: "invalid_request",
        error: "state must not be null or undefined",
        costUsd: 0,
        latencyMs: 0,
      };
    }

    if (!questions || typeof questions !== "object" || Array.isArray(questions)) {
      return {
        ok: false,
        reason: "invalid_request",
        error: "questions must be an object",
        costUsd: 0,
        latencyMs: 0,
      };
    }

    const questionKeys = Object.keys(questions);
    if (questionKeys.length === 0) {
      return {
        ok: false,
        reason: "invalid_request",
        error: "at least one question is required",
        costUsd: 0,
        latencyMs: 0,
      };
    }

    if (questionKeys.length > MAX_QUESTIONS) {
      return {
        ok: false,
        reason: "too_many_questions",
        error: `questions count (${questionKeys.length}) exceeds MAX_QUESTIONS (${MAX_QUESTIONS})`,
        costUsd: 0,
        latencyMs: 0,
      };
    }

    for (const qid of questionKeys) {
      const q = questions[qid];
      if (!q || typeof q !== "object") {
        return {
          ok: false,
          reason: "invalid_request",
          error: `question '${qid}' must be an object`,
          costUsd: 0,
          latencyMs: 0,
        };
      }
      if (q.type !== "choice") {
        return {
          ok: false,
          reason: "invalid_request",
          error: `question '${qid}' type must be 'choice'`,
          costUsd: 0,
          latencyMs: 0,
        };
      }
      if (!q.instructions || typeof q.instructions !== "string" || !q.instructions.trim()) {
        return {
          ok: false,
          reason: "invalid_request",
          error: `question '${qid}' instructions must be a non-empty string`,
          costUsd: 0,
          latencyMs: 0,
        };
      }
      const hasCriteria = q.criteria && typeof q.criteria === "object" && Object.keys(q.criteria).length > 0;
      const hasChoices = Array.isArray(q.choices) && q.choices.length > 0;
      if (!hasCriteria && !hasChoices) {
        return {
          ok: false,
          reason: "invalid_request",
          error: `question '${qid}' must provide criteria or choices`,
          costUsd: 0,
          latencyMs: 0,
        };
      }
    }

    // 2. Request serialization and payload size check
    let body: string;
    try {
      body = JSON.stringify({
        model: PINNED_MODEL,
        state,
        questions,
      });
    } catch (err) {
      return {
        ok: false,
        reason: "invalid_request",
        error: `Failed to serialize request payload: ${err instanceof Error ? err.message : String(err)}`,
        costUsd: 0,
        latencyMs: 0,
      };
    }

    const requestBytes = new TextEncoder().encode(body).length;
    if (requestBytes > MAX_REQUEST_BYTES) {
      return {
        ok: false,
        reason: "request_too_large",
        error: `Request payload size (${requestBytes} bytes) exceeds MAX_REQUEST_BYTES (${MAX_REQUEST_BYTES} bytes)`,
        costUsd: 0,
        latencyMs: 0,
      };
    }

    // 3. Safe offline check
    const effectiveLive = invocationOptions?.live ?? this.live;
    if (!effectiveLive) {
      return {
        ok: false,
        reason: "dry_run",
        error: "dry-run mode active (live is false)",
        costUsd: 0,
        latencyMs: 0,
      };
    }

    const apiKey = (
      this.apiKey !== undefined
        ? this.apiKey
        : (process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY)
    )?.trim();
    if (!apiKey) {
      return {
        ok: false,
        reason: "missing_api_key",
        error: "TYPESAFE_API_KEY is not configured",
        costUsd: 0,
        latencyMs: 0,
      };
    }

    // 4. Budget & call limit verification with cross-process locking
    const reservationMonth = new Date().toISOString().slice(0, 7);
    this.inFlightCount++;
    let reservationAcquired = false;
    try {
      try {
        if (this.stateDir) {
          withBudgetLock(this.stateDir, () => {
            const ledger = this.readLedgerLocked();
            const entry = ledger[reservationMonth] ?? {
              reserved_usd: 0,
              spent_usd: 0,
              attempts: 0,
              successes: 0,
            };

            if (entry.attempts >= this.maxCalls) {
              throw new Error(`max_calls_exceeded:${this.maxCalls}`);
            }
            if (entry.reserved_usd + RESERVATION_AMOUNT_USD > this.monthlyLimitUsd + 1e-9) {
              throw new Error(`budget_exceeded:${this.monthlyLimitUsd}`);
            }

            entry.reserved_usd = Number(
              (entry.reserved_usd + RESERVATION_AMOUNT_USD).toFixed(10),
            );
            entry.active_reservations = Number(
              ((entry.active_reservations ?? 0) + RESERVATION_AMOUNT_USD).toFixed(10),
            );
            entry.attempts += 1;
            entry.active_attempts = (entry.active_attempts ?? 0) + 1;
            ledger[reservationMonth] = entry;
            validateBudgetLedger(ledger);
            this.writeLedgerLocked(ledger);

            this.inMemoryLedger[reservationMonth] = { ...entry };
            reservationAcquired = true;
          });
        } else {
          const entry = this.getMonthEntry(reservationMonth);
          if (entry.attempts >= this.maxCalls) {
            return {
              ok: false,
              reason: "max_calls_exceeded",
              error: `Process max call limit of ${this.maxCalls} reached`,
              costUsd: 0,
              latencyMs: 0,
            };
          }
          if (entry.reserved_usd + RESERVATION_AMOUNT_USD > this.monthlyLimitUsd + 1e-9) {
            return {
              ok: false,
              reason: "budget_exceeded",
              error: `Monthly budget limit ($${this.monthlyLimitUsd.toFixed(4)}) reached`,
              costUsd: 0,
              latencyMs: 0,
            };
          }
          entry.reserved_usd = Number(
            (entry.reserved_usd + RESERVATION_AMOUNT_USD).toFixed(10),
          );
          entry.active_reservations = Number(
            ((entry.active_reservations ?? 0) + RESERVATION_AMOUNT_USD).toFixed(10),
          );
          entry.attempts += 1;
          entry.active_attempts = (entry.active_attempts ?? 0) + 1;
          reservationAcquired = true;
        }
      } catch (err) {
        if (err instanceof BudgetCorruptError) {
          return {
            ok: false,
            reason: "budget_corrupt",
            error: err.message,
            costUsd: 0,
            latencyMs: 0,
          };
        }
        if (err instanceof LockFailedError) {
          return {
            ok: false,
            reason: "lock_failed",
            error: err.message,
            costUsd: 0,
            latencyMs: 0,
          };
        }
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("max_calls_exceeded:")) {
          return {
            ok: false,
            reason: "max_calls_exceeded",
            error: `Process max call limit of ${msg.split(":")[1]} reached`,
            costUsd: 0,
            latencyMs: 0,
          };
        }
        if (msg.startsWith("budget_exceeded:")) {
          return {
            ok: false,
            reason: "budget_exceeded",
            error: `Monthly budget limit ($${msg.split(":")[1]}) reached`,
            costUsd: 0,
            latencyMs: 0,
          };
        }
        return {
          ok: false,
          reason: "budget_corrupt",
          error: `Budget ledger access failed: ${msg}`,
          costUsd: 0,
          latencyMs: 0,
        };
      }

    const reservedUsd = RESERVATION_AMOUNT_USD;

    // 5. Transport execution
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "User-Agent": `gaia-skill-heaven/${PINNED_MODEL}`,
    };

    const startTime = performance.now();
    let transportResult: { status: number; body: string };

    try {
      transportResult = await this.transport(this.endpoint, headers, body, this.timeoutMs);
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      const isResponseTooLarge =
        err instanceof Error &&
        (err.name === "ResponseTooLargeError" ||
          /exceeded maximum size|response_too_large/i.test(err.message));
      const isTimeout =
        !isResponseTooLarge &&
        err instanceof Error &&
        (err.name === "TimeoutError" ||
          err.name === "AbortError" ||
          /timeout|timed out/i.test(err.message));
      return {
        ok: false,
        reason: isResponseTooLarge ? "response_too_large" : isTimeout ? "timeout" : "network_error",
        error: err instanceof Error ? err.message : String(err),
        costUsd: 0,
        latencyMs,
        reservedUsd,
        costStatus: "reserved_unreconciled",
      };
    }

    const latencyMs = Math.round(performance.now() - startTime);
    const { status, body: responseText } = transportResult;

    // Handle HTTP redirect prohibited (credential protection)
    if (status >= 300 && status < 400) {
      return {
        ok: false,
        reason: "http_redirect_prohibited",
        error: `HTTP redirect (${status}) is prohibited to prevent token leakage`,
        costUsd: 0,
        latencyMs,
        reservedUsd,
        costStatus: "reserved_unreconciled",
      };
    }

    if (status !== 200) {
      return {
        ok: false,
        reason: `http_${status}`,
        error: `HTTP ${status}: ${responseText.slice(0, 200)}`,
        costUsd: 0,
        latencyMs,
        reservedUsd,
        costStatus: "reserved_unreconciled",
      };
    }

    // Response body size check
    const responseBytes = new TextEncoder().encode(responseText).length;
    if (responseBytes > MAX_RESPONSE_BYTES) {
      return {
        ok: false,
        reason: "response_too_large",
        error: `Response size (${responseBytes} bytes) exceeds MAX_RESPONSE_BYTES (${MAX_RESPONSE_BYTES} bytes)`,
        costUsd: 0,
        latencyMs,
        reservedUsd,
        costStatus: "reserved_unreconciled",
      };
    }

    // Parse JSON
    let respObj: Record<string, unknown>;
    try {
      const parsed = JSON.parse(responseText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
          ok: false,
          reason: "invalid_response",
          error: "Response must be a JSON object",
          costUsd: 0,
          latencyMs,
          reservedUsd,
          costStatus: "reserved_unreconciled",
        };
      }
      respObj = parsed as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        reason: "invalid_response",
        error: "Failed to parse response as JSON",
        costUsd: 0,
        latencyMs,
        reservedUsd,
        costStatus: "reserved_unreconciled",
      };
    }

    // 6. Response validation
    // Pinned model check
    if (respObj.model !== PINNED_MODEL) {
      return {
        ok: false,
        reason: "model_mismatch",
        error: `Response model '${String(respObj.model)}' does not match pinned model '${PINNED_MODEL}'`,
        costUsd: 0,
        latencyMs,
        reservedUsd,
        costStatus: "reserved_unreconciled",
      };
    }

    // Usage check
    const usage = respObj.usage as Record<string, unknown> | undefined;
    if (
      !usage ||
      typeof usage !== "object" ||
      typeof usage.input_tokens !== "number" ||
      typeof usage.output_tokens !== "number" ||
      !Number.isInteger(usage.input_tokens) ||
      !Number.isInteger(usage.output_tokens) ||
      usage.input_tokens < 0 ||
      usage.output_tokens < 0
    ) {
      return {
        ok: false,
        reason: "invalid_response",
        error: "Response usage must include non-negative integer input_tokens and output_tokens",
        costUsd: 0,
        latencyMs,
        reservedUsd,
        costStatus: "reserved_unreconciled",
      };
    }

    if (usage.input_tokens > MAX_INPUT_TOKENS) {
      return {
        ok: false,
        reason: "invalid_response",
        error: `input_tokens (${usage.input_tokens}) exceeds MAX_INPUT_TOKENS (${MAX_INPUT_TOKENS})`,
        costUsd: 0,
        latencyMs,
        reservedUsd,
        costStatus: "reserved_unreconciled",
      };
    }

    const validatedUsage: JevUsage = {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    };

    // Answers check
    const rawAnswers = respObj.answers as Record<string, unknown> | undefined;
    if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
      return {
        ok: false,
        reason: "invalid_response",
        error: "Response answers must be an object",
        costUsd: 0,
        latencyMs,
        reservedUsd,
        costStatus: "reserved_unreconciled",
      };
    }

    const validatedAnswers: Record<string, JevAnswer> = {};

    for (const qid of questionKeys) {
      const q = questions[qid]!;
      const ans = rawAnswers[qid] as Record<string, unknown> | undefined;
      if (!ans || typeof ans !== "object" || Array.isArray(ans)) {
        return {
          ok: false,
          reason: "invalid_response",
          error: `Missing or invalid answer for question '${qid}'`,
          costUsd: 0,
          latencyMs,
          reservedUsd,
          costStatus: "reserved_unreconciled",
        };
      }

      if (ans.type !== "choice") {
        return {
          ok: false,
          reason: "invalid_response",
          error: `Answer for '${qid}' type must be 'choice'`,
          costUsd: 0,
          latencyMs,
          reservedUsd,
          costStatus: "reserved_unreconciled",
        };
      }

      const validChoices = new Set(
        q.criteria ? Object.keys(q.criteria) : (q.choices ?? []),
      );

      const choice = ans.choice;
      if (typeof choice !== "string" || !validChoices.has(choice)) {
        return {
          ok: false,
          reason: "invalid_response",
          error: `Choice '${String(choice)}' for '${qid}' is not in allowed choices: [${Array.from(validChoices).join(", ")}]`,
          costUsd: 0,
          latencyMs,
          reservedUsd,
          costStatus: "reserved_unreconciled",
        };
      }

      const confidence = ans.confidence;
      if (
        typeof confidence !== "number" ||
        !Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 1
      ) {
        return {
          ok: false,
          reason: "invalid_response",
          error: `Confidence for '${qid}' must be a finite number in [0, 1], got ${String(confidence)}`,
          costUsd: 0,
          latencyMs,
          reservedUsd,
          costStatus: "reserved_unreconciled",
        };
      }

      const probs = ans.probabilities as Record<string, unknown> | undefined;
      if (!probs || typeof probs !== "object" || Array.isArray(probs)) {
        return {
          ok: false,
          reason: "invalid_response",
          error: `Probabilities for '${qid}' must be an object`,
          costUsd: 0,
          latencyMs,
          reservedUsd,
          costStatus: "reserved_unreconciled",
        };
      }

      const probKeys = Object.keys(probs);
      if (probKeys.length !== validChoices.size || !probKeys.every((k) => validChoices.has(k))) {
        return {
          ok: false,
          reason: "invalid_response",
          error: `Probabilities keys for '${qid}' do not match expected choices`,
          costUsd: 0,
          latencyMs,
          reservedUsd,
          costStatus: "reserved_unreconciled",
        };
      }

      let probSum = 0;
      let maxProb = -1;
      const validatedProbs: Record<string, number> = {};

      for (const [opt, pVal] of Object.entries(probs)) {
        if (typeof pVal !== "number" || !Number.isFinite(pVal) || pVal < 0 || pVal > 1) {
          return {
            ok: false,
            reason: "invalid_response",
            error: `Probability for '${qid}:${opt}' must be a finite number in [0, 1]`,
            costUsd: 0,
            latencyMs,
            reservedUsd,
            costStatus: "reserved_unreconciled",
          };
        }
        validatedProbs[opt] = pVal;
        probSum += pVal;
        if (pVal > maxProb) {
          maxProb = pVal;
        }
      }

      if (Math.abs(probSum - 1.0) > 0.03) {
        return {
          ok: false,
          reason: "invalid_response",
          error: `Probabilities for '${qid}' must sum to ~1.0 (got ${probSum})`,
          costUsd: 0,
          latencyMs,
          reservedUsd,
          costStatus: "reserved_unreconciled",
        };
      }

      // Ensure choice has the maximum probability (within floating-point tolerance)
      if (validatedProbs[choice]! < maxProb - 1e-6) {
        return {
          ok: false,
          reason: "invalid_response",
          error: `Choice '${choice}' for '${qid}' does not have the maximum probability (${validatedProbs[choice]} vs max ${maxProb})`,
          costUsd: 0,
          latencyMs,
          reservedUsd,
          costStatus: "reserved_unreconciled",
        };
      }

      validatedAnswers[qid] = {
        type: "choice",
        choice,
        confidence,
        probabilities: validatedProbs,
      };
    }

    // 7. Success calculation & spent accounting reconciled under budget lock
    const costUsd = Number(
      (validatedUsage.input_tokens * PRICE_PER_INPUT_TOKEN).toFixed(10),
    );
    if (this.stateDir) {
      try {
        withBudgetLock(this.stateDir, () => {
          const ledger = this.readLedgerLocked();
          let entry = ledger[reservationMonth];
          if (!entry) {
            entry = {
              reserved_usd: RESERVATION_AMOUNT_USD,
              spent_usd: 0,
              attempts: 1,
              successes: 0,
            };
            ledger[reservationMonth] = entry;
          }

          if (entry.attempts < entry.successes + 1) {
            entry.attempts = entry.successes + 1;
          }
          if (entry.reserved_usd < entry.spent_usd + costUsd) {
            entry.reserved_usd = Number((entry.spent_usd + costUsd).toFixed(10));
          }

          entry.spent_usd = Number((entry.spent_usd + costUsd).toFixed(10));
          entry.successes += 1;

          validateBudgetLedger(ledger);
          this.writeLedgerLocked(ledger);

          this.inMemoryLedger[reservationMonth] = { ...entry };
          this.totalTokens += validatedUsage.input_tokens;
        });
      } catch (err) {
        return {
          ok: false,
          reason: "budget_corrupt",
          error: `Reconciliation failed: ${err instanceof Error ? err.message : String(err)}`,
          costUsd: 0,
          latencyMs,
          reservedUsd,
          costStatus: "reserved_unreconciled",
        };
      }
    } else {
      const entry = this.getMonthEntry(reservationMonth);
      if (entry.attempts < entry.successes + 1) {
        entry.attempts = entry.successes + 1;
      }
      if (entry.reserved_usd < entry.spent_usd + costUsd) {
        entry.reserved_usd = Number((entry.spent_usd + costUsd).toFixed(10));
      }
      entry.spent_usd = Number((entry.spent_usd + costUsd).toFixed(10));
      entry.successes += 1;
      this.totalTokens += validatedUsage.input_tokens;
    }

    return {
      ok: true,
      reason: "ok",
      model: PINNED_MODEL,
      answers: validatedAnswers,
      usage: validatedUsage,
      costUsd,
      latencyMs,
      reservedUsd,
      costStatus: "reconciled",
    };
    } finally {
      this.inFlightCount--;
      if (reservationAcquired) {
        if (this.stateDir) {
          try {
            withBudgetLock(this.stateDir, () => {
              const ledger = this.readLedgerLocked();
              const entry = ledger[reservationMonth];
              if (entry && entry.active_attempts && entry.active_attempts > 0) {
                entry.active_attempts -= 1;
                entry.active_reservations = Math.max(
                  0,
                  Number(
                    ((entry.active_reservations ?? RESERVATION_AMOUNT_USD) -
                      RESERVATION_AMOUNT_USD).toFixed(10),
                  ),
                );
                validateBudgetLedger(ledger);
                this.writeLedgerLocked(ledger);
                this.inMemoryLedger[reservationMonth] = { ...entry };
              }
            });
          } catch {}
        } else {
          const entry = this.getMonthEntry(reservationMonth);
          if (entry.active_attempts && entry.active_attempts > 0) {
            entry.active_attempts -= 1;
            entry.active_reservations = Math.max(
              0,
              Number(
                ((entry.active_reservations ?? RESERVATION_AMOUNT_USD) -
                  RESERVATION_AMOUNT_USD).toFixed(10),
              ),
            );
          }
        }
      }
    }
  }

  /**
   * Alias for evaluate.
   */
  async classify(
    state: unknown,
    questions: Record<string, JevQuestion>,
  ): Promise<JevResult> {
    return this.evaluate(state, questions);
  }
}

export function createJevClient(options?: JevClientOptions): JevClient {
  return new JevClient(options);
}

let sharedJevClientInstance: JevClient | undefined;

export function getSharedJevClient(options?: JevClientOptions): JevClient {
  if (!sharedJevClientInstance) {
    sharedJevClientInstance = new JevClient(options);
  }
  return sharedJevClientInstance;
}

export function resetSharedJevClient(): void {
  sharedJevClientInstance = undefined;
}
