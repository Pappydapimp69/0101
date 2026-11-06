import test from 'node:test';
import assert from 'node:assert/strict';
import { visitDays, VISIT } from '../src/sim/visitors.js';
import { shiftFor } from '../src/sim/schedule.js';

// Brain: a random day per calendar week gave 12-13 day gaps on 19/20 seeds; visits now come 5-9 days apart.
test('visits come 5-9 days apart, on evenings Sam is home, for a year on 100 seeds', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const d = visitDays(seed, 364);
    assert.ok(d[0] >= VISIT.first[0] && d[0] <= VISIT.first[1] + 7);
    for (let i = 1; i < d.length; i++) {
      const g = d[i] - d[i - 1];
      assert.ok(g >= 5 && g <= 9, `seed ${seed}: gap ${g}`);
    }
    for (const x of d) { const s = shiftFor(seed, x); assert.ok(!s || s.ret < VISIT.hour - 1, `seed ${seed}: day ${x} Sam works`); }
  }
});

test('Jo arrives able to visit on a late first visit and sits on the couch', async () => {
  const { createState, step } = await import('../src/sim/sim.js');
  const { roomOf } = await import('../src/sim/state.js');
  for (const seed of [1, 2, 3]) {
    const st = createState(seed);
    const g = st.agents.guest;
    let seen = null;
    for (let i = 0; i < 12 * 86400 && !seen; i++) { step(st); if (!g.away && st.visit && st.time > st.visit.at + 45 * 60) seen = { task: g.task && g.task.name, room: roomOf(g), day: st.visit.day }; }
    assert.ok(seen && seen.day >= 3, `seed ${seed}: no visit`);
    assert.equal(seen.task, 'visit', `seed ${seed}: Jo is ${seen.task}`);
    assert.equal(seen.room, 'living');
  }
});
