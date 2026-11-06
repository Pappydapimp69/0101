import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step } from '../src/sim/sim.js';
import { HOUR } from '../src/sim/state.js';
import { addBond, BOND } from '../src/sim/bond.js';

// T196, measured on the real sim (tools/t196-bond-memory.mjs): bond fades only for absence.
function apart(st) {
  const p = st.agents.player, n = st.agents.npc;
  n.thinkAt = Infinity; n.away = true; // keep them out of the same room
  delete st.agents.guest; // no visitors in this isolation test
  p.needs.social = 100;
}
const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };

test('within a day of time together the bond does not fade', () => {
  const st = createState(1); apart(st);
  addBond(st, 150, 'test');
  const b0 = st.agents.npc.bond;
  run(st, 20 * HOUR);
  assert.equal(st.agents.npc.bond, b0);
});

test('after a day apart it fades at the absence rate, never below a stage held for a day', () => {
  const st = createState(2); apart(st);
  addBond(st, 150, 'test');
  run(st, 30 * HOUR); // 24 h grace, then 6 h of fade; stage 2 has been held over a day -> floor 100
  const n = st.agents.npc;
  assert.ok(n.bond < 150 && n.bond >= 150 - 6 * BOND.fadePerHour - 0.01, `bond ${n.bond}`);
  run(st, 200 * HOUR);
  assert.equal(n.bond, n.bondFloor);
  assert.equal(n.bondFloor, 100);
});
