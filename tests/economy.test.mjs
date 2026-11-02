import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command, getOptions } from '../src/sim/sim.js';
import { DAY, HOUR, MIN } from '../src/sim/state.js';
import { ECON, unpaid, overdueBills, pay } from '../src/sim/economy.js';
import { sunAt, isDark, litRooms } from '../src/sim/daylight.js';

const keepPlayerFine = (st) => { const p = st.agents.player; p.needs.bladder = p.needs.energy = p.needs.hunger = p.needs.thirst = 100; };
function runUntil(st, t) { while (st.time < t) { keepPlayerFine(st); step(st); } }
const MON_9AM = 2 * DAY + 9 * HOUR + 60; // day 3 is the first Monday

test('day/night: dark at night, bright at noon, lights only where someone is awake', () => {
  assert.ok(sunAt(12).light > 0.95 && sunAt(0).light === 0 && sunAt(3).light === 0);
  assert.ok(sunAt(6.5).light > 0 && sunAt(6.5).light < 1); // dawn ramp
  const st = createState(1);
  st.time = 12 * HOUR;
  assert.equal(isDark(st), false);
  assert.equal(litRooms(st).size, 0);
  st.time = 21 * HOUR;
  assert.equal(isDark(st), true);
  assert.ok(litRooms(st).has('masterBed'), 'your room lights up at night');
  st.agents.player.asleep = true;
  assert.ok(!litRooms(st).has('masterBed'), 'lights off once asleep');
});

test('bills arrive Monday 9 AM, due 3 days later', () => {
  const st = createState(2);
  runUntil(st, MON_9AM - 2 * MIN);
  assert.equal(st.bills.length, 0);
  runUntil(st, MON_9AM);
  assert.equal(unpaid(st).length, 4);
  for (const b of st.bills) {
    assert.ok(b.amount > 0);
    assert.equal(b.due, b.issued + 3 * DAY);
  }
  assert.ok(st.log.some((l) => /Bills arrived/.test(l.msg)));
});

test('usage drives the power and water bills', () => {
  const idle = createState(3);
  idle.agents.npc.thinkAt = Infinity; // nobody does anything
  idle.agents.npc.task = { name: 'hold', label: 'x', steps: [{ until: () => false }], i: 0, phase: 'act', el: 0 };
  const busy = createState(3);
  busy.agents.npc.thinkAt = Infinity;
  busy.agents.npc.task = { name: 'hold', label: 'x', steps: [{ until: () => false }], i: 0, phase: 'act', el: 0 };
  // in "busy", flush and cook a few times
  for (let k = 0; k < 4; k++) {
    command(busy, { type: 'toilet', obj: 'toiletMB' });
    for (let i = 0; i < 20 * MIN; i++) { busy.agents.player.needs.energy = 100; step(busy); }
    command(busy, { type: 'cook' });
    for (let i = 0; i < 60 * MIN; i++) { busy.agents.player.needs.energy = 100; step(busy); }
  }
  const w = (s) => s.usage.water;
  const p = (s) => s.usage.power;
  for (let i = 0; i < 8 * HOUR - 0; i++) { idle.agents.player.needs.energy = 100; step(idle); }
  assert.ok(w(busy) > w(idle) + 4 * ECON.water.flush * 0.9, `water ${w(busy)} vs ${w(idle)}`);
  assert.ok(p(busy) > p(idle) + 3 * ECON.power.perMeal * 0.9, `power ${p(busy)} vs ${p(idle)}`);
});

test('late bills pick up fees daily and weigh on your mood until paid', () => {
  const st = createState(4);
  st.money = 0;
  runUntil(st, MON_9AM + 3 * DAY + 2 * MIN); // past due (Thu 9 AM)
  assert.equal(overdueBills(st).length, 4);
  const before = st.bills.map((b) => b.amount);
  runUntil(st, MON_9AM + 4 * DAY + 2 * MIN); // one more day
  st.bills.forEach((b, i) => assert.equal(b.amount, Math.round((before[i] + ECON.lateFee) * 100) / 100));
  const moodLate = st.agents.player.mood;
  st.money = 5000;
  assert.equal(pay(st), 4);
  assert.equal(unpaid(st).length, 0);
  runUntil(st, st.time + 3 * HOUR);
  assert.ok(st.agents.player.mood > moodLate, 'mood recovers after paying');
});

test('paying with too little money pays what it can, oldest first', () => {
  const st = createState(5);
  runUntil(st, MON_9AM);
  st.money = 15;
  const n = pay(st);
  assert.ok(n >= 1 && n < 4, `paid ${n}`);
  assert.ok(st.money >= 0);
  assert.ok(st.log.some((l) => /Paid/.test(l.msg)));
});

test('work earns $wage per game hour and offers to pay bills', () => {
  const st = createState(6);
  st.agents.npc.thinkAt = Infinity;
  const m0 = st.money;
  command(st, { type: 'work' });
  // walk there, then work 2 game hours
  let worked = 0;
  for (let i = 0; i < 3 * HOUR && worked < 2 * HOUR; i++) {
    keepPlayerFine(st);
    step(st);
    if (st.agents.player.task && st.agents.player.task.name === 'work' && st.agents.player.task.phase === 'act') worked++;
  }
  assert.ok(Math.abs(st.money - m0 - 2 * ECON.wage) < 0.5, `earned ${st.money - m0}`);
  runUntil(st, MON_9AM);
  assert.ok(getOptions(st, { kind: 'obj', id: 'desk' }).some((o) => o.cmd.type === 'payBills'));
});

test('balance: a normal week of bills costs 20-26 hours of work', () => {
  const st = createState(7);
  runUntil(st, MON_9AM + 7 * DAY); // two bill runs; take the second (a full week)
  const week = st.bills.filter((b) => b.issued > MON_9AM + DAY);
  const total = week.reduce((s, b) => s + b.amount, 0);
  const hours = total / ECON.wage;
  assert.ok(hours >= 18 && hours <= 26, `week bills $${total.toFixed(0)} = ${hours.toFixed(1)} h of work`);
});
