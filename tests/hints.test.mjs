import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step } from '../src/sim/sim.js';
import { HOUR } from '../src/sim/state.js';
import { HINTS } from '../src/sim/hints.js';

const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };
const hints = (st) => st.log.filter((e) => e.msg.startsWith('💡'));

test('every hint has text and a trigger, in one table', () => {
  for (const h of HINTS) { assert.ok(h.id && h.text.length > 20 && typeof h.when === 'function'); }
});

test('idle play does not fire the mop, promise or chat hints', () => {
  const st = createState(1);
  st.agents.npc.thinkAt = Infinity; st.agents.npc.away = true;
  run(st, 2 * HOUR);
  const ids = Object.keys(st.hintsShown || {});
  for (const id of ['mop', 'dirtyMop', 'chat', 'promise']) assert.ok(!ids.includes(id), `${id} fired while idle`);
});

test('a hint shows once, the first time its condition holds', () => {
  const st = createState(2);
  const p = st.agents.player;
  st.tools.mop.carriedBy = 'player'; p.carrying = { kind: 'tool', id: 'mop' };
  run(st, 30);
  assert.equal(hints(st).filter((e) => /bucket in the same room/.test(e.msg)).length, 1);
  run(st, 600);
  assert.equal(hints(st).filter((e) => /bucket in the same room/.test(e.msg)).length, 1, 'still once');
});

test('the fail-state hint stays in the fiction: no meter, no numbers', () => {
  const h = HINTS.find((x) => x.id === 'flat');
  assert.ok(!/\d|satisfaction|meter|wall|grey|colou?r/i.test(h.text), h.text);
});
