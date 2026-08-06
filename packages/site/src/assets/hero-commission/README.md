# Skill Heaven hero commission candidates

Three candidate sets for the glass wing and katana layers. Each variation is
independent and keeps the page layers separate:

```text
v01/wing-left.png      2400 × 3200
v01/wing-right.png     2400 × 3200
v01/sword.png          3600 × 700
v01/sword-debris.png   3600 × 700
v01/slash-arc.png      2600 × 2600
```

`v02/` and `v03/` contain the same five layer names and dimensions. The
Local workbench sources and keyed intermediates are ignored; the files inside
`v01/`, `v02/`, and `v03/` are the production handoff layers.

The final PNGs are grayscale-only RGBA with transparent corners and no baked
background, shadow, or glow. The sword debris and impact arc are intentionally
not composited into `sword.png`.
