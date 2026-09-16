# Arbor cache safety

Arbor publication and canonical-identity files are optional offline enrichment.
A failure leaves their evidence unknown; it must not break ordinary retrieval.
A local receipt proves byte consistency, not upstream authenticity or behavioral
acceptance.

## Opening files without following replacement symlinks

A realpath/lstat check followed by ordinary `open` is raceable. Both loaders now
share one reader with kernel-enforced opening:

- **macOS:** Darwin's `O_NOFOLLOW_ANY` (`0x20000000` in `sys/fcntl.h`) refuses
  symlinks in every path component, including the final file. Node 22 exposes
  only the weaker leaf-only `O_NOFOLLOW`, so the Darwin constant is explicit.
  The standard `/tmp` and `/var` aliases are mapped to `/private` before opening;
  arbitrary publication paths are never canonicalized through a late realpath.
  Older kernels that reject the flag fail closed.
- **Linux:** each component is opened with `O_NOFOLLOW`, relative to a held
  directory descriptor through `/proc/self/fd`. Directory handles remain open
  until the read finishes. This requires an accessible proc filesystem.
- **Other platforms:** this reader currently reports unavailable instead of
  silently reverting to a raceable opener. This is a real platform limitation
  for Arbor enrichment, not a claim of full cross-platform support. Ordinary
  summon functionality remains independent of this optional cache.

The opened object must be a regular file. Tests replace the leaf, a directory,
and an ancestor above the publication root *after* successful path validation;
plain reads follow the outside replacement, whereas the shared reader refuses.
This does not authenticate the publisher or protect against an authorized writer
changing an ordinary in-root file's contents. Receipt hashes still have their
separate role.

## Identity freshness

`build-arbor-identity.ts --check` verifies the source-derived artifact bytes while
preserving its validated original `capturedAt` receipt. A day passing is not a
change to the pinned registry. An explicit regeneration records a new capture
date; checking does not rewrite the artifact or invent a new capture event.
