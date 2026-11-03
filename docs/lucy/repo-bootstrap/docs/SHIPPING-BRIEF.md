# Lucy Alive — shipping-agent brief

Tracker: [gaia-research/gaia-skill-heaven#153](https://github.com/gaia-research/gaia-skill-heaven/issues/153)

## Mission

Turn the current approved Lucy artwork into a production Rive character for Skill Heaven.

Use the successful Milim architecture as the implementation precedent, but do **not** copy Milim's personality or gesture model. Lucy is state-driven, atmospheric, and more restrained.

The primary quality problem is hair + state animation.

## Read before changing pixels

Inspect the current Skill Heaven sources, especially:

- `packages/site/src/assets/lucy/v5/masters/`
- `docs/lucy/production/v5/runs/ISSUE-73-OVERKILL.md`
- `.agents/skills/lucy-image-production/SKILL.md`
- current Lucy authority/canon docs
- `packages/site/src/surfaces/Hero.tsx`
- `packages/site/src/surfaces/Landing.tsx`

Then inspect the landed Milim implementation:

- `gaia-research/milim` Rive source and candidate viewer/evidence
- `gaia-research/gaia-research/lib/milim-rive/character.ts`
- `gaia-research/gaia-research/scripts/milim/sync-rive.mjs`
- `gaia-research/gaia-research/components/MilimLive.tsx`

Understand why the first Milim site integration was reverted and why the candidate-viewer iteration succeeded.

## Product result

The live Skill Heaven hero should move between:

- Zero
- Heaven
- Hell
- Ultra

Each state must remain unmistakably Lucy while gaining:

- convincing hair movement
- ribbon secondary motion
- subtle expression
- authored transitions
- restrained aura/refraction/shard behavior
- state-correct eyes, tear, wings/shards, and weapons

Avoid animation for animation's sake.

## Source policy

Zero / Heaven / Hell: reuse the approved v5 masters as gold masters.

Ultra: inspect first. Do not replace automatically. A new master is allowed only when the existing source demonstrably blocks a good rig and the replacement receives owner approval.

Prefer deterministic separation and bounded reconstruction over whole-character regeneration.

## Tooling

Use:

1. Rive CLI + RML for deterministic/versioned authoring
2. official Rive Editor MCP for editor-native operations
3. authorized computer use for visual judgment and UI-only work
4. Skill Heaven's Lucy image-production harness for bounded source edits

Use capable subagents when useful.

## Get visual early

Before integrating deeply into Skill Heaven, produce a standalone viewer that can:

- switch Zero / Heaven / Hell / Ultra
- play all transition pairs or at least the product-relevant direction changes
- pause / slow / frame-step
- show the gold master as an adjustable overlay
- zoom full body / upper body / face / hair
- inspect light and dark backgrounds
- capture reviewer notes with current state + transition time

This is not ceremony. It is the fastest path to catching identity and hair failures before they ship.

## Hair quality bar

Spend real iteration budget here.

Model separate meaningful hair groups. Keep roots stable and tips responsive. Preserve volume and lock boundaries. Tune damping per region. State transitions may change gravity target and secondary-motion behavior, but they must not turn the hair into a flag, ribbon sheet, or liquid blob.

Review transition midframes, not only resting states.

## Suggested Skill Heaven consumer shape

Keep the site thin, likely:

```text
packages/site/src/lib/lucy-rive/
  character.ts
  asset.ts

packages/site/src/components/
  LucyLive.tsx

scripts/lucy/
  sync-rive.mjs

packages/site/public/
  lucy/<content-hashed>.riv
  lucy/<content-hashed-poster>.webp
  rive/<pinned-runtime>.wasm
```

Adapt this to Vite. Do not copy Next.js details from Milim.

Use the official pinned Rive WebGL2 runtime, lazy-loaded. Generate asset metadata containing Rive hash/bytes, poster dimensions, runtime version, and source repository commit.

Reduced motion should not load the runtime. Pause offscreen and when the document is hidden.

## Lucy Player

Do not create it by default.

A thin consumer adapter is sufficient unless:

- a second real consumer appears, or
- runtime logic becomes independently substantial and version-worthy

Rive is the player.

## Evidence that matters

Final review should include:

- gold-master overlays for all four states
- dedicated hair review
- state transition contact sheets / clips
- expression closeups
- desktop and mobile browser evidence
- reduced-motion fallback
- offscreen pause/resume
- content readability with aura/effects
- exact Rive source and promoted artifact hashes
- provenance for any edited/new raster source

## Definition of finished

Lucy is finished when the real Skill Heaven hero transitions among all four product states and the result feels intentional, fluid, on-model, and worth keeping.

Do not call it finished because Rive builds.

Call it finished because Lucy lives.
