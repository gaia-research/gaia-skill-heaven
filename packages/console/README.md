# Portable Full adapters (bounded preview slice)

`packages/status/src/console-{state,host,view}.ts` remains the semantic source.
This package adds only host observation/I/O and paints via `renderConsoleText`.
No runtime dependencies, daemons, global config edits, independent MCP server,
hidden prompt submission or automatic retrieval. Ultra remains unavailable.

## Artifacts and carriers

| Host | Separate artifact | Integration primitive |
|---|---|---|
| Pi 1.0.4 | `plugins/skill-heaven-console-pi` | Pi package extension; owned `setStatus` key; `/heaven` command opens a below-editor widget; `/lens` uses Core's same-client event bridge; `/heaven fill` only fills the editor |
| Codex 0.161.0 | `plugins/skill-heaven-console-codex` | Plugin skill; model-mediated explicit report/preview; exact caller-supplied Core sessionRoot ledger |
| Hermes 0.20.0 | `plugins/skill-heaven-console-hermes` | Native Python `register_command`; stateless Node report; `/lens` dispatches the existing Core tool; exact explicit root for history |
| Grok 1.0.46 | `plugins/skill-heaven-console-grok` | Native command file; model-mediated explicit report/preview; exact caller-supplied Core sessionRoot ledger |
| Agy 1.3.1 | `plugins/skill-heaven-console-agy` | Namespaced plugin skill; model-mediated report/preview; explicit root or exact full conversation transcript |

Flow is unsupported until real host agent ids are implemented and validated.
Ledger events are reported; reads remain unobserved. Pi promotes only successful
`read` results. Restored Pi branches replay results, not guessed read arguments.
Agy's optional decoder accepts only successful, unambiguously paired steps and
confines large-result files to the exact conversation's steps directory (also
through symlinks). Its decoder tests are synthetic, not a live TUI receipt.
Readers never enumerate sessions. Unbound or unreadable input is unknown, not zero.
Inputs are bounded to 8 MiB / 10,000 JSONL rows; the shared model keeps 50 entries.
Oversized or malformed inputs fail closed. No prompts or raw transcripts are exported.

## Integration required from owner

- Stage exactly one selected artifact as `marketplace/plugins/skill-heaven-console`.
  Metadata identity remains `skill-heaven-console`, not the repository suffix.
- Add `node scripts/build-console.mjs` before tests and `--check` as a CI drift gate.
  Root scripts, existing status builder, installers and site were deliberately untouched.
- Regenerate existing status/installer bundles from changed compat data at integration.
- Execute `InstallStep.argv` with `shell:false`; expand tokens inside individual
  arguments, never split/interpolate `run` or `shell`. Claude's canonical registration
  uses the candidate's local marketplace in a shell command; legacy public commands
  remain unchanged. No confirmation stdin is invented.
- Hermes Full fails closed: its installer clones Git sources, so the staged directory
  must first be a standalone Git source with plugin.yaml at Git root. Do not claim
  the current plain staging layout satisfies this. Core has the same Git-source
  requirement in its historical file:// recipe.
- Agy uses real HOME. Removal steps use supported `disable`, which leaves the host's
  cached copy; destructive uninstall remains a separate interactive action. No
  `/statusline` setting is installed. Pi local packages need no global `pi update`.

## Verification and exact remaining runtime cells

Deterministic tests cover all six canonical sections, exact ledger binding, unknown
counts, preview/no-materialization state, failed vs successful reads, Pi owned keys,
explicit editor fill, missing Core, stale completions, confined Agy result paths,
file/row bounds, argv presence and candidate-local Claude registration.
`agy plugin validate` establishes only layout (one skill, no MCP or hooks).
These checks do **not** establish empirical Full compatibility.

Still unverified on each pinned host: combined Core+Full fresh registration, live
console output, explicit Lens on the same Core session, concurrent-session isolation,
cache refresh after staging updates, and disabling/removing only Console while Core
still summons. Additionally:

- Pi: real TUI/RPC widget paint, input/rung alias events, resume/tree reconstruction,
  event bridge timeout and permission-extension behavior. The bridge is an in-process
  preview-only transport, not a new model tool; other trusted extensions have the
  same process permissions.
- Codex/Grok: command/skill entry spelling, model obeying preview:true and reproducing
  stdout, plugin-root resolution, approval prompts and local-marketplace cache refresh.
- Hermes: standalone Git staging, runtime command registration, dispatch/tool namespace
  hash identity and whether the command dispatch path honors user permission hooks.
- Agy: real-HOME workspace-plugin execution, exact TUI transcript status spelling,
  successful read pairing, permission prompts, namespaced command routing, cached-copy
  reinstall and model-mediated Lens. No private environment conversation-id assumption.

Saved recon API/layout evidence informed the code; no recon campaign was rerun and
no workers were delegated. Targeted validators and synthetic tests are the new evidence.
