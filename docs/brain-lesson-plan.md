# Brain lesson plan: 0101 house sim

These are the parts of 0101 that the build leaned on but that Brain had thin or no canon for.

The plan runs 60 training loops: 15 topics × 4 angles, in 4 segments of 15. Each segment runs one loop per topic. A loop follows `brain lab train`:

1. **Aim:** pick a claim that composes recorded lessons.
2. **Predict:** write a prediction first, one that could come out wrong.
3. **Sandbox:** a deterministic Python model (standard library only) that clearly confirms or refutes the claim.
4. **File:** a memory proposal with the sandbox shipped beside it. If the result is mixed, file a tension instead.

**GitHub Actions budget.** Each push to Brain's `memory` main triggers 2 workflow runs (steward + validate). The Tension repo has none, and 0101 has none.

- All loops in a segment are written locally under `.brain/` and checked offline with `.brain/preflight.py`, which runs the memory steward's own checks plus each sandbox.
- There is **one `brain save` per segment**: 4 memory pushes, about 8 Actions runs in total.
- No `brain note` or `save` calls happen mid-segment.

Game numbers used as the ground truth in sandboxes come from `src/sim/state.js` (`TUNING`), `src/sim/economy.js` (`ECON`) and `src/sim/schedule.js` (`JOB`).

| # | Topic | Why it's under-developed (in 0101 and in Brain) | Segment angles (A · B · C · D) |
|---|---|---|---|
| 1 | **Food & groceries** | Food is free; the fridge never empties. Brain has no stock / spoilage / shopping canon. | A: does a weekly shop vs daily small shops change the number of no-food days? · B: spoilage window vs shop cadence · C: cost of cooking vs snacking per hunger point · D: does adding grocery cost break the 42–50 h / $350 week budget? |
| 2 | **Daily time budget** | Nobody checked that a player can keep all 5 needs + 19 h of work a week + cleaning inside 24 h days. | A: minutes per day each need costs at current rates · B: the work-hours ceiling before a need hits 0 · C: how speed-ups (×4 work) change the budget · D: is there slack for social at all on workdays? |
| 3 | **NPC utility AI stability** | The bed↔toilet loop and the computer-pre-empts-chat bug both came from flat scores. | A: hysteresis/commit time vs oscillation count · B: a flat anchor score beating a rising need (desperation escape) · C: distance factor reordering choices · D: an interrupt threshold vs task thrash |
| 4 | **Schedules & routines** | Hash-jittered blocks, mandatory vs flexible blocks, off-map simulation: none of this is in canon. | A: ±jitter vs block order inversions · B: off-map floors vs freezing needs (dinner skipped) · C: the head-out margin vs late departures when a busy task blocks · D: varying weekly workdays vs streaks of 3+ days off/on |
| 5 | **Relationship memory** | T77 is open; 0101 chose a fading grudge with no floor. | A: grudge fade rate vs pestering cadence · B: a cut-off rule on AND vs OR of two meters · C: cooldown restart on attempt vs on success (opticon#E15) · D: a positive rapport meter decaying at the same rate as grudges |
| 6 | **Dog care** | Potty-at-door, begging, chewing are hand-tuned; Brain has no pet-care canon. | A: door-check cadence vs accidents per day · B: bowl size vs refills per day · C: attention-seeking follow vs play decay · D: leaving the door open (dirt) vs accidents (puddles) tradeoff |
| 7 | **Dirt & cleanliness** | Linear decay + presence + mess sources; nobody computed the steady state. | A: steady-state cleanliness per room under a typical day · B: tool gain vs decay: cleanings per week to stay above 60 · C: presence-based dirt vs room choice (where you idle) · D: dishes-left-out cost vs washing cadence |
| 8 | **Mood model** | Weighted needs + environment + bumps, exponential approach; recovery time never measured. | A: time to recover from a bad event vs time constant · B: stacking bumps vs clamping · C: perception-only low mood vs a competence penalty (seven#E59 in a needs sim) · D: environment weight vs need weight dominance |
| 9 | **Time scaling** | ×4 phone/work, ×8 sleep on a 1-s fixed step with a 4000-step cap per frame. | A: step cap vs lost game time at ×32 on slow frames · B: event resolution (bladder hits 0 inside a big frame) · C: real-time-per-day at each scale · D: walking/arrival correctness at high step counts |
| 10 | **Day/night & lighting cost** | New; lights on only where someone's awake. | A: lit-room-hours per week vs power bill share · B: twilight ramp vs number of light toggles · C: night readability: lit rooms needed to keep the player's room visible · D: should lights follow presence or schedule (switch thrash on room crossings)? |
| 11 | **Bills & cash flow** | New; late fees + mood, no shut-offs. | A: starting cash vs the first-bill shortfall · B: a late fee per bill per day vs per account: debt growth · C: the death-spiral check: what a shut-off would do to income · D: a pay-when-due habit vs pay-when-arrives habit: late days |
| 12 | **Pathing & occupancy** | Slot claims, followers, doors; 3 agents only. | A: slot contention vs give-up rate · B: a door bottleneck between hallway rooms · C: follow repath period vs overshoot · D: an agent standing on a slot tile (blocking others) |
| 13 | **Touch / pad / HUD input** | Tap vs drag thresholds, pinch, focus ring, menu latch; all added this week. | A: drag threshold px vs accidental taps · B: pinch ratio vs zoom clamps · C: focus target radius vs targets offered · D: menu latch neutral band vs eaten presses |
| 14 | **Save/load & determinism** | No save yet; tasks hold closures; mixed RNG streams. | A: the shared-stream vs hash-per-day schedule under draw-order changes · B: closure tasks vs descriptor tasks for serialization · C: resuming mid-task without drift · D: a replay checksum per day |
| 15 | **Discoverability & feedback** | Toasts, badges, arrows; nothing measures whether the player notices. | A: toast lifetime vs messages missed at speed ×4 · B: badge-only vs badge+toast for urgent states · C: trend-arrow window vs flicker · D: an "empty in" ETA error vs true time-to-zero |

## Progress

| Segment | Loops | Pushed | Notes |
|---|---|---|---|
| 1 | 1–15 (angle A) | ✓ 1 memory push (15 lessons) | 3 PASS / 12 FAIL predictions (refutations filed honestly; 4 `incompatible`). Found game bugs: tap picks at release point (t13), overdue toast always overwritten (t15). |
| 2 | 16–30 (angle B) | ✓ 1 memory push (15 lessons + 1) + Cognitive Update | 3 PASS / 12 FAIL predictions; 2 `incompatible`. Segment 1 promoted as 0101/E5–E19. More game findings: bowls go negative (t06), JSON saves drop task closures (t14). |
| 3 | 31–45 (angle C) | ✓ 1 memory push (15 lessons) | 4 PASS / 11 FAIL; 3 `incompatible` (incl. seven/E59: no competence spiral appeared in 0101's needs sim at 19–45 h/wk). t11-C settled the bills question: a power shut-off is an absorbing income trap (73/73 cut runs never recovered), so fees + mood was right. Segment 2 promoted as 0101/E21–E35. |
| 4 | 46–60 (angle D) | | |
