# ADR 0001 — Browser + three.js, fixed-step simulation separate from rendering

**Status:** accepted (2026-11-02)

## Context
The game is a 3D isometric life sim in the browser. Time can run 1×–4×, and the phone, computer and sleep multiply it again (up to ×32 effective). Needs, dirt and AI must behave the same at every speed.

## Decision
- `src/sim/` is plain ES modules with no DOM or three.js. One step = one game second, seeded RNG, deterministic.
- `src/main.js` drives it with an accumulator: speed-ups run *more* steps per frame, never larger steps (capped per frame).
- `src/render/` only reads state. three.js 0.160.0 comes from jsDelivr via an import map (no build step, no vendored copy).
- Tests run the sim headless with `node --test`.

## Consequences
- The game needs network access the first time it loads three.js.
- The sim can be soak-tested for a week of game time in seconds, and replays are possible later.
- Tasks hold closures, so save/load will need a task-descriptor layer.
