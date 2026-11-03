# @gaia-skill-heaven/site — landing page

> Marketing landing page for Skill Heaven. It is separate from the engine
> (`packages/core`) and the doors (`packages/claude-zero`, `packages/pi-zero`).

The pages site ships two retained hero directions:

| Route | Name | Direction |
|---|---|---|
| `#/hero-a` | **Hero A** | Production default: centered monumental wordmark with the approved v01 commissioned wing and katana art. |
| `#/hero-b` | **Hero B** | Retained alternate: asymmetric, frame-cropped guillotine composition. |

The root route and unknown routes redirect to Hero A. Hero art is intentionally
fixed to v01; the former asset selector and v02/v03 commissions are no longer
part of the site.

## Run

```bash
npm -w @gaia-skill-heaven/site run dev      # dev server on :5178
npm -w @gaia-skill-heaven/site run build    # production build → dist/
npm -w @gaia-skill-heaven/site run preview  # serve the build
```

## Design system

`src/styles/tokens.css` defines the Luminance / Prismatic motif — a near-black
canvas, luminous white type, and a refracted spectrum accent. The retained
heroes share the same content source and measured token figures.

## Lucy Live (Rive)

Lucy's live character comes from `gaia-research/lucy`, which owns the rig. Its combined four-state `.riv` is imported here:

```bash
node packages/site/scripts/import-lucy-live.mjs ~/lucy   # -> public/lucy-live/<sha>/ + src/lucy-scene/rive/lucyLiveManifest.ts
```

- `src/lucy-scene/rive/LucyRiveFigure.tsx` mounts the character in Hero A's figure frame, over the v5 master. It takes the same per-state framing.
- `createLucyCharacter.ts` implements the `LucyCharacter` contract. Heaven's images are embedded in the file. The other states' images are fetched after the first frame.
- **Fallbacks:** the master stays as the poster, with a loading veil until the first frame. Under `prefers-reduced-motion: reduce`, on WebGL2 failure, and with `?lucy=static`, the master is all that shows. `?lucy=off` hides Lucy entirely.
