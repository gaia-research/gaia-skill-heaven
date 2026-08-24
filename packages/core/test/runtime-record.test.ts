import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { compile } from "../src/compile.js";
import { exec } from "../src/exec.js";
import { hashBundle } from "../src/provision.js";
import { RUN_RECEIPT_SCHEMA, sha256Json, type RunReceipt } from "../src/receipt.js";
import { validateRecord, type LedgerRecord } from "../src/vendor/ledger-record.js";

const roots: string[] = [];
const temp = (prefix: string): string => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureBundle(root: string): { dir: string; entry: string; version: string; hash: string } {
  const dir = join(root, "clean-harness-install");
  const entry = "bin/fixture-harness";
  const executable = join(dir, entry);
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(
    executable,
    "#!/usr/bin/env sh\n" +
      "if [ \"$1\" = \"--version\" ]; then echo 'fixture-harness 1.2.3'; exit 0; fi\n" +
      "printf '%s\\n' '{\"result\":\"PASS\",\"usage\":{\"input_tokens\":2,\"output_tokens\":3}}'\n",
  );
  chmodSync(executable, 0o755);
  return { dir, entry, version: "fixture-harness 1.2.3", hash: hashBundle(dir) };
}

function recordFlags(bundle: ReturnType<typeof fixtureBundle>, recordOut: string, receiptOut: string): string[] {
  return [
    "--record-out", recordOut,
    "--receipt-out", receiptOut,
    "--harness-bundle", bundle.dir,
    "--harness-entry", bundle.entry,
    "--harness-version", bundle.version,
    "--harness-sha256", bundle.hash,
  ];
}

