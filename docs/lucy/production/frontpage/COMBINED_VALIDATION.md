# Lucy Front Page Combined Mechanical Validation

Status: **PASS**

This was a mechanical integration gate only. Per owner instruction, neither the
workers nor the lead performed a visual review of either generated atlas or the
final compositions.

## Generation accounting

| Variation | Assigned model | Paid calls | Retries | Visual review |
|---|---|---:|---:|---|
| A — Heaven Ascension | Terra High | 1 | 0 | Not performed |
| B — Ultra Judgment | Terra High fallback | 1 | 0 | Not performed |

Luna XHigh was requested for Variation B, but the inline Codex collaboration
API rejected Luna and exposed only Terra/Sol. No callable Luna multi-agent tool
was present. The fallback is recorded rather than mislabeled.

## Mechanical results

- Variation A: 150 WebPs reopened; required P0/P3 dimensions and alpha pass;
  zero production PNGs.
- Variation B: 124 WebPs reopened; required P0/P3 dimensions and alpha pass;
  zero production PNGs.
- Both variation manifests and receipts are present.
- Both raw atlas PNGs remain under ignored workbench paths and were copied as-is
  by `scripts/assets/backup-lucy-pngs.sh`.
- Accepted v2 Heaven/Hell/Ultra character sources and validated v1 Zero/neutral
  sources are reused; the generated atlases supply atmosphere and FX only.
- Registered Hell character pixels are unchanged. Hell atmosphere is derived
  as the exact inversion of its variation's Heaven background.
- Isolated hair remains the only documented component gap. The 15-file
  `FP-KATANA-01` authority pack supplies sheathed katana and saya to both
  variations, copied byte-identically from the shared pack.

## Reproduction

```bash
python3 scripts/assets/lucy-frontpage-a-validate.py
node scripts/assets/lucy-frontpage-b-validate.mjs
scripts/assets/backup-lucy-pngs.sh
```
