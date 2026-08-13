# Lucy v3 Validation Report

Status: PASS

## Generation accounting

- Paid gpt-image-2 calls: 3.
- Accepted raws: 3 — Heaven master, bounded Hell face edit, Ultra master.
- Rejected raws: 0.
- Replacement calls: 0.

## Registered Heaven / Hell

- Master dimensions equal: pass — 1024×1536.
- Alpha byte-identical: pass.
- Exact full RGB inversion outside face mask: pass — 0 differing foreground pixels.
- Bounded face edit changed pixels inside mask: pass — 11606 pixels.
- Skin, hair, uniform, ribbon, katana, wings, and shards all participate in the inversion.

## Alpha and export gates

- Fractional-alpha pixels: Heaven 385161; Ultra 256169.
- Strong-green exterior partial-alpha pixels: Heaven 0; Ultra 0.
- WebPs reopened: pass — 79 checked.
- Registered derivative pairs: pass — 33 checked.
- V3 production PNGs: pass — 0.
- Required and manifested outputs: pass — 82 manifest entries.

## Preservation and receipts

- Existing tracked Lucy v1/v2/authority hashes unchanged against HEAD: pass — 238 files checked.
- Required receipts: pass — 4 checked.
- Raw, matte, mask, and checker PNGs remain in ignored workbench/backup paths.

## Guard disposition

- Heaven: PASS — exactly two traceable long, normally thick legs/feet; two arms/hands; one real-steel katana; structurally connected waist/pelvis; opaque skirt coverage.
- Hell: PASS — same registered Heaven body and geometry; both eyes closed; exactly one vivid red tear; full inversion including skin.
- Ultra: PASS — exactly two traceable proportionate legs/feet; two arms/hands; two matching real-steel katanas; structurally connected waist/pelvis; opaque skirt coverage.
- The v1/v2/canonical-sheet full-body poses were not used as anatomy authority.
