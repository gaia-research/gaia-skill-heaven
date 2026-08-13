# Lucy v3 deterministic derivatives

`scripts/assets/lucy-v3-prepare.py` prepares the accepted Heaven matte, exact
foreground RGB complement, and fixed Hell face context. `lucy-v3-export.py`
promotes the three accepted call results into the complete v2-equivalent v3
system: transparent masters/states, desktop and mobile heroes, panels,
portraits, backgrounds, registered components, FX, identity crops, assembly
manifests, and the final asset manifest.

Heaven and Hell remain registered for every paired derivative. Hell is the full
RGB complement of Heaven—including skin—except inside the explicit two-eyes and
single-tear mask. Geometry and alpha are identical. Ultra is a separate accepted
master with two matching authority-style steel katanas.

`scripts/assets/lucy-v3-validate.py` reopens every WebP, checks all manifested
paths, dimensions, alpha, fractional coverage, strong-green exterior edges,
registered pair geometry, exact outside-mask inversion, receipts, the v3 PNG
policy, and unchanged tracked v1/v2/authority hashes against `HEAD`.

Raw, matte, mask, and checker PNGs stay under ignored workbench and backup paths.
No v1 or v2 file is overwritten, removed, or promoted as v3 anatomy authority.

