# 0101 — House Sim

A 3D isometric life sim in the browser. Keep yourself fed, watered, rested and social. Keep the house clean. Look after the dog. Live with a roommate who has a mind of their own.

## Play online
https://pappydapimp69.github.io/0101/

## Run locally
```sh
python3 -m http.server 8000   # any static server
# open http://localhost:8000
```
three.js loads from a CDN, so the first load needs internet.

## Play
- **Click/tap the floor** to walk. **Click/tap things** (fridge, toilet, bed, Sam, Biscuit, tools, dishes) for actions.
- Pick up a tool, then click a room's floor to clean it.
- 📱 **Phone** (bottom bar) and the computer give social but speed up time ×4. Sleep runs ×8.
- **HUD:** the top row shows your mood and one ring per need. Rings fade while fine and pulse when urgent. A small ▲ (green) means a need is filling, ▼ means it's draining (red when it will run out within ~2 game hours). The detail sheet shows "full in …" / "empty in …". Tap the rings, Sam, Biscuit or the 🧹 room chip for details. The **⋯** menu has speed, camera, recent events and controls.
- **Mouse:** drag to pan, wheel to zoom, Q/E rotate, T walls, F follow, Space pause, 1/2/3 speed.
- **Touch:** drag to pan, pinch to zoom; rotate and walls are in **⋯**.

### Gamepad
Plug in any standard controller and press a button.

| Control | Does |
|---|---|
| Left stick | Walk (relative to the camera) |
| A | Use the highlighted thing (opens its menu) · confirm in menus |
| D-pad ◀ ▶ | Change which nearby thing is highlighted |
| D-pad ▲ ▼ | Game speed · move through menus |
| B | Stop current action · close menu |
| X | Put down what you're holding |
| Y | Phone on/off |
| LB / RB | Rotate camera |
| LT / RT | Zoom out / in |
| Right stick | Pan camera (R3 = follow you again) |
| Start | Pause |
| Back / Select | Your needs (detail sheet) |
| L3 (left stick click) | Walls up/down |

## Test
```sh
npm test
```

Design: [`docs/DESIGN.md`](docs/DESIGN.md) · Decisions: [`docs/adr/`](docs/adr/)
