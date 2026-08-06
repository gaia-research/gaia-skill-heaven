# @skill-heaven/site — landing page

> Marketing landing page for Skill Heaven. It is separate from the engine
> (`packages/core`) and the doors (`packages/claude-heaven`, `packages/pi-heaven`).

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
npm -w @skill-heaven/site run dev      # dev server on :5178
npm -w @skill-heaven/site run build    # production build → dist/
npm -w @skill-heaven/site run preview  # serve the build
```

## Design system

`src/styles/tokens.css` defines the Luminance / Prismatic motif — a near-black
canvas, luminous white type, and a refracted spectrum accent. The retained
heroes share the same content source and measured token figures.
