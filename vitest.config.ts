import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Agent worktrees are full checkouts of this repo living under
    // `.claude/worktrees/`. Without this, vitest discovers their test files too
    // and runs every suite twice — against a working copy that is mid-edit.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**", "packages/site/**"],
    testTimeout: 20000,
  },
});
