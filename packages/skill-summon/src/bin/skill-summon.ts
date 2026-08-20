#!/usr/bin/env node

import { resolveSkillSource } from "../data/configured-source.js";
import type { TrustFields } from "../domain/types.js";
import { GaiaService } from "../service.js";
import {
  findSession,
  listSessions,
  reapSessions,
  resolveSession,
} from "../summon/session.js";
import { summon } from "../summon/summon.js";
import { displayTrustFields } from "../trust.js";

const LABEL_WIDTH = 8;

const USAGE = `Usage:
  skill-summon summon "<intent>" [--count N] [--card | --json]
  skill-summon list [--json]
  skill-summon sessions [--json]
  skill-summon attach <session-id|name|root> [--json]
  skill-summon path [--json]
  skill-summon close [--json]
  skill-summon gc [--dry-run] [--json]
`;

class UsageError extends Error {
  override readonly name = "UsageError";
}

type ParsedArgs = {
  command: string;
  query: string | undefined;
  limit: number | undefined;
  json: boolean;
  card: boolean;
  dryRun: boolean;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "summon":
      await runSummon(args);
      return;
    case "list":
      await runList(args);
      return;
    case "sessions":
      await runSessions(args);
      return;
    case "attach":
      await runAttach(args);
      return;
    case "path":
      await runPath(args);
      return;
    case "close":
      await runClose(args);
      return;
    case "gc":
      await runGc(args);
      return;
    default:
      throw new UsageError(`Unknown command: ${args.command}\n\n${USAGE}`);
  }
}

async function runSummon(args: ParsedArgs): Promise<void> {
  if (!args.query) {
    throw new UsageError(`summon requires a query.\n\n${USAGE}`);
  }
  const service = createService();
  const { session, created } = await resolveSession();
  noteIfCreated(created, session.root);

  const outcome = await summon(service, session, {
    query: args.query,
    limit: args.limit,
  });

  if (args.json) {
    writeJson(outcome);
  } else if (args.card) {
    process.stdout.write(`${outcome.cards.join("\n\n")}\n`);
  } else {
    for (const result of outcome.summoned) {
      printSkillLine("summoned", result.id, mergedTrust(result), result.path, {
        totalSeconds: result.totalSeconds,
        cacheState: result.cacheState,
      });
    }
    for (const suite of outcome.suites) {
      const label = suite.ok ? "suite" : "suite!";
      process.stdout.write(
        `  ${label.padEnd(LABEL_WIDTH)}  ${suite.suiteId}  ${suite.succeededComponents}/${suite.totalComponents} components` +
          (suite.rootHasOwnSource
            ? `, root ${suite.rootInstalled ? "installed" : "failed"}`
            : "") +
          "\n",
      );
      if (!suite.ok) {
        process.stdout.write(
          `            failed: ${suite.failedComponents.join(", ")}\n`,
        );
      }
    }
    process.stdout.write(`  total     ${outcome.totalSeconds.toFixed(3)}s\n`);
  }

  if (outcome.summoned.length === 0) {
    process.stderr.write(
      `skill-summon: no skill could be summoned for "${outcome.query}".\n`,
    );
    for (const skip of outcome.skipped) {
      process.stderr.write(`  skipped ${skip.id}: ${skip.reason}\n`);
    }
    process.exitCode = 1;
  }
}

async function runList(args: ParsedArgs): Promise<void> {
  const { session, created } = await resolveSession();
  noteIfCreated(created, session.root);

  if (args.json) {
    writeJson({ sessionRoot: session.root, skills: session.skills });
    return;
  }

  if (session.skills.length === 0) {
    process.stdout.write("  (no skills summoned in this session)\n");
    return;
  }
  for (const skill of session.skills) {
    printSkillLine("resident", skill.id, mergedTrust(skill), skill.path, {
      totalSeconds: skill.totalSeconds,
      cacheState: skill.cacheState,
    });
  }
}

async function runSessions(args: ParsedArgs): Promise<void> {
  await reapSessions();
  const sessions = await listSessions();
  if (args.json) {
    writeJson({ sessions });
    return;
  }
  if (sessions.length === 0) {
    process.stdout.write("  (no warm sessions)\n");
    return;
  }
  for (const session of sessions) {
    process.stdout.write(
      `  ${session.name}  ${session.skillCount} skill(s)  ${session.skills.join(", ") || "empty"}\n`,
    );
    process.stdout.write(`    -> ${session.root}\n`);
  }
}

async function runAttach(args: ParsedArgs): Promise<void> {
  if (!args.query) {
    throw new UsageError(
      `attach requires a session id, name, or root.\n\n${USAGE}`,
    );
  }
  const session = await findSession(args.query);
  const exportCommand = `export SKILL_SUMMON_SESSION=${shellQuote(session.root)}`;
  if (args.json) {
    writeJson({ session, exportCommand });
  } else {
    process.stdout.write(`${exportCommand}\n`);
  }
}

