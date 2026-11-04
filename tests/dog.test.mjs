import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step } from '../src/sim/sim.js';

test("Biscuit doesn't shadow the player: under 20% of awake time within 3 tiles, at most ~1 ask per 2 h", () => {
  const st = createState(2);
  const p = st.agents.player;
  const d = st.agents.dog;
  let near = 0, awake = 0, asks = 0, prev = null;
  for (let i = 0; i < 86400; i++) {
    step(st);
    st.bowls.food = st.bowls.water = 100; // fed and watered, door opened hourly: only sociability is tested
    if (st.time % 3600 === 0) st.backDoorOpen = true;
    if (i % 60 || d.asleep) continue;
    awake++;
    if (Math.hypot(d.x - p.x, d.z - p.z) < 3) near++;
    const n = d.task && d.task.name;
    if (n === 'attention' && prev !== 'attention') asks++;
    prev = n;
  }
  assert.ok(near / awake < 0.2, `near ${(100 * near / awake).toFixed(0)}%`);
  assert.ok(asks <= 13, `asks ${asks}`);
});
