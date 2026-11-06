import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command, getOptions } from '../src/sim/sim.js';
import { HOUR, MIN } from '../src/sim/state.js';
import { LAUNDRY, changeClothes, startWash, laundryTick } from '../src/sim/laundry.js';

const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };
const done = (st) => { for (let i = 0; i < 3 * HOUR && st.agents.player.task; i++) step(st); };
const quiet = (st) => { st.agents.npc.thinkAt = Infinity; st.agents.npc.away = true; };

test('wash, move to the dryer, fold: dirty clothes come back clean', () => {
  const st = createState(1); quiet(st);
  st.laundry.dirty = 5; st.laundry.clean = 1;
  command(st, { type: 'laundryWash' });
  done(st);
  assert.equal(st.laundry.washer.n, 5);
  run(st, 60 * MIN);
  assert.ok(getOptions(st, { kind: 'obj', id: 'washer' }).some((o) => o.cmd.type === 'laundryMove' && !o.disabled));
  command(st, { type: 'laundryMove' }); done(st);
  assert.equal(st.laundry.dryer.n, 5);
  run(st, 90 * MIN);
  command(st, { type: 'laundryFold' }); done(st);
  assert.equal(st.laundry.clean, 6);
  assert.equal(st.laundry.dirty, 0);
});

test('a wet load left too long goes musty and back to the dirty pile', () => {
  const st = createState(2); quiet(st);
  st.laundry.dirty = 3;
  assert.equal(startWash(st), null);
  st.time += (LAUNDRY.washMin / 60 + LAUNDRY.mustyHours) * HOUR + 60;
  laundryTick(st);
  assert.equal(st.laundry.washer, null);
  assert.equal(st.laundry.dirty, 3);
  assert.equal(st.laundry.musty, 1);
});

test('nothing clean: yesterday’s clothes, a mood hit, once a day', () => {
  const st = createState(3); quiet(st);
  st.laundry.clean = 0; st.laundry.changedDay = -1;
  changeClothes(st); changeClothes(st);
  assert.equal(st.laundry.dirtyDays, 1);
  assert.ok(st.agents.player.bumps.some((b) => /yesterday/.test(b.why)));
});
