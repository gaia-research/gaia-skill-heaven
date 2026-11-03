#!/usr/bin/env node
// Bundles the skill-summon MCP server into the plugin so an installed user
// needs no npx, no sibling `gaia-skill-heaven` checkout, and no external
// binary — just plain `node` on the already-copied plugin directory.
//
// Source:  packages/skill-summon/src/bin/skill-summon-mcp.ts
// Output:  plugins/skill-heaven/mcp/skill-summon.mjs  (COMMITTED to git)
//
// @modelcontextprotocol/sdk and zod are devDependencies of packages/skill-summon
// (this repo carries zero RUNTIME dependencies — see root CLAUDE.md), so they
// are bundled IN, not left external. Node builtins stay external — esbuild
// does this automatically under platform:"node", and this script asserts it
// held rather than trusting the default silently.
//
// Rebuild with: npm run build:mcp
// CI fails the build if the committed output drifts from a fresh rebuild
// (.github/workflows/ci.yml — "MCP bundle is up to date").

import { build } from "esbuild";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const entry = join(repoRoot, "packages/skill-summon/src/bin/skill-summon-mcp.ts");
const outfile = join(repoRoot, "plugins/skill-heaven/mcp/skill-summon.mjs");
const sdkUriTemplate = join(
  repoRoot,
  "node_modules/@modelcontextprotocol/sdk/dist/esm/shared/uriTemplate.js",
);

// SDK 1.29.0's RFC 6570 helper removes the exploded-variable marker with
// String#replace, which CodeQL correctly rejects for uncontrolled template
// input. Patch only that pinned module at the bundle boundary. This does not
// mutate node_modules and fails closed if the pinned source changes, so an SDK
// upgrade cannot silently drop the hardening or change semantics unnoticed.
let sdkUriTemplateHardeningApplied = false;
const sdkUriTemplateHardening = {
  name: "sdk-uri-template-hardening",
  /** @param {import("esbuild").PluginBuild} buildContext */
  setup(buildContext) {
    buildContext.onLoad(
      { filter: /uriTemplate\.(?:js|ts)$/ },
      /** @param {import("esbuild").OnLoadArgs} args */
      (args) => {
        if (args.path !== sdkUriTemplate) return undefined;
        const source = readFileSync(args.path, "utf8");
        const vulnerable = "name.replace('*', '')";
        const occurrences = source.split(vulnerable).length - 1;
        if (occurrences !== 2) {
          throw new Error(
            `Expected exactly two SDK UriTemplate marker removals; found ${occurrences}. Review the pinned SDK before rebuilding.`,
          );
        }
        sdkUriTemplateHardeningApplied = true;
        return {
          contents: source.replaceAll(vulnerable, "name.replaceAll('*', '')"),
          loader: "js",
        };
      },
    );
  },
};

const sdkVersion = JSON.parse(
  readFileSync(
    join(repoRoot, "node_modules/@modelcontextprotocol/sdk/package.json"),
    "utf8",
  ),
).version;
if (sdkVersion !== "1.29.0") {
  throw new Error(
    `The SDK UriTemplate hardening is pinned to @modelcontextprotocol/sdk 1.29.0; found ${sdkVersion}. Review and update the build boundary first.`,
  );
}

const esbuildVersion = JSON.parse(
  readFileSync(join(repoRoot, "node_modules/esbuild/package.json"), "utf8"),
).version;

const banner = `// GENERATED FILE — do not hand-edit.
// Source:  packages/skill-summon/src/bin/skill-summon-mcp.ts
// Rebuild: npm run build:mcp   (esbuild ${esbuildVersion}, pinned exact in root package.json)
//
// Bundled in (no runtime deps required once installed): @modelcontextprotocol/sdk, zod.
// Node builtins stay external — this file runs on plain \`node\`, no node_modules needed.
`;

mkdirSync(dirname(outfile), { recursive: true });

const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  banner: { js: banner },
  logLevel: "info",
  metafile: true,
  write: false,
  plugins: [sdkUriTemplateHardening],
});

if (!sdkUriTemplateHardeningApplied) {
  throw new Error(
    `SDK UriTemplate hardening did not run for ${sdkUriTemplate}; refuse to emit an unpatched bundle.`,
  );
}

// Guard: fail loudly if anything bare (a bundled dependency's own import of a
// node builtin, or a stray package) slipped through as an external instead of
// being inlined — the whole point of this bundle is that it needs nothing
// beside it.
const NODE_BUILTIN = /^(?:node:)?(?:assert|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib)(?:\/.*)?$/;

for (const output of Object.values(result.metafile.outputs)) {
  for (const imp of output.imports) {
    if (imp.external && !NODE_BUILTIN.test(imp.path)) {
      throw new Error(
        `build:mcp produced a non-builtin external import "${imp.path}" — it must be bundled in, not left as a runtime dependency.`,
      );
    }
  }
}

const bundledOutput = result.outputFiles?.find((file) => file.path === outfile);
if (!bundledOutput) {
  throw new Error(`esbuild did not produce the expected MCP bundle: ${outfile}`);
}
writeFileSync(outfile, bundledOutput.contents);

process.stdout.write(`Bundled ${entry}\n  -> ${outfile}\n`);
