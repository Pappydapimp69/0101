import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command } from '../src/sim/sim.js';
import { MIN } from '../src/sim/state.js';
import { activeAlert, ALERT } from '../src/sim/alerts.js';

const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };
const quiet = (st) => { st.agents.npc.thinkAt = Infinity; st.agents.npc.away = true; };

test('bladder under 20: a toast, a sticky alert that leads to the toilet, and the phone goes down', () => {
  const st = createState(1); quiet(st);
  const p = st.agents.player;
  p.needs.bladder = 21;
  command(st, { type: 'phone' });
  run(st, 60);
  assert.equal(p.task && p.task.name, 'phone');
  const ev0 = st.alertEvent || 0;
  run(st, 20 * MIN);
  assert.ok(p.needs.bladder < ALERT.at);
  assert.ok(st.log.some((e) => /need the toilet/.test(e.msg)), 'toast');
  assert.ok((st.alertEvent || 0) > ev0, 'fast-forward stop signal');
  assert.ok(!p.task || p.task.name !== 'phone', 'phone put down');
  const al = activeAlert(st);
  assert.equal(al.k, 'bladder');
  assert.equal(al.cmd.type, 'toilet');
  command(st, al.cmd);
  run(st, 90 * MIN);
  assert.equal(activeAlert(st), null, 'cleared after using the toilet');
});

test('you wake up at the alert line, not at 8%', () => {
  const st = createState(2); quiet(st);
  const p = st.agents.player;
  p.needs.energy = 30; p.needs.bladder = 24;
  command(st, { type: 'sleep', obj: 'bedP' });
  run(st, 4 * 60 * MIN);
  assert.ok(!p.asleep, 'woke');
  assert.ok(p.needs.bladder >= ALERT.at - 2, `woke at bladder ${p.needs.bladder.toFixed(1)}`);
});

test('the alert does not flicker: it clears only above 30', () => {
  const st = createState(3); quiet(st);
  const p = st.agents.player;
  p.needs.hunger = 19; run(st, 20);
  assert.ok(activeAlert(st));
  p.needs.hunger = 25; run(st, 20);
  assert.ok(activeAlert(st), 'still on at 25');
  p.needs.hunger = 31; run(st, 20);
  assert.equal(activeAlert(st), null);
});
