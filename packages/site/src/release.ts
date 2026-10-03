/**
 * Release truth for the production page (`/live`).
 *
 * Every line here is either a verified fact with a named source, or an explicit
 * statement of what is NOT claimed. Nothing is a forecast, a testimonial or a
 * count of users. The page renders this file and invents nothing.
 *
 * The two statuses are kept apart on purpose — see the header of `product.ts`:
 *
 *   • the TOOL is LIVE: it installs from GitHub `main`, and a fresh install was
 *     verified end to end (`RECEIPT`);
 *   • the RESEARCH is PROVISIONAL where the evidence says so (`NOT_CLAIMED`).
 *
 * Sources of record: gaia-skill-heaven#116 (final RAGSXE matrix, 2026-10-03),
 * #172 (this release's acceptance), SPEC INV-10, docs/SEP-2640-CONFORMANCE.md,
 * packages/core/bench/adjudication/README.md, and
 * `scripts/release-acceptance.mjs` (the reproducible receipt).
 */

const REPO = 'https://github.com/gaia-research/gaia-skill-heaven';

export const RELEASE = {
  status: 'LIVE',
  /** `plugins/skill-heaven/plugin.json` — read back from a clean install. */
  pluginVersion: '0.1.2',
  updated: '2026-10-04',
  links: {
    program: `${REPO}/issues/116`,
    acceptance: `${REPO}/issues/172`,
    permissions: `${REPO}/issues/144`,
    mcp: `${REPO}/issues/143`,
    authority: `${REPO}/issues/85`,
    pi: `${REPO}/issues/173`,
    standards: `${REPO}/issues/120`,
    research: 'https://github.com/gaia-research/gaia-research/issues/207',
    script: `${REPO}/blob/main/scripts/release-acceptance.mjs`,
    spec: `${REPO}/blob/main/docs/SPEC.md`,
  },
} as const;

export interface Shipped {
  id: string;
  title: string;
  /** what it is, in one or two sentences — measured or verified claims only */
  claim: string;
  /** the evidence or the boundary that keeps the claim honest */
  proof: string;
}

