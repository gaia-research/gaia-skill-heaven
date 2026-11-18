# Ultra #126 — Probe Evidence

## U1 standing dose

Standalone standing dose of the `campaign` MCP tool definition (`{ name, description, inputSchema }`) measured with the vendored `chars4` tokenizer (`tokenize(text, "chars4")` in `packages/core/src/vendor/census-pure.ts`):

- **Standing dose (`chars4`):** `418` tokens

| Component | Chars | `chars4` tokens |
| --- | ---: | ---: |
| `name` | 8 | 2 |
| `description` | 313 | 78 |
| `inputSchema` (JSON) | 1305 | 326 |
| Full `{ name, description, inputSchema }` definition (JSON) | 1675 | 418 |

Reproducible verification command:

```bash
npx vitest run packages/skill-summon/test/campaign-u1.test.ts
```
