# Lucy character contract

This is a product-facing semantic contract, not a renderer API.

The exact Rive view-model names may evolve during implementation, but Skill Heaven should never know Lucy's bone, mesh, or animation internals.

## Primary state

```ts
type LucyState = "zero" | "heaven" | "hell" | "ultra"
```

The site already owns this product state. The Rive character should respond to it.

## Candidate semantic interface

```ts
interface LucyCharacter {
  state(next: LucyState): void
  expression(name: LucyExpression): void
  look(target: { x: number; y: number }): void
  setRunning(running: boolean): void
  resize(): void
  destroy(): void
}
```

Do not add methods until the real Skill Heaven interaction needs them.

## Expressions

Lucy should use subtle expression shifts rather than Milim-style mascot reactions.

Likely controls are eye openness/focus, brow tension, micro mouth shape, tear visibility where canonical, and small head/face attitude changes.

Expressions must stay compatible with each state's canonical identity. Hell and Ultra have state-specific eye/tear rules that expressions must not accidentally erase.

## State transitions

Transitions are core character behavior, not CSS crossfades.

Rive should own the authored transition language between states wherever practical:

- hair gravity changes
- ribbon flow changes
- aura/refraction ramp
- shard/wings organization or fragmentation
- eye state changes
- light/palette treatment
- weapon visibility/arrangement where required

The website requests the target state; it should not choreograph bones or effect timing.

## Hair

Hair is a first-class subsystem.

Requirements:

- multiple meaningful locks/regions, not one deforming plate
- crown/root mass remains stable
- tips may lag more than roots
- state-specific gravity direction
- restrained damping and overshoot
- no rubber-sheet stretching
- no silhouette collapse at transition midpoints
- face remains readable under motion

## Aura / effects

Aura should support state recognition without becoming an independent scene engine.

Prefer Rive-native shapes/effects/opacity/transform animation when practical. Keep effect layers bounded around Lucy and preserve website copy contrast.

## Runtime boundary

Skill Heaven owns:

- lazy runtime loading
- Rive WASM location
- mount/unmount
- offscreen/tab-hidden pause
- responsive canvas sizing
- reduced-motion fallback
- semantic state changes from product UI

Lucy Rive owns:

- rig
- deformation
- idle motion
- expression implementation
- state transition choreography
- hair/ribbon behavior
- aura/refraction/shard motion
