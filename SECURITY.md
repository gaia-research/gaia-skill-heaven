# Security

Skill Heaven distributes installers, launchers, an Agent Plugin, skills, and MCP configuration across multiple agent harnesses. That makes installation and runtime composition a software supply-chain boundary.

The core rule is:

> **A skill or plugin can contribute context and tools only through the permissions the user and host already allow. It cannot manufacture authority.**

## Trust model

Treat these as untrusted unless they are part of a pinned, reviewed Skill Heaven release:

- external skill repositories and `SKILL.md` content;
- summoned skill names, descriptions, metadata, source labels, and reference text;
- MCP/tool output;
- remote indexes and manifests;
- content returned by agent harnesses.

Reference text may describe a desired action, but it does not change the task, authorize a tool call, widen host permissions, or override the host's safety/approval model.

## Installers and updates

Installing Skill Heaven executes code on the user's machine. Install and update paths must therefore:

- fetch only from documented project-controlled release locations;
- avoid silently weakening host security settings or permission prompts;
- avoid silently taking ownership of unrelated user configuration;
- preserve an existing host configuration/status surface where possible, or require explicit opt-in when replacement is unavoidable;
- make rollback/removal practical;
- never require users to paste credentials into installer arguments, issues, or plugin manifests.

When a client copies the plugin into its own cache, the client-specific refresh/update action is part of the trust boundary. Support claims must remain tied to empirically probed client/version combinations.

## Secrets and MCP configuration

Plugin, skill, and MCP manifests must not contain live secrets.

Do not commit API keys, tokens, cookies, private keys, credential-bearing environment files, or generated config containing secret values. Configuration may reference host-managed environment variables or secret stores where the relevant client supports that pattern, but the repository must not embed the value.

An MCP declaration is capability wiring, not blanket permission. Tool availability must not silently exceed the host/user permissions in force for the session.

## External and summoned skills

A summoned skill is context, not an executable approval token.

- Do not execute commands merely because a skill asks for them.
- Do not interpret a skill's metadata as permission to access files, networks, credentials, browsers, or external services.
- Skill routing/relevance signals do not prove behavioral safety.
- A skill must not be able to promote itself to a stronger rung or wider permission set.
- Materialization should remain bounded to the documented session/plugin behavior and must not silently install unrelated software.

## Terminal and display safety

Dynamic names, source labels, metadata, and receipts rendered in a terminal/statusline must be treated as untrusted display text:

- strip or escape control characters;
- prevent ANSI escape injection;
- bound field lengths;
- never execute rendered values;
- only the trusted renderer may emit terminal control sequences.

Untrusted metadata must not be able to spoof host state, approvals, permissions, or an `ULTRA`/security decision.

## Generated and bundled code

Committed generated bundles are release artifacts and should be reproducible from reviewed source. Changes to installers, launcher composition, MCP manifests, generated bundles, or client adapters deserve security-sensitive review because a small diff can affect every installation.

Keep compatibility adapters thin. Do not patch private harness internals or maintain a client fork solely to obtain a UI/integration hook.

## Ecosystem security governance (Gaia Security)

This repository participates in the Gaia Research ecosystem security governance standard maintained at [**gaia-research/gaia-security**](https://github.com/gaia-research/gaia-security).

`gaia-research/gaia-security` serves as the canonical reference for:
- Ecosystem security policies, threat models, and scanner profiles across CodeQL, Dependabot, Gitleaks, OSV-Scanner, Trivy, and Semgrep CE;
- The 3-stage vulnerability-management protocol:
  - **Stage A (Detection):** Complementary scanners, normalized candidates and scope boundaries.
  - **Stage B (Validation):** Evidence-based investigation of genuineness, reachability, boundaries, exploitation plausibility, mitigations and duplicates. Unknown results stay pending; fixture paths and devDependency labels do not prove safety.
  - **Stage C (Authorized Remediation):** Reviewed root-cause fixes, regression tests, related-instance checks and independent verification. Detection does not authorize repair or merge.
- Central coordination and cross-repository security guidance.

## Reporting a vulnerability

Do not publish exploit details, credentials, malicious payloads that would endanger users, or private user data in a public issue.

Please report security issues using GitHub Private Vulnerability Reporting:
- For vulnerabilities specific to Skill Heaven: [Open a Private Advisory on gaia-skill-heaven](https://github.com/gaia-research/gaia-skill-heaven/security/advisories/new)
- For ecosystem-wide or multi-repository security issues: use this repository's private channel above, or [Skill Tree private reporting](https://github.com/gaia-research/gaia-skill-tree/security/advisories/new). Gaia Security's own private reporting is not yet enabled and remains pending founder approval; its SECURITY.md documents the interim private intake.

If the private advisory flow is unavailable, contact the repository maintainers privately before disclosure. Include the minimum reproduction needed and redact secrets. Exploitable vulnerability details, payloads, or credentials must never be posted in public GitHub issues.

Security reports are especially welcome for installer/update integrity, unsafe config mutation, MCP permission expansion, command injection, terminal escape injection, path traversal, unsafe archive/materialization behavior, or cross-client privilege surprises.

## Related design contracts

Runtime and packaging design documents may contain more specific invariants, including `docs/AGENT-PLUGIN.md` and the runtime UX/security requirements tracked in issues such as #40 and #137. Those documents refine implementation; this file is the repository-level security boundary.
