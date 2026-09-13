import { assertArborIdentityContext, type ArborIdentityContext } from "../../src/arbor/identity.js";

/** Capture time records the original capture, not a source-derived freshness key. */
export function identityArtifactIsCurrent(expected: ArborIdentityContext, serialized: string): boolean {
  try {
    const recorded: unknown = JSON.parse(serialized);
    assertArborIdentityContext(recorded);
    return serialized === `${JSON.stringify({ ...expected, capturedAt: recorded.capturedAt }, null, 2)}\n`;
  } catch {
    return false;
  }
}
