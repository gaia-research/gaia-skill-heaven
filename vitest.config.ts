import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Agent worktrees are full checkouts of this repo living under
    // `.claude/worktrees/`. Without this, vitest discovers their test files too
    // and runs every suite twice — against a working copy that is mid-edit.
    //
    // `plugins/skill-heaven-console/**` is a Claude Code mod. Its tests import
    // `claude-code/testing` and only run under the engine:
    // `claude plugin test plugins/skill-heaven-console`.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**", "packages/site/**", "plugins/skill-heaven-console/**"],
    testTimeout: 20000,
  },
});
