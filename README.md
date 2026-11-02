# 0101 — House Sim

A 3D isometric life sim in the browser. Keep yourself fed, watered, rested and social. Keep the house clean. Look after the dog. Live with a roommate who has a mind of their own.

## Run
```sh
python3 -m http.server 8000   # any static server
# open http://localhost:8000
```
three.js loads from a CDN, so the first load needs internet.

## Play
- **Click the floor** to walk. **Click things** (fridge, toilet, bed, Sam, Biscuit, tools, dishes) for actions.
- Pick up a tool, then click a room's floor to clean it.
- 📱 **Phone** and the computer give social but speed up time ×4. Sleep runs ×8.
- Camera: right-drag or WASD to pan, wheel to zoom, Q/E to rotate, T for walls up/down, F to follow.
- Speed: Space pauses, 1/2/3 set speed.

## Test
```sh
npm test
```

Design: [`docs/DESIGN.md`](docs/DESIGN.md) · Decisions: [`docs/adr/`](docs/adr/)
