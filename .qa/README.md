# QA harness

No browser is installable in this sandbox (Playwright downloads fail), so the
game is verified by importing the real modules under a minimal DOM/WebAudio
stub and driving them exactly the way `main.js` does.

| script | what it proves |
| --- | --- |
| `node .qa/qa.mjs` | Progression ladder, out-of-order exploration, inventory, doors + geometry, freeze-on-terminal-state, reset, run 2, lighting zones, monster AI transitions, damage i-frames, hatchlings, a **full INTRO -> ENDING playthrough**, both endings, texture caching, timer ownership. |
| `node .qa/soak.mjs` | 5 back-to-back full runs + 10k simulated frames. Asserts scene children, colliders, interactables, listeners, timers and spawned props do not grow across restarts. |
| `node .qa/ai.mjs` | Behavioural monster AI: acquires the player, closes distance, loses him behind walls, runs a search phase, gives up, reacts to noise, never leaves the building. |

`.qa/domstub.js` provides the DOM, canvas 2D and WebAudio stubs.

Run all three plus the build:

```sh
npx vite build && node .qa/qa.mjs && node .qa/soak.mjs && node .qa/ai.mjs
```
