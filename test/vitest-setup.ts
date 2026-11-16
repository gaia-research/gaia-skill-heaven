import { afterEach, beforeEach } from "vitest";

import { scrubInheritedSessionEnv } from "./hermetic-session-env.js";

// Scrub at setup evaluation time (before test modules load) so module-level
// snapshots in test files never capture the caller's inherited values.
scrubInheritedSessionEnv();

beforeEach(() => {
  scrubInheritedSessionEnv();
});

afterEach(() => {
  scrubInheritedSessionEnv();
});
