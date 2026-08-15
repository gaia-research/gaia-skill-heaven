# Lucy Heaven / Hell v2 Validation Report

Status: **MECHANICAL PASS / OWNER REJECTED**

The mechanical statements below remain true for the files produced. They are
not visual approval. On 2026-08-13 the owner rejected the first v2 generation
because the production worker approved it without fully applying the later
anatomy, proportion, and modesty guidance. V2 remains a recoverable reference;
it is superseded for production selection by the v3 pass in this PR.

## Registered master checks

- Heaven/Hell dimensions equal: pass — 1024×1536.
- Heaven/Hell alpha byte-equal: pass.
- Outside declared two-eyes-plus-one-tear mask: pass — 0 differing foreground pixels against exact RGB inversion.
- Heaven exterior partial-alpha strong-green pixels: pass — 0.
- Hell skin, hair, uniform, ribbon, steel, wings, and shards are derived from the Heaven complement; only the bounded closed-eye/red-tear mask differs.

## Export checks

- Re-opened WebP files: pass — 79 checked.
- Registered paired geometry/alpha: pass — 33 pairs checked.
- Tracked v2 PNG policy: pass — 0 PNGs.
- Checkerboard audit outputs are retained only under ignored workbench paths and backed up as-is.

## Anatomy and modesty disposition

- V2-HH-01: mechanically contains the expected asset structure, but the owner's
  later verdict rejects its visual acceptance under the complete guard stack.
- V2-ULTRA-01: mechanically contains the expected asset structure, but the
  owner specifically found its legs too skinny/short for the intended Lucy
  proportions. It is not the v3 proportion reference.
- V1 artifacts remain preserved as reference only; no v1 file was overwritten or deleted.
