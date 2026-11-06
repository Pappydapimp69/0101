import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command } from '../src/sim/sim.js';
import { roomAt } from '../src/sim/map.js';
import { pathTo, approachTiles } from '../src/sim/path.js';
import { T } from '../src/sim/tasks.js';

const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };

// The leftovers and the fridge glass used coordinates that became the yard when the house was rebuilt.
test('starting dishes are in the kitchen and reachable from where you start', () => {
  const st = createState(1);
  const p = st.agents.player;
  for (const d of st.dishes) {
    assert.equal(roomAt(Math.floor(d.x), Math.floor(d.z)), 'kitchen');
    assert.ok(pathTo(st, 'human', [p.c, p.r], approachTiles(Math.floor(d.x), Math.floor(d.z))), `dish at ${d.x},${d.z} unreachable`);
  }
});

test('a drink at the fridge leaves its glass in the kitchen', () => {
  const st = createState(1); st.agents.npc.thinkAt = Infinity; st.agents.npc.away = true;
  st.dishes = [];
  command(st, { type: 'drink', obj: 'fridge' });
  if (!st.agents.player.task) st.agents.player.task = T.drinkFridge();
  for (let i = 0; i < 4 * 3600 && !st.dishes.length; i++) step(st);
  assert.equal(st.dishes.length, 1);
  assert.equal(roomAt(Math.floor(st.dishes[0].x), Math.floor(st.dishes[0].z)), 'kitchen');
});
