# V2 Derivatives

All v2 delivery files are deterministic exports from exactly three paid calls:
V2-HH-01 Heaven master, V2-HH-02 face-only Hell edit, and V2-ULTRA-01 Ultra
master. `scripts/assets/lucy-v2-export.py` produces masters, desktop and mobile
hero compositions, state panels, portraits, backgrounds, identity crops,
registered components, pair assembly manifests, and WebP-only final exports.

The Heaven/Hell components and backgrounds retain matching dimensions and alpha
geometry. Where reusable FX derives from v1 Heaven source geometry, the Heaven
FX is re-exported from the previously accepted source and Hell is the exact
RGB-inverted counterpart; no independent v1 Hell geometry is used.

Raw, extracted alpha, face-mask, and checkerboard PNGs remain in ignored
workbench paths and are copied as-is into `lucy-masters-backup/` by the backup
script. Neither v1 nor workbench material is deleted or overwritten.

