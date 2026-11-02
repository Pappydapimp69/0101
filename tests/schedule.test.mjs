import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step } from '../src/sim/sim.js';
import { HOUR, DAY, dayOf } from '../src/sim/state.js';
import { planFor, blockAt, isWorkday, describeDay, weekShifts, weekHours, weekOf, JOB } from '../src/sim/schedule.js';

test('day 1 is a Saturday; 5 workdays a week', () => {
  assert.equal(isWorkday(1), false);
  assert.equal(isWorkday(2), false);
  for (let w = 0; w < 10; w++) {
    let n = 0;
    for (let d = 3 + w * 7; d < 10 + w * 7; d++) if (isWorkday(d)) n++;
    assert.equal(n, 5);
  }
});

test('planned shifts: leave 6:45-7:15, return 2:15-5:45, 42-50 h a week', () => {
  const totals = [];
  for (let seed = 1; seed <= 40; seed++) {
    for (let w = 0; w < 26; w++) {
      for (const s of weekShifts(seed, w)) {
        assert.ok(s.leave >= JOB.leave[0] && s.leave <= JOB.leave[1], `leave ${s.leave}`);
        assert.ok(s.ret >= JOB.ret[0] - 1e-9 && s.ret <= JOB.ret[1] + 1e-9, `return ${s.ret}`);
      }
      const h = weekHours(seed, w);
      assert.ok(h >= 42 - 1e-6 && h <= 50 + 1e-6, `week hours ${h}`);
      totals.push(h);
    }
  }
  // it varies across the whole range, not stuck at one end
  assert.ok(Math.min(...totals) < 43.5 && Math.max(...totals) > 48.5, `${Math.min(...totals)}..${Math.max(...totals)}`);
});

test('leave and return times vary day to day', () => {
  const leaves = new Set();
  const rets = new Set();
  for (const s of weekShifts(3, 0).concat(weekShifts(3, 1))) { leaves.add(s.leave.toFixed(2)); rets.add(s.ret.toFixed(2)); }
  assert.ok(leaves.size >= 8 && rets.size >= 8);
});

function simWeeks(seed, weeks) {
  const st = createState(seed);
  const npc = st.agents.npc;
  const events = [];
  const low = { hunger: 100, thirst: 100, bladder: 100 };
  let wasAway = false;
  let night = { asleep: 0, total: 0 };
  let cookedAtNight = false;
  const end = st.time + (1 + weeks * 7) * DAY; // Sat 8 AM → the Sunday after the last full week
  while (st.time < end) {
    const p = st.agents.player;
    p.needs.bladder = p.needs.energy = p.needs.hunger = p.needs.thirst = 100;
    step(st);
    if (!!npc.away !== wasAway) { events.push({ t: st.time, away: !!npc.away }); wasAway = !!npc.away; }
    const h = (st.time % DAY) / HOUR;
    if (h > 1 && h < 4.5 && st.time % 60 === 0) { night.total++; if (npc.asleep) night.asleep++; }
    if (npc.task && npc.task.name === 'cook' && h > 0.5 && h < 4.5) cookedAtNight = true;
    for (const k in low) low[k] = Math.min(low[k], npc.needs[k]);
  }
  return { events, low, night, cookedAtNight };
}

test('in the running sim Sam leaves and returns inside the windows, 42-50 h each week', () => {
  for (const seed of [1, 9]) {
    const { events, low, night, cookedAtNight } = simWeeks(seed, 3);
    const perWeek = new Map();
    for (let i = 0; i < events.length; i += 2) {
      const out = events[i];
      const back = events[i + 1];
      assert.ok(out.away && back && !back.away, 'leave/return pairs');
      const day = dayOf({ time: out.t });
      assert.ok(isWorkday(day), `seed ${seed}: left on a day off (day ${day})`);
      const lh = (out.t % DAY) / HOUR;
      const rh = (back.t % DAY) / HOUR;
      assert.ok(lh >= 6.75 - 1e-6 && lh <= 7.25 + 1e-6, `seed ${seed} day ${day}: left at ${lh.toFixed(3)}`);
      assert.ok(rh >= 14.25 - 1e-6 && rh <= 17.75 + 1e-6, `seed ${seed} day ${day}: back at ${rh.toFixed(3)}`);
      const w = weekOf(day);
      perWeek.set(w, (perWeek.get(w) || 0) + (back.t - out.t) / HOUR);
    }
    assert.equal(perWeek.size, 3);
    for (const [w, h] of perWeek) assert.ok(h >= 42 - 0.01 && h <= 50 + 0.01, `seed ${seed} week ${w}: ${h.toFixed(2)} h out`);
    assert.ok(night.asleep / night.total > 0.85, `seed ${seed}: asleep ${(100 * night.asleep / night.total).toFixed(0)}% of 1-4:30 AM`);
    assert.ok(!cookedAtNight, `seed ${seed}: cooked in the middle of the night`);
    for (const k in low) assert.ok(low[k] > 5, `seed ${seed}: Sam's ${k} fell to ${low[k].toFixed(1)}`);
  }
});

test('the HUD plan shows the day with the current block marked', () => {
  const st = createState(1);
  st.time = 2 * DAY + 12 * HOUR; // Monday noon
  const plan = describeDay(st);
  assert.equal(plan.filter((b) => b.now).length, 1);
  assert.match(plan.find((b) => b.now).label, /Leaves for work · back/);
  assert.equal(blockAt(st).id, 'work');
  st.time = 0.5 * DAY; // Saturday noon
  assert.ok(!planFor(1, 1).some((b) => b.away));
});
