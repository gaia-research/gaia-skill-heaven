# U0b — one-time advisor-astra design consultation

Founder-directed single consultation, 2026-11-16. Exactly one advisor-astra spawn; no /advisor command or other advisor was launched.

Actual persisted assistant route: `openai/gpt-6-astra`; requested and persisted effort `xhigh`; native Pi `advisor-astra`, read-only explore profile, empty tools, no fallback. Session `01a1e2f2` completed without tool calls. This is advice over a self-contained packet, not code inspection or test verification.

Implementation was already in progress before the founder directive; further implementation paused for this consultation. Adopted decisions and remaining implementation work are recorded in the handoff before repair resumes.

## Verbatim advice

## Decision
**Keep the validated random `mkdtemp` roots and bounded, advisory temp-sidecar index; remove all automatic request-path scans, and make only the ownership, shutdown-pruning, and failure-ordering corrections below where needed.**

## Reasoning
- **This preserves existing materialized paths.** Deterministic hashed session-root names complicate same-ID live instances and legacy roots without eliminating ownership checks. Moving or renaming roots would jeopardize stable paths. Hashing the *locator key*, not the session root, is the simplest fit.
- **Keep the shortlist of 16 and 64 KiB bound.** Neither constant is special, but both are reasonable and already implemented. A single-root pointer loses useful discoverability whenever another same-ID instance registers. Deduplicate entries, retain the newly registered root, and evict only locator references—not roots or campaign state.
- **The sidecar is a hint, never authority.** Its hash, ordering, timestamps, or presence cannot establish identity, ownership, deadness, campaign validity, or retention eligibility.
- **Both scans must stay off the hot path.** Removing only `openSession()` enumeration would leave the request-path reaper problem intact. First automatic summon should inspect only bounded nominated candidates; cached calls should remain pinned without rediscovery. Manual list/attach/GC may enumerate.
- **Best-effort discovery is the appropriate trade-off.** Missing, malformed, inaccessible, or unindexed metadata means fresh-root fallback—not a scan. This assumes automatic recovery of every historical root is not guaranteed, which is already implicit in the proposed bounded index.

For automatic reattachment, retain the complete acceptance chain:

1. Physical disposable-root validation: non-symlink real directory, correct prefix, direct real child of the caller’s real temp root.
2. Confined manifest access and exact recorded harness-ID equality.
3. Valid PID with `kill(pid, 0)` returning **ESRCH**; live, EPERM, malformed, and uncertain outcomes are not dead.
4. Confined campaign access and successful trace folding/verification.
5. Successful authoritative owner commit before exposing the session.

The environment ID remains data, never a path. Do not infer another ID or campaign on a miss. Preserve the existing no-ID and explicit `SKILL_SUMMON_SESSION` behavior under their existing validation rules.

## Risks

### Must fix or explicitly verify

**1. Unlocked index updates and unlocked adoption are different issues.**

Cross-process index read/modify/write races can lose references. That is acceptable for a best-effort locator: it hurts discoverability, not authority.

But two processes reading the same dead owner and both committing ownership would violate the stated distinct-live-instance requirement. “No cross-process race-free adoption claim” does not resolve that conflict.

Reuse any existing ownership exclusion. Otherwise, the smallest practical fence is a **nonblocking, exclusive per-root claim**:

- Perform preliminary root/ID/dead-PID checks before modifying a candidate.
- Acquire the claim, then re-read and revalidate authoritative state.
- Hold it through campaign verification and successful owner commit.
- A contender skips that root; it does not wait indefinitely or scan elsewhere.
- Destructive GC must use the same exclusion and revalidate before deletion.

A private exclusive-create claim file is sufficient for this lane **if crash-left claims conservatively block automatic adoption until explicit maintenance**. Do not introduce unsafe stale-lock breaking merely to recover availability. The claim provides exclusion, not live authority.

**2. Closing a server must not erase its preserved root’s locator.**

The proposed “close/manualGC prune entries” needs qualification:

- `SIGINT` and `server.close()` must not delete the root.
- Closing alone must not remove its valid locator reference; otherwise normal shutdown defeats later stable-ID resume.
- Prune references to definitively absent/deleted roots, or apply the bounded shortlist’s normal eviction policy.
- Do not equate dead PID, closed connection, index age, or shortlist eviction with retention expiry.

**3. Keep metadata failure handling narrowly scoped.**

Only index publication/update is best-effort. Publish after the session’s authoritative manifest/owner commit succeeds.

Do **not** swallow campaign verification, manifest commit, or owner-commit failures as “index unavailable.” Once an eligible candidate is selected, a corrupted trace must produce **FAILED_SAFE**, not silently try another root or return a fresh successful session.

A failed index write must not invalidate an otherwise successful session or poison its cached promise. Conversely, a successful index write cannot rescue an unsuccessful owner commit.

**4. Preserve retention semantics independently of discovery.**

- Use the person’s verified, folded charter `sessionRetention`; add no compiled pause default.
- Keep the first-dead-observation boundary bound to the PID **and owner record**, not merely a pathname or PID.
- Reset it only following successful owner commit—not lookup, index rewrite, close, attempted adoption, or failed verification.
- Uncertain verification/I/O preserves the root.
- Index presence or absence must never determine retention.

A GC dry-run must write **nothing**: no claim files, index initialization/pruning, death markers, or repairs. Its result is a read-only preview; real deletion must reacquire exclusion and revalidate.

**5. Do not weaken the filesystem checks while simplifying.**

Keep the described private-directory, ownership, regular-file, no-follow, size, and confinement checks. Reject lexically invalid candidate paths before filesystem inspection. Validate the opened index file and bound the actual read; a size check followed by an unrestricted read is weaker.

`O_NOFOLLOW` on a final component alone does not protect intermediate components, and `realpath()` alone does not enforce symlink refusal. Keep `assertConfinedPath` for every manifest/campaign content path.

Private directories and careful opens address cross-user interference; they do not authenticate against the explicitly excluded same-user arbitrary rewrite threat. Ordinary cooperating-process adoption/GC races still need the exclusion above.

### Acceptable limitations—not reasons to expand this lane

- **Lost index updates, shortlist eviction, or unavailable metadata:** fresh root, preserved old root, explicit recovery available.
- **Legacy unindexed roots:** explicit attachment/backfill only; no automatic migration scan.
- **PID reuse:** an unrelated live process holding the recorded PID blocks automatic adoption. Accept the false negative; do not infer death from age, trace state, or index metadata.
- **Crash-left claim:** conservative preservation and manual recovery. Race-safe automatic reclamation can be future work.
- **No background reaper:** roots can accumulate until explicit GC. Do not restore request-path enumeration to compensate.
- **Performance:** bounded application-level filesystem work is the guarantee, not identical latency across machines or filesystems.

Retain the isolated-temp test setup, caller-sentinel protection, first/cached MCP bounded-work tests, and existing security/fault tests. If not already covered, add focused cases for simultaneous adoption, adoption versus GC, close-then-resume discoverability, and dry-run making zero writes. No broader redesign is necessary.

## Confidence
**High** in this design recommendation. Confidence in the implementation would increase with confirmation of its cross-process owner-commit exclusion, close-pruning behavior, and retention/FAILED_SAFE ordering. This assessment is based solely on the supplied brief; it does not claim code inspection or test verification.