export const SHIPPED: readonly Shipped[] = [
  {
    id: 'summon',
    title: 'Summon on demand',
    claim:
      'A skill enters your context for one session, from its source, with nothing installed. /summon is present at every rung on every door.',
    proof:
      'Clean-install run: one real summon materialized one skill into a session-locked temp directory and returned a card. Nothing was executed.',
  },
  {
    id: 'retrieval',
    title: 'Offline retrieval, honest refusal',
    claim:
      'Ranking is local and deterministic — BM25F over an index that ships inside the plugin (354 skills, built 2026-09-07), with no model call to rank. A query with no fit is an explicit refusal, not a forced match.',
    proof:
      'Clean-install run: a nonsense query returned a refusal and no candidate. Materializing a chosen skill does fetch it from its source.',
  },
  {
    id: 'benchmark',
    title: 'Historical benchmark, human overlay',
    claim:
      'The 100-query gold set is a frozen, machine-authored historical benchmark: valid for paired same-input comparisons, not human ground truth. Human judgments live in a separate overlay pinned to the exact historical records: 30 reviewed · 6 corrected · 8 uncertain · 56 unreviewed.',
    proof:
      'Uncertain and unreviewed cases never score. An absolute claim cites only the 30 human-confirmed cases, and that number is printed beside it.',
  },
  {
    id: 'arbor',
    title: 'Canonical Arbor consumption',
    claim:
      'The runtime reads the canonical Arbor publication — a byte-for-byte cache pinned to gaia-skill-tree commit 28ac065b (captured 2026-10-03) — read-only and offline. Unknown is not negative, and no field is invented.',
    proof:
      'Clean-install run: the shipped cache loaded and the candidate joined its record by content pin.',
  },
  {
    id: 'fail-closed',
    title: 'Fail-closed governed evidence',
    claim:
      'Evidence must be governed, content-pinned and condition-matched before it can affect anything; anything inconclusive fails closed. The one governed record shipped — obra/receiving-code-review — is inconclusive, and the runtime says so and abstains.',
    proof:
      'Clean-install run: ranking and refusal were identical with and without that record. The inconclusive record changed what is disclosed, not what is ranked.',
  },
  {
    id: 'clean-room',
    title: 'Clean room · product floor',
    claim:
      'claude-zero launches with the settings sources evicted and a strict MCP allowlist. Ambient MCP servers, project skills, project hooks and your own enabled plugins stay out of the session.',
    proof:
      'Live session through the installed launcher: a synthetic ambient MCP server, a synthetic project skill and a project hook were all absent; none of the operator’s user-enabled plugins loaded.',
  },
  {
    id: 'mcp',
    title: 'One bundled summon MCP',
    claim:
      'The summon engine is a single bundled stdio server with one tool, summon. No external package, no build step, and the shipped bundle is byte-identical to a rebuild from source.',
    proof:
      'Clean-install run: the product floor connected exactly one MCP server and exposed exactly one MCP tool; two consecutive rebuilds produced no diff.',
  },
  {
    id: 'reference',
    title: 'Reference data, not authority',
    claim:
      'Commands, native skills, ladder renderings, MCP instructions and summon cards say what they are: reference data. They cannot change the task, outrank the instructions already in force, authorize a tool call or widen permissions. Hostile text in a query or a skill name is quoted so it cannot forge an authored line. The Pi door holds the same boundary.',
    proof:
      'Clean-install run: 20 installed command, skill and ladder surfaces and every returned card were scanned for authority-shaped phrases; none carried one.',
  },
  {
    id: 'permissions',
    title: 'Permission intent preserved',
    claim:
      'An explicit --permission-mode or --dangerously-skip-permissions wins. If you configured a default mode, that one setting is carried into the clean room — no allow/deny rules, hooks, plugins, MCP, env or credentials come with it. Malformed settings fail with a clear error.',
    proof:
      'Live sessions: the configured mode was inherited, an explicit plan mode and an explicit bypass flag each won. Claude can still decline a mode its model does not support — a smaller model fell back to default in our own testing.',
  },
  {
    id: 'plugin',
    title: 'Portable Agent Plugin · tested install',
    claim:
      'One portable package with five commands. The marketplace install was verified from scratch on Claude Code 2.1.288. Codex 0.146.0, Grok 1.0.5, Hermes 0.20.0 and Pi 0.84.2 were probed at those versions earlier; they were not re-run for this release.',
    proof:
      'Clean-install run: install.sh into a disposable home and config directory, then the plugin listed, enabled, with five commands and its bytes equal to the repository.',
  },
  {
    id: 'standards',
    title: 'MCP skills extension, as far as it goes',
    claim:
      'The SEP-2640 skills surface has dedicated conformance tests: cache fields, remote confinement, symlink and non-regular-file refusal, the 16 MiB bound, and the no-fetch / no-execution boundary.',
    proof:
      'Base protocol 2026-07-28 is not claimed: the pinned SDK still negotiates 2025-11-25, and a test pins that result so an upgrade forces a re-check.',
  },
];

export interface NotClaimed {
  id: string;
  title: string;
  body: string;
}

