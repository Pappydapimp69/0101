import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step } from '../src/sim/sim.js';
import { HOUR, DAY, dayOf } from '../src/sim/state.js';
import { planFor, blockAt, isWorkday, describeDay } from '../src/sim/schedule.js';

function week(seed) {
  const st = createState(seed);
  const npc = st.agents.npc;
  const log = [];
  const low = { hunger: 100, thirst: 100, bladder: 100 };
  for (let i = 0; i < 7 * DAY; i++) {
    const p = st.agents.player;
    p.needs.bladder = p.needs.energy = p.needs.hunger = p.needs.thirst = 100;
    step(st);
    if (i % 60 === 0) log.push({ day: dayOf(st), h: (st.time % DAY) / HOUR, away: !!npc.away, task: npc.task && npc.task.name, asleep: npc.asleep });
    for (const k in low) low[k] = Math.min(low[k], npc.needs[k]);
  }
  return { log, low };
}

test('day 1 is a weekend; weekdays have work', () => {
  assert.equal(isWorkday(1), false);
  assert.equal(isWorkday(3), true);
  assert.ok(planFor(1, 3).some((b) => b.away));
  assert.ok(!planFor(1, 1).some((b) => b.away));
});

test('schedule shifts a little day to day but keeps its order', () => {
  const starts = new Set();
  for (let d = 3; d <= 7; d++) {
    const plan = planFor(1, d);
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i].start > plan[i - 1].start);
    starts.add(plan.find((b) => b.id === 'work').start.toFixed(2));
  }
  assert.ok(starts.size >= 3, 'work start never varies');
});

test('over a week Sam keeps their routine and looks after themselves', () => {
  for (const seed of [1, 7, 21]) {
    const { log, low } = week(seed);
    const workHours = log.filter((e) => isWorkday(e.day) && e.h > 10 && e.h < 16);
    assert.ok(workHours.every((e) => e.away), `seed ${seed}: home during work hours`);
    const weekendDay = log.filter((e) => !isWorkday(e.day) && e.h > 10 && e.h < 16);
    assert.ok(weekendDay.every((e) => !e.away), `seed ${seed}: away on a weekend`);
    const deepNight = log.filter((e) => e.h > 1 && e.h < 5);
    const asleep = deepNight.filter((e) => e.asleep).length / deepNight.length;
    assert.ok(asleep > 0.85, `seed ${seed}: only asleep ${(asleep * 100).toFixed(0)}% of 1-5 AM`);
    assert.ok(!log.some((e) => e.task === 'cook' && e.h > 0.5 && e.h < 5), `seed ${seed}: cooked in the middle of the night`);
    for (const k in low) assert.ok(low[k] > 5, `seed ${seed}: Sam's ${k} fell to ${low[k].toFixed(1)}`);
  }
});

test('the HUD can show today\'s plan with the current block marked', () => {
  const st = createState(1);
  st.time = 2 * DAY + 12 * HOUR; // Monday noon
  const plan = describeDay(st);
  assert.equal(plan.filter((b) => b.now).length, 1);
  assert.equal(plan.find((b) => b.now).label, 'At work');
  assert.equal(blockAt(st).id, 'work');
});
