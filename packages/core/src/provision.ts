// R2/B5 harness provisioning. A benchmark run never executes the caller's
// shared/global harness installation directly: it copies a caller-prepared,
// pinned bundle into the disposable session and verifies the copy byte-for-byte.

import { createHash } from "node:crypto";
import { cpSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface HarnessBundlePin {
  sourceDir: string;
  entry: string;
  pinnedVersion: string;
  contentSha256: string;
}

export interface ProvisionedHarness {
  command: string;
  entry: string;
  bundleContentSha256: string;
  entryContentSha256: string;
}

function assertHash(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a lowercase 64-hex sha256`);
}

function safeEntry(root: string, entry: string): string {
  if (!entry || isAbsolute(entry)) throw new Error("--harness-entry must be a non-empty path relative to --harness-bundle");
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, entry);
  const lexicalRelative = relative(absoluteRoot, target);
  if (!lexicalRelative || lexicalRelative === ".." || lexicalRelative.startsWith(`..${sep}`) || isAbsolute(lexicalRelative)) {
    throw new Error("--harness-entry must stay inside --harness-bundle");
  }
  const realRoot = realpathSync(absoluteRoot);
  const realTarget = realpathSync(target);
  const realRelative = relative(realRoot, realTarget);
  if (!realRelative || realRelative === ".." || realRelative.startsWith(`..${sep}`) || isAbsolute(realRelative)) {
    throw new Error("--harness-entry resolves outside --harness-bundle");
  }
  if (!statSync(target).isFile()) throw new Error(`--harness-entry is not a regular file: ${entry}`);
  return target;
}

/** Deterministic tree hash: sorted relative path, NUL, file bytes, NUL. */
export function hashBundle(root: string): string {
  const absolute = resolve(root);
  if (!lstatSync(absolute).isDirectory()) throw new Error(`harness bundle is not a directory: ${root}`);
  const hash = createHash("sha256");
  let files = 0;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(path);
        const resolvedTarget = resolve(dir, target);
        const prefix = absolute + sep;
        if (isAbsolute(target) || !resolvedTarget.startsWith(prefix)) {
          throw new Error(`harness bundle symlink escapes the bundle: ${relative(absolute, path)}`);
        }
        hash.update("symlink\0");
        hash.update(relative(absolute, path).split(sep).join("/"));
        hash.update("\0");
        hash.update(target);
        hash.update("\0");
        files++;
      } else if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) {
        hash.update(relative(absolute, path).split(sep).join("/"));
        hash.update("\0");
        hash.update(readFileSync(path));
        hash.update("\0");
        files++;
      } else {
        throw new Error(`harness bundle contains unsupported entry: ${relative(absolute, path)}`);
      }
    }
  };
  walk(absolute);
  if (files === 0) throw new Error("harness bundle must contain at least one regular file");
  return hash.digest("hex");
}

export function validateBundlePin(pin: HarnessBundlePin): void {
  if (!isAbsolute(pin.sourceDir)) throw new Error("--harness-bundle must be an absolute path to an isolated install bundle");
  if (!pin.pinnedVersion) throw new Error("--harness-version must be non-empty");
  assertHash(pin.contentSha256, "--harness-sha256");
  safeEntry(pin.sourceDir, pin.entry);
}

export function provisionHarness(pin: HarnessBundlePin, sessionDir: string): ProvisionedHarness {
  validateBundlePin(pin);
  const sourceHash = hashBundle(pin.sourceDir);
  if (sourceHash !== pin.contentSha256) {
    throw new Error(`harness bundle hash mismatch: pinned ${pin.contentSha256}, observed ${sourceHash}`);
  }

  const destination = join(sessionDir, "harness-bundle");
  cpSync(pin.sourceDir, destination, { recursive: true, errorOnExist: true, verbatimSymlinks: true });
  const copiedHash = hashBundle(destination);
  if (copiedHash !== sourceHash) throw new Error("harness bundle changed while copying into the disposable sandbox");

  const command = safeEntry(destination, pin.entry);
  return {
    command,
    entry: pin.entry,
    bundleContentSha256: copiedHash,
    entryContentSha256: createHash("sha256").update(readFileSync(command)).digest("hex"),
  };
}
