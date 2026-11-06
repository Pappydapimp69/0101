import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command } from '../src/sim/sim.js';
import { HOUR, DAY } from '../src/sim/state.js';
import { GROCERY, takeFood, groceryTick } from '../src/sim/groceries.js';

const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };

test('an order is paid now and arrives the next morning at 10:00', () => {
  const st = createState(1); st.agents.npc.thinkAt = Infinity; st.agents.npc.away = true;
  st.fridge = [];
  const m0 = st.money;
  command(st, { type: 'orderGroceries' });
  assert.equal(st.money, m0 - (GROCERY.order * GROCERY.price + GROCERY.fee));
  const arrive = (Math.floor(st.time / DAY) + 1) * DAY + GROCERY.arriveHour * HOUR;
  run(st, arrive - st.time - 120);
  assert.equal(st.fridge.length, 0, 'not before 10:00');
  run(st, 240);
  assert.equal(st.fridge.length, GROCERY.order);
});

test('food is eaten oldest first and goes off after the shelf life', () => {
  const st = createState(2);
  st.fridge = [st.time + 1 * HOUR, st.time + 5 * DAY, st.time + 6 * DAY];
  assert.equal(takeFood(st, 'snack'), true);
  assert.deepEqual(st.fridge, [st.time + 5 * DAY, st.time + 6 * DAY]);
  st.time += 5 * DAY + 1; groceryTick(st);
  assert.equal(st.fridge.length, 1);
  assert.equal(st.spoiled, 1);
  assert.equal(takeFood(st, 'cook'), false, 'cooking needs 2 portions');
});

test('Sam reorders before the fridge runs dry, counting what is on the way, and minds always buying', () => {
  const st = createState(3);
  st.agents.npc.away = false; st.agents.npc.asleep = false;
  st.fridge = Array(GROCERY.samBelow + 1).fill(st.time + DAY);
  groceryTick(st);
  assert.equal(st.deliveries.length, 0, 'enough food: no order');
  st.fridge.splice(0, 2);
  groceryTick(st);
  assert.equal(st.deliveries.length, 1);
  groceryTick(st);
  assert.equal(st.deliveries.length, 1, 'counts the order already on the way');
  const b0 = st.agents.npc.bond = 300;
  st.samBuysInARow = 2; st.deliveries = []; groceryTick(st);
  assert.ok(st.agents.npc.bond < b0, 'third order in a row costs bond');
});
