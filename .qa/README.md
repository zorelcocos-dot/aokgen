# QA harness

No browser is installable in this sandbox (Playwright downloads fail), so the
game is verified by importing the real modules under a minimal DOM/WebAudio
stub and driving them exactly the way `main.js` does.

| script | what it proves |
| --- | --- |
| `node .qa/qa.mjs` | Progression ladder, out-of-order exploration, inventory, doors + geometry, freeze-on-terminal-state, reset, run 2, lighting zones, monster AI transitions, damage i-frames, hatchlings, a **full INTRO -> ENDING playthrough**, both endings, texture caching, timer ownership. |
| `node .qa/soak.mjs` | 5 back-to-back full runs + 10k simulated frames. Asserts scene children, colliders, interactables, listeners, timers and spawned props do not grow across restarts. |
| `node .qa/ai.mjs` | Behavioural monster AI: acquires the player, closes distance, loses him behind walls, runs a search phase, gives up, reacts to noise, never leaves the building. |
| `node .qa/mapscan.mjs` | **Geometry.** Flood-fills the level with the player's own `collidesAt()` from the spawn point. Asserts there is no reachable cell without a floor under it (falling off the map) and that every room is reachable. `--ascii` prints a map. |
| `node .qa/reachscan.mjs` | **Playability.** Ray-casts from every walkable cell to every interactable. Asserts each pickup, door, document and prop can actually be seen and used from somewhere the player can stand, and that all 11 clues are placed. |
| `node .qa/assets.mjs` | **Assets.** Every texture/sprite the code references exists on disk, no mesh is left without a material, materials are shared, and two builds of the level are byte-identical (no `Math.random()` dressing). |

`.qa/domstub.js` provides the DOM, canvas 2D and WebAudio stubs.

Run everything plus the build:

```sh
npx vite build && node .qa/qa.mjs && node .qa/soak.mjs && node .qa/ai.mjs \
  && node .qa/mapscan.mjs && node .qa/reachscan.mjs && node .qa/assets.mjs
```

## Regenerating art

The textures and sprite atlases in `public/assets/tex` and
`public/assets/sprites` are build products, committed so the game runs without
a Python toolchain. To rebuild them:

```sh
python3 tools/build_textures.py   # painted sources -> tileable pixel-art PBR sets
python3 tools/gen_textures.py     # procedural surfaces (carpet, frost, brick, wood)
python3 tools/build_sprites.py    # magenta JPG sheets -> keyed, label-free RGBA atlases
```