describe("R2 clean harness provisioning", () => {
  it("copies and verifies a pinned bundle inside the disposable session", () => {
    const root = temp("r2-provision-");
    const bundle = fixtureBundle(root);
    const compiled = compile({ posture: "floor", harness: "claude", skills: [], prompt: "Q", jsonOutput: true });
    const result = exec(compiled, {
      harnessBundle: {
        sourceDir: bundle.dir,
        entry: bundle.entry,
        pinnedVersion: bundle.version,
        contentSha256: bundle.hash,
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"result":"PASS"');
    expect(result.provision).toMatchObject({
      pinnedVersion: bundle.version,
      reportedVersion: bundle.version,
      bundleContentSha256: bundle.hash,
      entry: bundle.entry,
    });
    expect(result.provision?.entryContentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(result.sessionDir)).toBe(false);
    expect(hashBundle(bundle.dir)).toBe(bundle.hash); // source bundle was read, never mutated
  });

  it("fails closed on content or version drift", () => {
    const root = temp("r2-drift-");
    const bundle = fixtureBundle(root);
    const compiled = compile({ posture: "floor", harness: "claude", skills: [], prompt: "Q", jsonOutput: true });
    expect(() => exec(compiled, {
      harnessBundle: { sourceDir: bundle.dir, entry: bundle.entry, pinnedVersion: bundle.version, contentSha256: "0".repeat(64) },
    })).toThrow(/hash mismatch/);
    expect(() => exec(compiled, {
      harnessBundle: { sourceDir: bundle.dir, entry: bundle.entry, pinnedVersion: "fixture-harness 9.9.9", contentSha256: bundle.hash },
    })).toThrow(/version mismatch/);
  });

  it("hashes paths and bytes deterministically and detects changed content", () => {
    const root = temp("r2-hash-");
    const bundle = fixtureBundle(root);
    expect(hashBundle(bundle.dir)).toBe(bundle.hash);
    writeFileSync(join(bundle.dir, "manifest.txt"), "changed\n");
    expect(hashBundle(bundle.dir)).not.toBe(bundle.hash);
  });

  it("accepts a safe entry through a symlinked parent while rejecting symlink escapes", () => {
    const root = temp("r2-symlink-");
    const aliasRoot = temp("r2-symlink-alias-");
    const bundle = fixtureBundle(root);
    symlinkSync("fixture-harness", join(bundle.dir, "bin", "alias"));
    const hashWithInternalLink = hashBundle(bundle.dir);
    const linkedParent = join(aliasRoot, "linked-parent");
    symlinkSync(root, linkedParent);
    const aliasedBundleDir = join(linkedParent, "clean-harness-install");
    const compiled = compile({ posture: "floor", harness: "claude", skills: [], prompt: "Q", jsonOutput: true });
    expect(exec(compiled, {
      harnessBundle: {
        sourceDir: aliasedBundleDir,
        entry: "bin/alias",
        pinnedVersion: bundle.version,
        contentSha256: hashWithInternalLink,
      },
    }).status).toBe(0);

    const outside = join(root, "outside");
    writeFileSync(outside, "#!/usr/bin/env sh\n");
    symlinkSync("../../outside", join(bundle.dir, "bin", "escape"));
    expect(() => exec(compiled, {
      harnessBundle: {
        sourceDir: aliasedBundleDir,
        entry: "bin/escape",
        pinnedVersion: bundle.version,
        contentSha256: hashWithInternalLink,
      },
    })).toThrow(/resolves outside/);
    expect(() => hashBundle(bundle.dir)).toThrow(/symlink escapes/);
  });
});

describe("R2 record + structured companion receipt", () => {
  it("records a summon rung, exact skill hash, pinned harness, and no new ledger fields", () => {
    const root = temp("r2-receipt-");
    const bundle = fixtureBundle(root);
    const recordOut = join(root, "run.jsonl");
    const receiptOut = join(root, "run.receipt.json");
    const skill = join(import.meta.dirname, "fixtures", "impeccable-skill");
    const beforeBundle = hashBundle(bundle.dir);

    const status = main([
      "--posture", "product-floor", "--harness", "claude",
      "--record", "-p", "return PASS", "--benchmark-id", "hh-r2-fixture", "--task", "fixture-task",
      "--arm", "hell", "--rung", "high", "--repeat", "2", "--endpoint-regex", "^PASS$",
      "--record-skill", skill,
      ...recordFlags(bundle, recordOut, receiptOut),
    ]);
    expect(status).toBe(0);

    const record = JSON.parse(readFileSync(recordOut, "utf8")) as LedgerRecord;
    const receipt = JSON.parse(readFileSync(receiptOut, "utf8")) as RunReceipt;
    validateRecord(record);
    expect(record.arm).toBe("hell");
    expect(record).not.toHaveProperty("rung");
    expect(record.notes).toMatch(/^rung=high\./);
    expect(record.skillsLoaded).toEqual([
      { id: "impeccable", contentSha256: "14c4642368557af1f7bbaaac0aa184b791e6d70665dfd8fc53d8d4124f81abb8" },
    ]);
    expect(record.tokens.skillStanding).toBe(227);
    expect(record.tokens.skillInvocation).toBeNull();

    expect(receipt.schema).toBe(RUN_RECEIPT_SCHEMA);
    expect(receipt.coordinate).toEqual({
      rung: "high", posture: "product-floor", floor: "product", activation: "summon",
    });
    expect(receipt.ledger.recordSha256).toBe(sha256Json(record));
    expect(receipt.harness).toMatchObject({
      pinnedVersion: bundle.version,
      reportedVersion: bundle.version,
      bundleContentSha256: bundle.hash,
    });
    expect(receipt.skillsLoaded).toEqual(record.skillsLoaded);
    expect(receipt.sandbox).toEqual({
      provisioning: "copied-pinned-bundle", disposable: true, sharedStateMutation: false, keptTemp: false,
    });
    expect(hashBundle(bundle.dir)).toBe(beforeBundle);
  });

  it("writes nothing when the pinned bundle hash is wrong", () => {
    const root = temp("r2-negative-");
    const bundle = fixtureBundle(root);
    const recordOut = join(root, "run.jsonl");
    const receiptOut = join(root, "run.receipt.json");
    const flags = recordFlags(bundle, recordOut, receiptOut);
    flags[flags.indexOf("--harness-sha256") + 1] = "f".repeat(64);
    expect(() => main([
      "--record", "-p", "Q", "--benchmark-id", "b", "--task", "t",
      "--arm", "placebo", "--rung", "benchmark-floor", ...flags,
    ])).toThrow(/hash mismatch/);
    expect(existsSync(recordOut)).toBe(false);
    expect(existsSync(receiptOut)).toBe(false);
  });
});
