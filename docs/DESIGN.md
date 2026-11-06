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

## Map (owner's layout, 2026-11-03)
- **Source:** built from the owner's layout in the 0101 House Planner artifact. The map is 60 × 60 tiles (120 × 120 ft, 1 tile = 2 ft). Rooms are roughly double the original size, the back yard is much bigger, and the garage sits beside the laundry room.
- **Overlaps:** where rooms overlapped in the planner, the smaller room took the shared floor:
  - the laundry room takes a corner of the kitchen;
  - Bedroom 3 takes the bottom of the kitchen;
  - the hallway takes a corner of Bedroom 3.
- **Doors:** 11 in all.
  - The garage is entered only from the laundry room.
  - The master bath opens only into the master bedroom.
  - The back door joins the kitchen and the yard.
- **AI spots:** named in `SPOTS` in `src/sim/map.js` (garage exit, the dog's wait spots by the back door).
- **Pathfinding:** a heap-based search over cached neighbour lists, with results cached per start tile. The bigger map made the old full scan about 30x slower.

## Defaults chosen (change any of these)
| Topic | Default |
|---|---|
| Time | 1 real second = 3 game minutes at 1× (8 min per game day). Speeds 1×/2×/4×. Walking speed was cut to 1/3 (people 0.05, dog 0.03 tiles per game second) so movement looks the same on screen as before; a walk now costs 3× the game time. Then everyone was halved again (people 0.025, dog 0.015); Sam heads to the car 45 min before leaving and wakes for needs at 12 instead of 8 to cover the slower walks. |
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
| Sam's job | Works 5 days a week. Which 5 changes week to week (two days off drawn per week; the opening weekend is off). Sam's panel shows this week's workdays. Leaves between 6:45 and 7:15 AM and gets home between 2:15 and 5:45 PM. Each week's total hours out is 42–50, spread unevenly across the days. Sam takes the car. All times come from a hash of (seed, week/day), so they're fixed per save and vary day to day. |
| Sam's routine | Own daily schedule (`src/sim/schedule.js`). Day 1 is a Saturday.<br>**Workdays:** up 1 h before leaving, breakfast, heads to the car 20 min early and leaves on the minute, home in the afternoon, dinner around 6, TV, bed ~9:45 before a workday.<br>**Days off:** sleeps in to ~8:30, brunch, sewing, lunch, free time, dinner, TV, bed ~11:15.<br>Sleep and work are mandatory; the other blocks only weight Sam's choices, so needs can still interrupt. If something holds Sam up more than 10 min past leaving time, Sam rushes out. Sam's panel shows today's plan. |
| Sam cleaning | Sam never cleans; Sam lets the dog out and closes the door. |
| Cut-off thresholds | Sam's social < 40 **and** (mood − grudge) < 40. |
| Sam starting chats | Only when Sam's social < 70, mood ≥ 50, you're idle, and it isn't night. The first chat comes no earlier than a random 2–5 game hours in. Any real chat (either side) restarts a 4-hour cooldown. |
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

## Bond with Sam (hidden needs, tells)
- **What's hidden:** Sam's needs and mood are not shown. You read Sam from behaviour: tells over Sam's head and in the Sam panel ("*yawns*", "*peers into the fridge*", "*sighs at the mess*", "*hovers nearby*"), a yawn pose, and slower walking when tired. A tell appears every 25–55 game minutes for Sam's most pressing hidden state (`src/sim/bond.js`).
- **Bond (0–1000, 10 stages).** Earned by reading Sam right:
  - a chat Sam was open to: +12 (+6 more if Sam came to you)
  - quiet company in the same room: +2/h
  - cleaning a dirty room Sam is in: +6
  - getting cut off: −2. A misread teaches, so it costs little: no spiral.
- **Fading:** bond fades 0.5/h only after a full day with no time together (no chat, no shared room), and never below a stage held for a full day; the grudge fades separately at 8/h. Settles T196 for 0101: measured on the real sim (`tools/t196-bond-memory.mjs`, 5 seeds, 30 days), a continuous fade (12/day) cancelled a nightly chat and stalled the bond at stage 1-3; absence-only fade gives steady progress (~30 bond per chat with topics), a week apart costs under one stage, and a pestering grudge is gone by morning.
- **Stages:** each one lets you two communicate more:

| Stage | Name | Unlocks |
|---|---|---|
| 1 | Stranger | Body language only. |
| 2 | Housemate | Sam greets you coming home. |
| 3 | Acquaintance | Refusals come with a reason ("Not now — I'm wiped."). |
| 4 | Familiar | Sam's workdays this week. |
| 5 | Friendly | Sam's mood is readable (face, mood row). |
| 6 | Friend | Sam says outright what's wrong. |
| 7 | Close friend | Sam doesn't cut you off unless really low. |
| 8 | Trusted | Sam notices your needs and says so; Sam's whole day is visible. |
| 9 | Confidant | Sam seeks you out twice as often. |
| 10 | Family | Sam's needs fully visible. |

## Chatting with Sam
- **Length:** every chat lasts 60 game minutes, about 20 real seconds at 1× (`CHAT` in `src/sim/chat.js`; tripled when time ran 3× faster so bubbles stay readable, social gain cut to 20/h so a chat still gives +20). A thin bar above the topic row shows the time left, and Sam ends with a closing line. Stop ends it early.
- **Animation:** speech bubbles over both of you, one per speaker, with Sam's stacked above yours. The speaker gestures and the listener nods. Filler chatter ("mm-hm", "haha") fills the gaps.
- **Topic row** (was a wheel; it covered a third of a phone screen): one slim row of chips above the action bar, scrolls sideways, shows unlocked topics plus the next locked one. Gamepad: left/right + A. 8 fixed topics: Small talk, Their day, Food, Biscuit, Jokes (bond 2), Work (bond 3), Feelings (bond 4), Plans (bond 6). You can pick one every 9 game minutes (~3 real s), and Sam answers ~1 real second later.
- **What each topic does** (`TOPIC_EFFECTS` in `src/sim/chat.js`); each chip shows a one-line hint:
  - **Small talk:** learn what's on Sam's mind: from bond 2 Sam names their most pressing hidden need ("Kinda hungry, honestly.").
  - **Their day:** fits (just home, or tired): Sam vents, +6 mood. Otherwise Sam tells you about tomorrow (work and what time, or a day off).
  - **Food:** fits (hungry): Sam asks you to cook. 📌 Promise: cook within 2 h and Sam gets a plate (+10 bond, Sam eats it).
  - **Biscuit:** fits (low or lonely): +6 mood and Sam goes to play with the dog afterwards.
  - **Jokes:** fits (good mood): +6 mood for both of you. Misses: −4 for Sam.
  - **Work:** fits (worked today, just home): Sam vents; if bills are waiting Sam chips in up to $40, once a week.
  - **Feelings:** fits (low or lonely): extra bond, +15 social, and any grudge is cleared.
  - **Plans:** fits (rested, good mood): 📌 TV night at 8 PM (tomorrow if it's too late). Be on the couch together within 2 h: +12 bond, mood for both.
  - **Promises:** one at a time, shown as 📌 on Sam's chip and in the Sam panel. A broken promise costs 5 bond and Sam's mood.
- **Biscuit keeps to themself more:** when bored, the dog asks you to play at most once every 2 h (3 min, then gives up) and otherwise plays with the ball alone (+25 play). When wandering to people (25% of the time) it picks a spot in their room at least 4 tiles away. Measured with bowls full: within 3 tiles of you 2-4% of awake time, was 46-58%.
- **Fit:** whether a topic lands depends on Sam's hidden state.
  - "Their day" fits right after work or when Sam is tired.
  - "Food" fits when Sam is hungry.
  - "Jokes" misses when Sam is low or tired.
  - A fit gives +4 bond and lifts Sam's mood. A neutral topic gives +1. A miss costs −1, and two misses make Sam wrap up early.
- **Gamepad:** while the wheel is open, the left stick points at a topic, A picks it and B stops the chat.

## Clutter (cleaning tools)
- **Putting things down:** the **Put down** button in the bottom bar (gamepad **X**) drops what you hold where you stand. Tapping a floor spot while holding a tool also offers **Put down … here**.
- **Where it lands:** a broom or mop put down in open space lies on the floor. Against a wall it stands upright. A mop put down on its bucket stands in the bucket.
- **What counts as clutter** (`src/sim/clutter.js`):
  - a broom or mop lying on the floor, even when nobody is around;
  - any broom, mop or bucket that a person can see (same room, awake, home).
- **Counting:** a mop and a bucket count as two items, but a mop standing in its bucket counts as one. A broom in a room that has both a mop and a bucket counts half.
- **Effect:** each clutter unit lowers the mood of people in that room by 3, and adds 0.5/h to the room's dirt. The Cleanliness panel lists each room's clutter.
- **Mop and bucket:** they are now separate items. Mopping needs the bucket in the same room.

## Dust, grime and the mop bucket
`src/sim/mopping.js`.
- **Two kinds of dirt.** Every room gathers *dust*; the broom (hard floors) and vacuum (carpet) lift it. Hard floors also gather *grime* from feet, paws, puddles, cooking (+4 a meal) and toilets (+3 a flush). Only the mop lifts grime. A room's cleanliness is dust-clean minus grime, so sweeping alone can't take a grimy room to 100; the game says so when you finish sweeping.
- **Bucket.** Must hold water + detergent, filled at any sink while you carry it (one dose from the household supply; start with 10, buy 10 for $6 at the computer or in the 💵 panel). Mopping needs the filled bucket in the same room.
- **Water ages.** Full water stays good for 3 days (100% → 0% over 72 h). Each mop rinse costs 10% and a fill gives 8 rinses. At 0% it's stagnant.
- **Mop gets dirty.** Each 20-min pass dirties it by 35; at 70+ it smears and lifts only a third as much. Rinse it at the bucket (click the bucket with the mop in hand, or with the mop standing in it).
- **Sam notices.** Mopping with water at 50% or better has no effect on Sam. Under 50% the floor smells of old mop water for 12 h: the first time Sam walks in it's −6 mood for 12 h and −2 bond, and at bond stage 3+ Sam says so. A stagnant bucket in Sam's room gets noticed once per fill (−4 mood).
- **Visible:** mop head greys as it dirties; bucket water turns olive under 50%, dark when stagnant; the Cleanliness panel shows dust · grime per hard-floor room and the bucket/mop/detergent status.
- Arithmetic note: with 10% per rinse, 4 rinses on day one leaves ~27% at the end of that day, so the bucket goes stagnant at ~1.8 days. 12.5% per rinse would make it exactly 1.5 days (and make 8 rinses empty a fresh bucket).

## Satisfaction: the invisible fail state
`src/sim/satisfaction.js`. The goal is to keep your player satisfied; how is up to you.
- **Satisfaction** is a hidden meter that follows your player's mood over days (time constant 36 game hours while sinking, 20 while climbing back). One bad hour does nothing; a bad week shows. It is never shown as a number.
- **Expression, not a game-over:** below 40 the world starts to drain toward greyscale and the walls grow taller (up to +2.6 tiles at 10 or below; the line was 60 until measured: a good player sits at satisfaction 49-56, an alert-line player at 13-20, `tools/good-player-measure.mjs`), hiding more of each room. The HUD keeps its colour so the game stays playable.
- **Failing** is the player giving up because it got too hard. Recovery is faster than the fall, and the colour and walls come back as you climb.
- Owner decisions: walls grow visually only and colours fade to greyscale; rooms do **not** stretch (no slower walking). Player personality traits are parked: not in this build.

## Alerts, camera, controls (2026-11-04)
- **Low-need alerts** (`src/sim/alerts.js`): when one of your needs drops under 20 you get a toast, a red sticky alert above the action bar (tap to go fix it: toilet, snack, drink, bed, phone) that stays until the need is back above 30, the phone/computer goes down and fast-forward drops to 1×. You also wake from sleep at 20 (bladder) / 15 (hunger, thirst). Why: an alert's real-time window is tiny at speed (bladder 20→0 is 40 real s at 1×, 2.5 s at 4× on the phone; Brain 0101#E35).
- **Needs bar 2×** the original size. On a phone it takes the whole top row and the clock sits under it on the right.
- **Camera dead-zone box:** the camera holds still while you move inside the middle of the screen and is pushed along at the box edge (`src/render/camerabox.js`).
- **Gamepad steering with lookahead:** the stick keeps its real angle and `steer()` looks 6 tiles ahead, so doorways roughly ahead are threaded (66% → 98% over every door).
- **Walking +15%:** people 0.02875, dog 0.01725 tiles per game second.
- **Running** (🏃 on the action bar, `R`, gamepad L3; walls toggle moved to ⋯ / `T`): 1.5× speed; every 4 real seconds at 1× (12 game min) of actually moving at a run costs 1% hunger and 1% thirst. Standing with run on costs nothing. Movement now carries leftover distance past each tile centre (before, faster movers lost some: running measured 1.457×).

## Shared chores and dirt balance
- **Sam pitches in** (`src/sim/chores.js`): Sam tidies the dirtiest shared room (kitchen, living, hallway, bathroom) or their own when it is under 55, only while their share of the last ~3 days of cleaning is no bigger than yours (+15 min slack). Measured (`tools/chores-measure.mjs`): Sam does ~45% of a diligent player's cleaning; a lazy player gets no free cleaning (Brain had nothing on splitting housework: trained here).
- **Dirt rates halved** (`TUNING.dirtScale = 0.5`). Measured: the whole house needed ~124 cleaning minutes a game day before walking (`tools/dirt-load-measure.mjs`), and with every chore done for real a good player was grey 76-95% of the time at the old rates (the house doubled and walking slowed 4x since they were set); at 0.5x 0-33%. Brain 0101#E11.

## Time budget (needs drain half as fast)
`TUNING.needScale = 0.5` (refills untouched; walking speeds untouched). Measured with a good-player bot doing every chore for real (`REAL=1 node tools/good-player-measure.mjs`): at the walking speeds the owner set, walking took 43-52% of the awake day, work 1-3%, and the player was in the grey fail state 70-76% of the time; with needs draining half as fast walking is 24-27%, a 4 h work shift fits (15%), grey 0% (lowest satisfaction 54-57), while a player who only reacts at the alert line stays deep in it (mean despair ~0.88). Brain dlist#E33. Knock-ons rechecked: groceries hold (Sam orders 8/28 days, 0% empty fridge), bond grows to 566-698 by day 30.

## Laundry
`src/sim/laundry.js`. 7 outfits; you change at your first wake each day. Washer (laundry room): up to 5 outfits + 1 detergent dose, 60 min; move the wet load to the dryer within 10 h or it goes musty; dryer 90 min; fold. With nothing clean you wear yesterday's clothes: −8 mood for 14 h, and Sam comments from bond stage 3. Numbers from Brain's laundry training (0101#E78: a wash-at-5 habit is safe from 5 outfits, weekend-only needs 7; the unattended-window lesson: a 10 h spoil time is longer than a night's sleep, so the "washer done" message is enough, no start guard). Measured (`tools/laundry-measure.mjs`, 28 days x 3 seeds): attentive bot 0 dirty days, 0 musty loads, 1.25 loads/week; a bot that never does laundry first wears dirty clothes on day 8 and every day after, mean mood −4. The ⋯ "You" panel shows clean/dirty/washer/dryer.

## Visitors
`src/sim/visitors.js`. Sam's friend Jo visits about once a week, on an evening Sam is home (never a work night). Sam announces it at noon for a 19:00 arrival (7 awake hours of notice: Brain 0101#E80, notice >= (target - worst state) / cleaning rate). On arrival Jo judges the living room and kitchen: average cleanliness >= 50 is a good impression (Sam +6 bond, +8 mood), under 40 embarrassing (−4 bond, −8 mood). Jo sits on the couch for 3 hours and Sam hosts; each hour you spend in the living room with them is time together (+3 bond, social refills). Tap Jo or the couch: "Sit with Sam and Jo". Measured (`tools/visitors-measure.mjs`, 8 weeks x 3 seeds): 8 visits per seed, none called off; a player who never prepares gets 0/7 good impressions (scores 0-28), one who keeps up with dishes and messes and cleans for it 20/21 (the miss: an afternoon nap ate the prep time); bond after 8 weeks 530-581 vs 288-421. (Earlier runs blamed misses on Sam cooking; the trace showed the prep bot never did dishes, so the kitchen sat at 0.) What a visit costs your chats with Sam (`tools/visit-chat-cost.mjs`, T200): keeping to yourself loses 0.4-0.5 chats a week on two seeds (Sam is busy hosting) and gains 0.75 on the third (a good impression lifts Sam's mood past their chat threshold); joining loses none and ends with more bond than a world without visits on every seed. The good line was first guessed at 60 and sat inside the prep player's spread, so it moved between the two measured ranges (fail-state calibration lesson).

## Sound
`src/render/audio.js`, all synthesized at runtime (no files; Brain T14 lean, one `sfx(kind)` seam so authored audio can replace a kind). Sounds come from sim events read off the state (speech blips per speaker, Biscuit barking when he wants something, toilet flush, back door, alert chime, Sam's car, Jo's and the groceries' doorbell, dishes washed), plus loops for what people are doing near you (vacuum, sweeping, running water, cooking, TV, washer/dryer), quieter through a wall and silent past ~14 tiles; day air and birds, night crickets, crossfaded equal-power at dawn and dusk (dog#E57). Audio never writes to the sim or draws from its RNG (sound-engine#E7). Cooldown per kind, 12 voices, 3 new sounds per frame (dog#E6). The fail state muffles the mix (low-pass from 16 kHz down to 700 Hz) and quiets it with the colours. Mute in ⋯ → Game, remembered per browser; sound starts on the first tap, click or key (browser rule). Measured (`tools/audio-measure.mjs`, 3 days x 3 seeds at 1x and 4x): the limiter drops 0-0.5% of sounds at 1x and up to 1.1% at 4x, peak 3 voices, and the sim is byte-identical with audio running. Browser check: an alert peaks at 0.063 against ambience at 0.004; muted is 0.

## Sam reaching out
Sam starts a chat when lonely, in a decent mood and off cooldown. It used to also need you to have no task at all, which shut Sam out for 77-86% of the minutes Sam wanted to talk (you are nearly always cleaning, walking or snacking), so Sam started 1-4 chats a week. Now Sam comes over, says "Got a sec when you're done?" and waits up to 15 game minutes for you to finish, without interrupting (Brain od75#E3: a chat is not urgent enough to cut into what you're doing); giving up, Sam goes back to the phone for an hour. Measured (`tools/sam-reach-out-measure.mjs`, 2 weeks x 3 seeds): a player who lets Sam talk gets 4.5-5 Sam-started chats a week (from 1/3/4), Sam's lowest social unchanged (33-42); the cap is now Sam's own loneliness (about once a day), not your being busy. Bond harness unchanged (day-30 bond 565-695).

## Robustness sweep
`tools/chaos-sweep.mjs`: 21 days x 3 seeds of a player picking random options every 20 game min (alerts handled, bed at 22:30), checking for exceptions, NaN, agents off the map, tasks over 8 h, and the top task failures. Clean on every count. It found two bugs: Biscuit begged for an empty bowl sitting on the bowl's own use spot, so you could not fill it (now begs beside the bowls; the bowls also allow a short wait like the toilet), and the starting dishes plus every fridge glass were placed at old kitchen coordinates that are now the yard, so "Pick up dishes" failed or sent you outside while their dirt counted against the kitchen. Its "Pet Biscuit" failures with Biscuit shut in the yard now show why ("on the other side of the back door") instead of "Can't get there".

## Groceries
`src/sim/groceries.js`. The fridge holds dated portions, eaten oldest first; food keeps 7 days. A snack takes 1 portion, cooking 2. Order at the computer: 16 portions for $72 ($4 each + $8 delivery), arriving the next morning at 10:00. Sam reorders 16 when the fridge plus what's on the way is down to 10, and minds being the one who always buys (third order in a row: −3 bond each). Why lead time and shelf life rather than price: Brain 0101#E51 (money has ~4x headroom) and 0101#E5 (restock to a high quantile of demand until the next delivery). Measured (`tools/groceries-measure.mjs`, 28 days x 3 seeds): a reorder point of 2 left the fridge empty 73-77% of hungry minutes and Sam's hunger at 0; at 10 it is 0%, Sam's lowest hunger matches the no-groceries game (25-27), spoilage 0%; the house eats ~6.3 portions a day. The hunger alert sends you to the computer when the fridge is empty.

## Saving
`src/sim/save.js`. The game autosaves to the browser every 20 real seconds and when the tab is hidden or closed, and loads it on the next visit (`?seed=N` starts a fresh seeded game, `?new` or ⋯ → New game wipes the save). The save is the whole sim state (~11 KB) minus what can't be written down: running tasks, paths, a chat in progress and slot claims are dropped, and the AI and player pick up again. Kept: time, needs, mood, bond, grudge, money, bills, rooms, tools, promises, hints shown, and the RNG's full state (Brain seven#E48). Key `0101:save:v1`, namespaced because every GitHub Pages project of one account shares one origin (Brain seven#E5); every storage access is wrapped (Brain collective#E9).

## Doors
- **Garage door:** north wall of the garage, in front of the car's nose, with a driveway out. When Sam leaves for work they get in by the car, the door opens and the car drives off down the driveway; coming home it drives back in and Sam gets out (render-only, ~3.5 real seconds each way).
- **Closed doors block everyone,** people included. The back door can be opened from either side. If Sam ends up shut outside, Sam opens it to come back in, and never closes it while standing in the yard.

## Day and night
- The sun rises at 6 and sets at 6. Light ramps through dawn and dusk, the sky and ground darken, and a dim blue moonlight takes over at night (`src/sim/daylight.js`).
- Ceiling lights come on in any room where someone is awake while it's dark, and go off when they leave or fall asleep. Lit rooms add to the power bill.

## Money and bills
- **Money:** you start with $600. You earn $18 per game hour working at the computer in Bedroom 3 ("Work", time ×4). It stops by itself when a need gets low.
- **Bills:** they arrive every **Monday 9 AM** and are due 3 days later. You pay your share:
  - rent $300 a week
  - half the power: base usage, lights on, TV, computer, $1 per cooked meal
  - half the water: flushes, drinks from the tap, dishes, cooking, mopping
  - half the internet, $10
- **Typical week:** about $350, roughly 19–20 hours of work.
- **Paying:** online, from anywhere, via the 💵 chip panel or the computer menu.
- **Late bills:** +$10 per bill per day, and a −8 mood penalty while anything is overdue (perception only, never competence). No shut-offs, because losing the computer would block earning: a death spiral.
- **Not yet:** groceries.

## Home alone
On workdays Sam (and the car) leave. You're home alone with Biscuit until Sam is back, and the toast says so.

## HUD (phone-first)
Built from Brain ideas kernels `information-minimalism-with-contextual-fade` and `device-adaptive-ui`.
- **One top row:** mood face, a ring per need, a clock pill and ⋯. Rings fade while a need is ≥ 60 and pulse when it's < 25.
- **Trend arrows** on every need ring, and on mood next to the face: ▲ green while filling, ▼ muted while draining, ▼ red when it will run out within ~2 game hours. Rates are measured in game time (`src/sim/trend.js`), so arrows mean the same thing at any speed. The sheet adds "full in / empty in" times.
- **Chips** for Sam, Biscuit, 💵 money (📬 bills waiting, red when late) and the current room. A badge appears only when something needs you (🚪 dog at the door, 🥣 empty bowl, 🎾 bored, 😤 Sam annoyed, ! a filthy room).
- **One detail sheet** at a time, opened from any ring or chip. Its buttons are built once and only its text refreshes (Brain `sevin#E2`).
- **Bottom action bar** in the thumb zone: phone, plus the current action or held item with Stop / Put down. Events show as an expiring toast; history is in ⋯.
- **Controls legend** in ⋯ matches the device in use (mouse, touch or pad).
- **Mobile:**
  - `100dvh` and safe-area insets (Brain `the-game-wrong-sky#E7`, `the-game-the-recursion#E11`).
  - The camera fits the shorter screen side, so portrait isn't cropped (Brain `the-game-the-waiting-city#E7`).
  - Drag pans, pinch zooms, tap interacts.
  - Touch is tested with real CDP touch events (Brain `dog#E103`).

## Gamepad
Full controller support, mapped in `src/input/gamepad.js` and `src/main.js`. README has the button table.
- The stick walks tile by tile relative to the camera. It is tested at all four camera rotations, because at the default pose a hard-coded mapping would look correct too.
- A highlight ring marks the nearest usable thing; the D-pad cycles it. A opens that thing's menu, or acts directly if there's only one action.
- The first pad press after using the mouse only switches to pad mode; it doesn't act (Brain `viva#E3`).
- Menu navigation ignores a direction already held when the menu opened, until the stick returns to centre (Brain `viva#E8`, `viva#E16`).
- Back opens your needs sheet; L3 toggles walls.
- The pad is polled every frame, not through connect events (Brain `test#E3`). The help text switches to pad controls while the pad is in use.

## Lessons pulled from Brain
- Low mood changes **perception only**: the screen desaturates, but you can still act normally. Coupling a meter to competence causes a death spiral (Brain `seven#E59`).
- Utility AI with multiplicative scoring, so one zero is a veto (Brain ideas kernels).
- Fixed-step accumulator; `requestAnimationFrame` timestamps are not trusted (Brain `seven#E8`, `dog#E22`, particle step lesson).
- Followers arrive strictly inside the act distance (Brain `viva#E4`).
- Reachability is tested on the real map, not a synthetic one (Brain `dog#E34`).
- three.js comes from a CDN, not vendored, because a vendored copy trips the Brain commit gate (Brain `flood#E11`).

## Open / next

### Next build (from Brain queries, 2026-11-04) — BUILT 2026-11-04
Done: 1 walls fade to 35% opacity as they rise (they no longer hide rooms); 2 yes fast (80 s) and short, no slow (330 s) and padded with a reason; 3 five replies per topic outcome with a cooldown pick, four lines per topic for you, and repeats called out (half a miss); 4 📌 promise pill above the action bar with time left, pulsing under 30 min, tap for Sam's panel; 5 first-time 💡 hints from one table (`src/sim/hints.js`): mop, grime, dirty mop, stale water, chat, promise, and an in-fiction line for the fail state.

1. **Rising walls vs. the competence spiral.** The fail-state walls hide rooms, which makes the game harder to play exactly when the player is struggling. Brain (seven: sanity meters) found any competence penalty from a distress meter multiplies collapse (×1.82 from a mild penalty), and faster recovery only cancels it at 3-5× the decline's steepness; ours is ~1.8× (36 h fall / 20 h rise). Decide: keep walls purely expressive (e.g. fade to translucent, never block the room you're in), steepen recovery, or keep the trap on purpose. **Brain training (sandbox):** faster recovery does not help. What matters is the penalty against the player's normal surplus (1 − drain/service): below it every slump recovered, above it a 3-day slump trapped for good even with a 36× faster recovery. So either keep the walls' real cost to the player well under that margin, or make them cost nothing (translucent).
2. **Sam's yes and no should sound different.** Brain idea (conversation: a no arrives late and padded, a yes arrives fast and bare). Today fits and misses reply after the same delay. Fit: quick, short reply. Miss: slower, padded, with a reason ("Mm… it's my day off, so…").
3. **More reply variety for Sam.** Brain idea (barks sized to trigger rate, not writing budget): each topic has 1-2 replies per outcome and chats come every few game hours, so lines repeat fast. Size each pool to how often it fires; mix specific lines with generic filler. **Brain training (sandbox):** with a cooldown pick (skip the last pool−1 lines) Sam needs 5 lines per topic outcome (today 1-2, so 82-98% of replies are repeats within 30 real min); a shuffle bag would need ~12. A player who spams one topic can't be covered by lines: Sam should react to the repeat ("You asked me that already").
4. **Promises visible with a countdown.** od76 lesson (pay-now-receive-later reads as a loss when only a toast remains): show the active 📌 promise and its time left on screen (e.g. in the action bar), not only in Sam's panel.
5. **Point the player at the new systems.** Brain lesson (a system nothing on screen points at scores the same as one that does not exist): first-time hints for mopping (fill, rinse, freshness), promises, and the fading colour / rising walls. The game has no onboarding yet.
- Also surfaced, lower priority: Sam's lines loosen with bond ("and stuff", "or whatever" mark closeness); broken promises as a non-fading memory (ties to T196/T77); reserve object slots before walking (old 0101 lesson: 43-45% fridge give-ups); grime may go bimodal like dust (clean or filthy, nothing between) — check when tuning the mop.

### Later
- Open 🔴 tension T77: NPC memory guardrails. We chose a fading grudge with no floor.
- Day/night lighting, sound, save/load.
- More social options (texting Sam, inviting guests), dog walks.
- Balance pass after playtesting.
