# Lucy

Private source of truth for the **Lucy Alive** Rive character used by Gaia Skill Heaven.

Lucy is not a generic avatar framework. This repository exists to make one character excellent across the four Skill Heaven states:

- Zero
- Heaven
- Hell
- Ultra

## North star

Lucy should feel alive without becoming noisy UI.

The character must preserve the current approved identity while adding authored hair/ribbon motion, subtle expression, state transitions, aura/refraction behavior, and state-specific movement.

The first implementation is tracked in [gaia-research/gaia-skill-heaven#153](https://github.com/gaia-research/gaia-skill-heaven/issues/153).

## Production direction

- **Authoring/runtime:** Rive
- **Agent bridge:** Rive CLI + RML
- **Visual editor bridge:** official Rive desktop MCP where useful
- **Consumer:** `gaia-research/gaia-skill-heaven`
- **Player:** official Rive web runtime behind a tiny semantic adapter
- **No separate `lucy-player` initially**

## Character authority

The initial gold masters remain the current owner-approved Lucy v5 sources from Skill Heaven.

Zero, Heaven, and Hell are expected to carry forward.

Ultra receives an early rig-suitability review because its current source/delivery geometry and alpha characteristics differ. Do not replace it unless the Rive build demonstrates a real motion-quality problem and a new master is owner-approved.

See [docs/AUTHORITY.md](docs/AUTHORITY.md).

## Craft priority

1. hair
2. ribbon
3. state transitions
4. subtle face/eye expression
5. aura/refraction/shards
6. wings/weapons
7. runtime polish

Hair is the main animation problem. Preserve lock structure, mass, volume, silhouette, and the gravity language of each state.

## Repository shape

```text
lucy/
  README.md
  AGENTS.md
  docs/
    AUTHORITY.md
    CHARACTER-CONTRACT.md
    SHIPPING-BRIEF.md
  rive/
    lucy/
      project.rml
      assets/
      tools/
      viewer/
      evidence/
```

Add code only when real production work requires it. Do not pre-build a character engine around Rive.

## Definition of finished

Lucy is alive when the actual Skill Heaven hero can transition among Zero, Heaven, Hell, and Ultra while preserving identity, convincing hair/ribbon physics, subtle expression, readable state effects, responsive behavior, reduced-motion fallback, and clean offscreen lifecycle.