/** The research that stays provisional. Rendered as plainly as the shipped list. */
export const NOT_CLAIMED: readonly NotClaimed[] = [
  {
    id: 'composition',
    title: 'Behaviour-aware composition is not delivered',
    body:
      'Composition is relevance-only, and says so on every result. SPEC INV-10 stands, unmet.',
  },
  {
    id: 'band',
    title: 'The band judgment is reported, not applied',
    body:
      'Accepted Arbor evidence may one day move how wide a rung reaches. Today it never reorders, rescores or filters what is returned.',
  },
  {
    id: 'inconclusive',
    title: 'The one governed record is inconclusive',
    body:
      'It is not positive evidence and not an endorsement of the skill: one case, five paired runs, no discordance observed. A human-curated interpretation set it to inconclusive.',
  },
  {
    id: 'stamps',
    title: 'Heaven/Hell stamps are not built',
    body: 'Routing ranks on relevance alone. Nothing here is stamp-gated.',
  },
  {
    id: 'rungs',
    title: 'Rung meaning is still provisional',
    body:
      'What each rung means in behaviour — and where each band opens — has not been settled by evidence. The entropy curve has not been plotted, and no rung has been shown to beat another.',
  },
];

/** Reproducible receipt of the fresh-install acceptance. Regenerate with
 *  `node scripts/release-acceptance.mjs`; do not edit by hand. */
export const RECEIPT = {
  /** GitHub `main` at the time of the run — the commit that was installed. */
  commit: 'e0f2e986eafca00ac69fd9df023ba12db6ad9d95',
  date: '2026-10-04',
  claude: '2.1.288',
  node: 'v22.23.1',
  platform: 'macOS (darwin arm64)',
  pluginVersion: '0.1.2',
  liveModel: 'claude-sonnet-5-5',
  passed: 76,
  total: 76,
  groups: [
    {
      title: 'Fresh install',
      items: [
        'The public installer ran into a throwaway home and config directory, and registered the Claude plugin.',
        'skill-heaven 0.1.2 is listed and enabled, installed into the throwaway config directory.',
        'Five commands, five skills, exactly one MCP server (skill-summon).',
        'Installed bytes equal the repository at the tested commit.',
        'The MCP bundle is current: two consecutive rebuilds from source changed nothing.',
      ],
    },
    {
      title: 'The installed launcher’s plan',
      items: [
        'Strict MCP allowlist on, with one session-local config declaring exactly one server — the installed bundle.',
        'Settings sources evicted; the installed door plugin mounted.',
        'A configured defaultMode is the only thing inherited; allow/deny rules, hooks, env, MCP, plugins and directories did not leak.',
        'Explicit --permission-mode and --dangerously-skip-permissions are forwarded verbatim and win.',
        'Malformed settings fail with exit 2 and a named reason, and no plan is emitted.',
      ],
    },
    {
      title: 'The bundled MCP, over stdio, no model',
      items: [
        'Exactly one tool, summon. Server instructions and tool description state the reference-data boundary; neither carries an authority phrase.',
        'A real summon materialized one skill and returned a card: relevance-only ranking, “not a grant”, no authority phrase.',
        'The Arbor cache loaded; the candidate joined its record by content pin; support is inconclusive, set by the human-curated interpretation c8d6b2cb.',
        'The band judgment is reported, not applied: no direction, relevance untouched, inconclusive fails closed.',
        'Ranking and refusal are identical with and without the Arbor record; a nonsense query is an honest refusal.',
        '20 installed commands, skills and ladder renderings scanned: no authority phrase.',
      ],
    },
    {
      title: 'Live Claude Code sessions',
      items: [
        'One MCP server (connected) and one MCP tool; the five plugin commands present.',
        'A synthetic ambient MCP server, project skill and project hook were absent; none of the operator’s three user-enabled plugins loaded.',
        'The door plugin was mounted from the fresh install (Claude’s own built-in plugins aside).',
        'The configured default mode (auto) was inherited; the project’s plan mode did not leak.',
        'A real summon call returned a reference card.',
        'An explicit --permission-mode plan and an explicit bypass flag each won over the inherited mode.',
      ],
    },
    {
      title: 'Nothing was modified',
      items: [
        'The installed plugin tree was byte-identical after every run.',
        'The operator’s settings.json was unchanged, and their plugin registries never referenced the throwaway install.',
        'The repository checkout was untouched.',
      ],
    },
  ],
} as const;
