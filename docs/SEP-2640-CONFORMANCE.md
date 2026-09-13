# MCP Skills extension conformance

This package implements the isolated **Lane X** MCP Skills resource surface. It
is deliberately not a claim that the extension is part of the ratified core MCP
specification.

## Pinned authority and status

The original implemented target was the stable extension rendering at
[`modelcontextprotocol/ext-skills/specification/stable/skills.mdx`](https://github.com/modelcontextprotocol/ext-skills/blob/f1f8605b72274e8ab667b72194103fe8096e9552/specification/stable/skills.mdx),
resolved on 2026-09-07 to file blob `e632647186f99caf0b47cc692839fa4d7f06642f`.
That source identifies the extension as `io.modelcontextprotocol/skills` and
requires `skills/list`, `skills/get`, and standard `resources/read`.

The corresponding upstream proposal,
[modelcontextprotocol/modelcontextprotocol#2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640),
was open and not merged at the pinned check. Its accepted head was
`d6b31a03504c15677d49b922b6b6ace0ef65728d`. Therefore this implementation says
**SEP-2640 conformance target: accepted proposal / stable extension rendering**,
not **ratified MCP support**. Re-check both references before changing the
claim or upgrading the implementation.

## Current revision: partial compatibility, not conformance

The follow-up target is commit
[`d866efdba298b55b8156c7b7aa1bdebc1b625f4c`](https://github.com/modelcontextprotocol/ext-skills/blob/d866efdba298b55b8156c7b7aa1bdebc1b625f4c/specification/stable/skills.mdx),
file blob `e65b881c7440a7720acedbac000113d4946be08f`. It explicitly requires
base MCP **2026-07-28 or later** and cacheable-result fields on both
`skills/list` and `skills/get`.

The cache fields are implemented, but **the pinned SDK does not support that
base protocol**. Raw JSON-RPC initialization against both the production server
and regenerated stdio bundle gives:

| Requested protocol | Returned protocol |
| --- | --- |
| `2025-11-25` | `2025-11-25` |
| `2026-07-28` | `2025-11-25` |

This is an explicit compatibility limit, not successful 2026 negotiation. The
existing extension advertisement and legacy methods are preserved for compatible
clients; clients requiring the new base cannot treat them as current-extension
conformance. No protocol version is forged and no SDK upgrade is hidden in this
patch. The raw initialization regression in `mcp-skills.test.ts` deliberately
pins the observed result so an SDK upgrade requires re-evaluation.

Finishing current-revision conformance requires a separately reviewed base
protocol implementation/SDK upgrade, negotiated wire probes, and regression
coverage for resources, caching and existing tool behavior. Adding the missing
cache fields alone does not close that gate.

### Exact SDK 1.30.0 follow-up probe (2026-09-13)

An isolated install of `@modelcontextprotocol/sdk@1.30.0` under Node
`v22.23.1` was probed without changing the product dependency or bundle.
Its published integrity was
`sha512-xKd8OIzlqNzcqcNumGAa6g+PW2kjD5vrpcKOnfldAUPP3j7lnqMPwlTXQm8gF+UwH72z0lqaRbjr9hqGz0eITA==`.
It exports `LATEST_PROTOCOL_VERSION = "2025-11-25"`; its supported-version
list does not contain `2026-07-28`. An actual `initialize` request for
`2026-07-28` over linked `InMemoryTransport` instances to its `Server`
returned `2025-11-25`.

This is an SDK-only negotiation result, not a full product compatibility
pass. **Upgrading to 1.30.0 alone cannot close the protocol-base gate**, so
no product upgrade was made. The product remains pinned to 1.29.0.

## Supported surface

The package is pinned to `@modelcontextprotocol/sdk@1.29.0`. That SDK does not
ship typed SEP-2640 methods or the newer cache-result fields, so this lane uses
its underlying `Server` request-handler API and emits the extension fields as
wire-level JSON. Its RFC 6570 helper also uses an unsafe single-marker
`String#replace`; `scripts/build-mcp.mjs` applies a fail-closed, exact-source
hardening transform at the bundle boundary without mutating `node_modules`.
The committed bundle includes the SDK and remains dependency free at install
time.

- The server advertises `io.modelcontextprotocol/skills` and the mandatory
  `skills/list` and `skills/get` methods.
- `skills/list` and `skills/get` return only entries with preserved,
  authoritative frontmatter, a `skill://.../SKILL.md` URI, and either a
  validated digest/size manifest or an explicit `resources: "dynamic"`
  declaration. Listing is deterministic and cursor-paginated.
- `resources/read` serves `SKILL.md` and supporting files in the same
  `skill://` namespace. A resource template is advertised as
  `skill://{+resourcePath}`. Static manifests also appear in `resources/list`;
  dynamic entries remain readable without being preloaded or enumerated.
- `skills/list`, `skills/get`, `resources/list` and `resources/read` responses
  include `resultType: "complete"`, `ttlMs: 0`, and `cacheScope: "private"`. TTL is zero because
  registry branches can change between reads. Public resource metadata carries
  MIME types and assistant-facing annotations; the content itself stays
  unannotated.
- Successful `summon` results include MCP `resource_link` blocks for each
  materialized `SKILL.md`, with source URL and content digest in the disclosure.

## Deferred or intentionally absent

- Directory reads are not enabled. The implementation exposes file resources;
  directory enumeration is deferred until the source can provide a trustworthy
  manifest without fetching every body.
- Tree projections from older registries may preserve only top-level `name` and
  `description`. Those entries are omitted from this resource surface rather
  than receiving fabricated frontmatter or a URI based on a registry alias.
  Entries are also omitted when the existing installability refusal applies or
  the source route is not one this reader can prove. Fleet retrieval retains
  its legacy scalar extraction for naming, descriptions, and invocation
  routing, but protocol metadata is attached only for a separately verified
  flat scalar subset. Nested maps/arrays, quoted or multiline values, duplicate
  keys, aliases/tags, and other unsupported YAML are omitted rather than
  flattened or stringified.
- No historical `skill://index.json` resource is exposed. The extension's
  `skills/list` method is the discovery authority.
- No Arbor schema, Reach index/data model, stamp-gated routing, or pending Reach
  work is part of this lane.

## Security boundary

Resource URI parsing is an allowlist, not a path sanitizer after the fact. It
rejects non-`skill:` schemes, credentials, query/fragment components, encoded
slash/dot/backslash escapes, empty segments, traversal segments, and unknown
skill roots before invoking a reader. Remote reads accept only the existing
GitHub source route, resolve a commit, clone into a disposable session-scoped temp directory, confine the source
subpath and requested relative path, reject symlinks and non-regular files, and
enforce a 16 MiB read bound. Discovery performs no body
fetch and no materialization. Resource content is untrusted data; it is never
executed and never written to the user's agent configuration.

The URI/resource-link shape is a selective carry of the useful resource work in
`5b45be1`; that commit was not cherry-picked wholesale, and its older index
surface and unrelated semantics are intentionally not carried forward.
