import { afterAll, afterEach, beforeEach } from "vitest";

import {
  cleanupWorkerTempNamespace,
  ensureActiveWorkerTempNamespace,
  establishWorkerTempNamespace,
  scrubInheritedSessionEnv,
} from "./hermetic-session-env.js";

// Establish the worker/file-owned temp namespace and scrub inherited session
// variables at setup evaluation time (before test modules load) so module-level
// snapshots in test files never capture the caller's OS tmpdir or session IDs.
scrubInheritedSessionEnv();
establishWorkerTempNamespace();

beforeEach(() => {
  scrubInheritedSessionEnv();
  ensureActiveWorkerTempNamespace();
});

afterEach(() => {
  scrubInheritedSessionEnv();
  ensureActiveWorkerTempNamespace();
});

afterAll(() => {
  scrubInheritedSessionEnv();
  cleanupWorkerTempNamespace();
});