async function runPath(args: ParsedArgs): Promise<void> {
  const { session, created } = await resolveSession();
  noteIfCreated(created, session.root);

  if (args.json) {
    writeJson({ sessionRoot: session.root });
  } else {
    process.stdout.write(`${session.root}\n`);
  }
}

async function runClose(args: ParsedArgs): Promise<void> {
  const existingRoot = process.env.SKILL_SUMMON_SESSION;
  if (!existingRoot) {
    if (args.json) {
      writeJson({ closed: false, reason: "SKILL_SUMMON_SESSION is not set" });
    } else {
      process.stdout.write("  (no active session; nothing to close)\n");
    }
    return;
  }

  const { session } = await resolveSession();
  await session.close();

  if (args.json) {
    writeJson({ closed: true, sessionRoot: existingRoot });
  } else {
    process.stdout.write(`  closed    ${existingRoot}\n`);
  }
}

async function runGc(args: ParsedArgs): Promise<void> {
  const outcome = await reapSessions({ dryRun: args.dryRun });
  if (args.json) {
    writeJson(outcome);
    return;
  }

  const action = outcome.dryRun ? "would reap" : "reaped";
  for (const candidate of outcome.candidates) {
    process.stdout.write(
      `  ${action.padEnd(LABEL_WIDTH)}  ${candidate.root}  (${formatBytes(candidate.bytes)}, ${candidate.ageHours.toFixed(1)}h old)\n`,
    );
  }
  if (outcome.candidates.length === 0) {
    process.stdout.write(`  (no expired abandoned sessions)\n`);
  }
  process.stdout.write(
    `  protected ${outcome.liveProtected.length} live session(s); ${action} ${outcome.candidates.length}, ${formatBytes(outcome.reclaimedBytes)}\n`,
  );
}

function createService(): GaiaService {
  return new GaiaService(resolveSkillSource().source);
}

function noteIfCreated(created: boolean, root: string): void {
  if (!created) return;
  process.stderr.write(
    `skill-summon: no active session; created one.\nskill-summon: reuse it across commands with: export SKILL_SUMMON_SESSION=${root}\n`,
  );
}

function printSkillLine(
  label: string,
  id: string,
  trust: TrustFields,
  filePath: string,
  timing: { totalSeconds: number; cacheState: "cold" | "warm" },
): void {
  const prefix = `  ${label.padEnd(LABEL_WIDTH)}  `;
  const renderedTrust = displayTrustFields(trust)
    .map((field) => `${field.label} ${field.value}`)
    .join(" · ");
  const trustSuffix = renderedTrust ? `  ${renderedTrust}` : "";
  process.stdout.write(
    `${prefix}${id}${trustSuffix}  (${timing.totalSeconds.toFixed(3)}s, ${timing.cacheState})\n`,
  );
  process.stdout.write(`${" ".repeat(prefix.length)}-> ${filePath}\n`);
}

function mergedTrust(skill: {
  trust?: TrustFields | undefined;
  level?: string | undefined;
  trustMagnitude?: number | undefined;
}): TrustFields {
  const trust = { ...(skill.trust ?? {}) };
  if (skill.level !== undefined && trust.level === undefined) {
    trust.level = skill.level;
  }
  if (
    skill.trustMagnitude !== undefined &&
    trust.trustMagnitude === undefined
  ) {
    trust.trustMagnitude = skill.trustMagnitude;
  }
  return trust;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0];
  if (!command) {
    throw new UsageError(USAGE);
  }
  const rest = argv.slice(1);
  let limit: number | undefined;
  let json = false;
  let card = false;
  let dryRun = false;
  const positionals: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === undefined) continue;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--card") {
      card = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--count" || arg === "--limit") {
      const value = rest[i + 1];
      if (value === undefined) {
        throw new UsageError(`${arg} requires a value.`);
      }
      limit = parseCount(value);
      i++;
      continue;
    }
    if (arg.startsWith("--count=")) {
      limit = parseCount(arg.slice("--count=".length));
      continue;
    }
    if (arg.startsWith("--limit=")) {
      limit = parseCount(arg.slice("--limit=".length));
      continue;
    }
    if (arg.startsWith("-")) {
      throw new UsageError(`Unknown flag: ${arg}\n\n${USAGE}`);
    }
    positionals.push(arg);
  }

  if (dryRun && command !== "gc") {
    throw new UsageError("--dry-run is only valid with gc.");
  }
  if (card && command !== "summon") {
    throw new UsageError("--card is only valid with summon.");
  }
  if (limit !== undefined && command !== "summon") {
    throw new UsageError("--count is only valid with summon.");
  }
  if (card && json) {
    throw new UsageError("--card and --json cannot be used together.");
  }

  return { command, query: positionals[0], limit, json, card, dryRun };
}

function parseCount(value: string): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new UsageError(`--count must be a positive integer, got: ${value}`);
  }
  return limit;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`skill-summon: ${message}\n`);
  process.exitCode = 1;
});
