# R1 installability consumer evidence

This slice consumes the Tree-owned `gaia.installability/v1` projection. It does
not run the Tree parity operator, probe a URL, resolve a branch, or turn a
comparator result into materializability.

## Contract and scope

- Tree compatibility source: read-only pin `fb6a79700062b7addab3d9e05450316050d96e0b`.
- Publication fixture: `docs/graph/installability/index.json` at that pin. The
  checked-in test fixture is the exact published record for `garrytan/health`,
  whose state is `unknown/not-observed`; it is not a new observation.
- Heaven base: `51a22fc9a4940748b5475d9f36a697820da7927d`.
- Research read-only pin: `a4d64647bb783f77ff035ccdf866629bad8eeeee`.
- Only an exact `id`, source route, current `SKILL.md` hash, and resolved source
  revision make an upstream record applicable. The runtime does not invent the
  missing content/version context from a URL or mutable branch.
- A missing, stale, malformed, operational, ambiguous, fleet, or otherwise
  unverified record is effective `unknown`. Only verified upstream
  `not-materializable` evidence can withhold, and only for its published
  scoped reason (`no-source` or `intrinsic-content-failure`). Explicit
  registry-only refusal remains its separate existing guard.
- The optional adapter is opt-in. Without it, production summon decorates the
  index with explicit unknown assessments and does not use URL shape to filter.
  An adapter failure degrades to the same unknown path and is disclosed in the
  public ranking output. Explicit GitHub fleet candidates do not inherit Tree
  evidence.

The projection intentionally omits the observation comparator and some
operator context. A verified `materializable` projection record therefore
remains materializable even when its delivered-content digest differs from the
separate comparator result; parity PASS is not used as an admission decision.
The consumer preserves the upstream record and observation digest in its local
assessment envelope.

## Production touchpoints

- `packages/core/src/retrieval/installability.ts` owns the dependency-free
  contract types, exact applicability checks, unknown handling, and index
  assessment application.
- `packages/core/src/retrieval/build-index.ts` / `schema.ts` / `decide.ts`
  carry assessments without scoring them and withhold only verified negatives.
- `packages/skill-summon/src/data/installability.ts` is the optional static,
  file, or explicit HTTP adapter and strict offline projection parser.
- `packages/skill-summon/src/service.ts` applies the adapter best-effort after
  index resolution; it never makes optional evidence a summon prerequisite.
- `packages/skill-summon/src/summon/*` and MCP output preserve/disclose the
  assessment on previews, installed skills, cards, and filtered reasons.

No Arbor field, ranking field, admission floor, band, margin, corpus, label,
expansion, or installer/door policy was changed.

## Verification

- `npx vitest run packages/skill-summon/test/installability.test.ts`
- `npx vitest run packages/core/test/retrieval-index.test.ts packages/core/test/retrieval-decide.test.ts packages/skill-summon/test/summon-index.test.ts packages/skill-summon/test/index-parity.test.ts`
- `npm run typecheck`
- `npm run build:mcp`
- `npm test`

The focused R1 tests exercise the production adapter, service, `summon`
preview/public output, filtered output, suite handling, and fleet routing. They
cover exact materializable evidence, source/id/content/revision mismatch,
malformed/absent/operational artifacts, unknown timeout evidence, scoped
no-source and intrinsic negatives, delivered-content/comparator difference,
explicit fleet skills, and offline no-match behavior. The final full suite
passes: 53 files, 665 tests. The deterministic index check and MCP bundle
rebuild also pass; the site production build passes.
