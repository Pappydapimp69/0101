import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/sim/sim.js';
import { HOUR } from '../src/sim/state.js';
import { satisfactionTick, despair, SAT } from '../src/sim/satisfaction.js';

const live = (st, mood, hours) => { st.agents.player.mood = mood; for (let h = 0; h < hours; h++) satisfactionTick(st, HOUR); };

test('one bad hour does nothing visible; a bad week drains the world', () => {
  const st = createState(1);
  live(st, 10, 1);
  assert.equal(despair(st), 0);
  live(st, 10, 7 * 24);
  assert.ok(despair(st) > 0.9, `despair ${despair(st)}`);
});

test('climbing back is faster than sinking', () => {
  const st = createState(1);
  st.satisfaction = SAT.start;
  let down = 0; while (despair(st) < 0.5) { live(st, 10, 1); down++; }
  let up = 0; while (despair(st) > 0) { live(st, SAT.start, 1); up++; }
  assert.ok(up < down * 2, `down ${down} h, back up ${up} h`);
  st.satisfaction = 30; const a = st.satisfaction; live(st, 50, 10); const rise = st.satisfaction - a;
  st.satisfaction = 50; live(st, 30, 10); const fall = 50 - st.satisfaction;
  assert.ok(rise > fall, `rise ${rise} vs fall ${fall}`);
});
