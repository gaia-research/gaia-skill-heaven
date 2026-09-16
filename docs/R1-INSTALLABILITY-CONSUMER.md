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
- The shared CLI/MCP constructor accepts `SKILL_SUMMON_INSTALLABILITY` as a
  local JSON path, `file:` URL, or explicit HTTP(S) URL. Unset remains
  `not-configured`, with no projection I/O and no URL-shape filtering. HTTP(S)
  explicitly opts into fetching that projection; redirects are refused.
  Invalid configuration and load failures degrade to disclosed unknown.
- The configured path applies only to the pinned canonical Tree corpus. It
  proves canonical content against the candidate revision's identity artifact,
  not against the observation itself. That artifact now records explicit null
  routes for canonical source-less records; absence alone is never a negative.
  Remote revisions are supplied only by immutable candidate routes, never by
  copying an observation's resolved revision. Mutable routes stay unverified
  whenever a remote revision is required. Fleet/private sources inherit nothing.
- `GaiaServiceOptions.installabilityAdapter` remains the embedding seam.

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
  file, or explicit HTTP adapter and strict offline projection parser. File
  sources reject symlinked physical components; HTTP sources reject redirects
  and disclose the verified final URL.
- `packages/skill-summon/src/service.ts` applies the adapter best-effort after
  index resolution; it never makes optional evidence a summon prerequisite.
- `packages/skill-summon/src/summon/*` and MCP output preserve/disclose the
  assessment on previews, installed skills, cards, and filtered reasons.

No upstream Arbor field, admission floor, band, margin, corpus, label,
expansion, or installer/door policy is changed by this integration. The shared
configuration and source-less identity tests were added in subsequent
integrated runtime work and are not part of the historical verification below.
That work has its own final-head review and Linux/integrated-CI gates; this
record does not imply those gates passed.

## Historical R1 verification (implementation head `7601d86a4d45f58d65e26640ab2305762512d544`)

The commands and results in this section are the R1 record at that head. They
must not be read as verification of later integrated runtime heads.

- `npx vitest run packages/skill-summon/test/installability.test.ts`
- `npx vitest run packages/core/test/retrieval-index.test.ts packages/core/test/retrieval-decide.test.ts packages/skill-summon/test/summon-index.test.ts packages/skill-summon/test/index-parity.test.ts`
- `npm run typecheck`
- `npm run build:mcp`
- `npm test`

The focused R1 tests exercise the production adapter, service, `summon`
preview/public output, filtered output, suite handling, and fleet routing. They
cover exact materializable evidence, semantic provenance/ref/state validation,
source/id/content/revision mismatch, malformed/absent/operational artifacts,
unknown timeout evidence, scoped no-source and intrinsic negatives,
delivered-content/comparator difference, explicit fleet/private/unknown
sources, symlinked parents, redirect rejection, runtime stats, and offline
no-match behavior. The historical full-suite result at R1 head
`7601d86a4d45f58d65e26640ab2305762512d544` was 53 files and 672 tests; this is
not a timeless or final-head pass claim. The focused R1 file had 23 tests at
this historical head. The deterministic index check and MCP bundle rebuild
also passed there; the site production build also passed there. Later
integration checks and any final-head review remain separate.
