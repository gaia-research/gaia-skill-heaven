// KC1 (Issue #8): "claude-heaven installs cleanly from the marketplace,
// verified from a fresh environment."
//
// .claude-plugin/marketplace.json declares this plugin's `source` as
// `./packages/claude-heaven/plugin` — a marketplace install copies ONLY that
// directory. This wraps scripts/verify-marketplace-install.mjs, which does
// the actual work: copy `plugin/` into a clean temp dir with no repo and no
// node_modules beside it, then prove the shipped command file resolves its
// script path and that the script renders the real posture block standalone.
//
// This is a process-level integration check (it copies files, spawns a real
// `node` child, and reads real stdout), not a unit test — that is the point.
// A negative control ("the child didn't throw") is not enough; the assertions
// below are on the actual rendered content, mirroring what the script itself
// checks internally.

import { describe, expect, it } from "vitest";
import { verifyMarketplaceInstall } from "../scripts/verify-marketplace-install.mjs";

describe("KC1: marketplace install, verified from a fresh environment", () => {
  it("passes every check when the plugin dir is copied in isolation and run standalone", () => {
    const lines: string[] = [];
    const { ok, failures } = verifyMarketplaceInstall((msg: string) => lines.push(msg));

    if (!ok) {
      // Surface the full transcript (including the real stdout dump from the
      // standalone run) on failure so a CI log shows exactly what broke.
      console.error(lines.join("\n"));
    }

    expect(failures).toEqual([]);
    expect(ok).toBe(true);
  });
});
