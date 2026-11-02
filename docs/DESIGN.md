# 0101 — House Sim: Design

A 3D isometric life sim set inside one house. You manage your own needs, keep the
house clean, and share it with a roommate (Sam) and a dog (Biscuit) who have needs
of their own.

## Decided by the user
- Browser game, 3D, isometric camera.
- Map traced from `floorplan-source.jpg`. The back yard is west of the kitchen, through the back door.
- Rooms: living room, bedroom 1, master bedroom, kitchen, laundry room, garage, bedroom 3, back yard.
  The floor plan adds a hallway, bathroom and master bath.
- A clock drives everything.
- Characters: the player, a human NPC (own needs, not player-controlled), a dog (own needs).
- Player needs: hunger, thirst, toilet (bladder), social, tired (energy).
  - Thirst is only met by drinking.
  - Toilet is only met in a bathroom.
  - Social is met by talking to Sam. The phone and computer also give social, but they **speed up time**.
- Mess:
  - Eating makes dishes.
  - Cooking dirties the kitchen.
  - Using a toilet dirties that toilet, which dirties its bathroom.
  - Every room gets dirtier at a steady rate.
  - Rooms get dirty faster while someone is in them.
- Cleaning tools: broom, vacuum, mop bucket, wipes, sink.
- Bad room cleanliness lowers the mood of everyone in it.
- Sam cuts you off when **both** Sam's social and mood are low. You can keep trying; Sam keeps cutting you off.
- Repeated cut-offs build a **grudge that fades over time** (option B of Brain tension T77).
- Consequences at zero depend on the need (see below).

## Defaults chosen (change any of these)
| Topic | Default |
|---|---|
| Time | 1 real second = 1 game minute at 1× (24 min per game day). Speeds 1×/2×/4×. |
| Time speed-ups | Phone ×4, computer ×4, sleeping ×8. These run more fixed steps, never bigger ones. |
| Room mapping | Map "Bedroom" = Bedroom 1 (Sam's). "Sewing room" = Bedroom 3 (has the computer). "Game room" = Master Bedroom (yours). Garage east of the living room. |
| Goal | Sandbox. No win or lose; keep everyone fed, rested and happy and the house clean. |
| Hunger / thirst at 0 | Mood penalty plus a warning. No competence penalty (see below). |
| Bladder at 0 | Accident: puddle in the room, big mood hit, Sam grossed out. |
| Energy at 0 | You pass out on the floor (slower rest, mood hit). |
| Social at 0 | Mood penalty. |
| Dog potty | Dog waits at the back door. Open it and the dog goes in the yard. Leave it shut too long and there's a puddle. An open door dirties the kitchen faster. |
| Dog bored (play 0) | Chews things: debris mess every 90 min. |
| Dog food / water | You fill the bowls. The dog begs at an empty bowl. |
| Sam cleaning | Sam never cleans; Sam lets the dog out and closes the door. |
| Cut-off thresholds | Sam's social < 40 **and** (mood − grudge) < 40. |
| Grudge | +12 per cut-off, −10 per good chat, fades 8/hour, max 60. |

### Which tool cleans what
| Tool | Where it lives | Use |
|---|---|---|
| Broom | Laundry room | Hard floors: +40, removes chewed debris |
| Vacuum | Garage | Carpet: +45, removes chewed debris |
| Mop bucket | Laundry room | Hard floors: +35, removes puddles |
| Wipes | Kitchen counter, bathroom sink | Toilets (dirt → 0), counters (+20 kitchen), any puddle or mess |
| Kitchen sink | Kitchen | Wash carried dishes (2 min each) |

Hard floors: kitchen, laundry, hallway, bathrooms, garage. Carpet: living room, bedrooms.

## Systems
- **Simulation** (`src/sim/`) is plain JS with no rendering. It runs a fixed step of 1 game second and is deterministic from a seed. The renderer only reads its state.
- **Needs** decay per game hour. Rates are in `TUNING` in `src/sim/state.js`.
- **Mood** = 60% needs score + 40% room cleanliness, plus temporary bumps (e.g. used a gross toilet). A filthy room (< 30) costs an extra 10.
- **Sam's AI**: utility scoring. Each action's need urgency is multiplied by distance and availability, so an occupied or unreachable object vetoes the action. Sam may come to chat with you when Sam is social-hungry and in a good mood.
- **Dog AI**: a short priority list (potty → drink/eat → beg → sleep → want play → wander).
- **Social**: one conversation object shared by both participants. Either side ending it ends it for both.

## Gamepad
Full controller support, mapped in `src/input/gamepad.js` and `src/main.js`. README has the button table.
- The stick walks tile by tile relative to the camera. It is tested at all four camera rotations, because at the default pose a hard-coded mapping would look correct too.
- A highlight ring marks the nearest usable thing; the D-pad cycles it. A opens that thing's menu, or acts directly if there's only one action.
- The first pad press after using the mouse only switches to pad mode; it doesn't act (Brain `viva#E3`).
- Menu navigation ignores a direction already held when the menu opened, until the stick returns to centre (Brain `viva#E8`, `viva#E16`).
- The pad is polled every frame, not through connect events (Brain `test#E3`). The help text switches to pad controls while the pad is in use.

## Lessons pulled from Brain
- Low mood changes **perception only**: the screen desaturates, but you can still act normally. Coupling a meter to competence causes a death spiral (Brain `seven#E59`).
- Utility AI with multiplicative scoring, so one zero is a veto (Brain ideas kernels).
- Fixed-step accumulator; `requestAnimationFrame` timestamps are not trusted (Brain `seven#E8`, `dog#E22`, particle step lesson).
- Followers arrive strictly inside the act distance (Brain `viva#E4`).
- Reachability is tested on the real map, not a synthetic one (Brain `dog#E34`).
- three.js comes from a CDN, not vendored, because a vendored copy trips the Brain commit gate (Brain `flood#E11`).

## Open / next
- Open 🔴 tension T77: NPC memory guardrails. We chose a fading grudge with no floor.
- Day/night lighting, sound, save/load.
- More social options (texting Sam, inviting guests), dog walks.
- Balance pass after playtesting.
