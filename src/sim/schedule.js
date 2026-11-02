// Sam's daily routine. Mandatory blocks (sleep, work) bind; flexible blocks bias Sam's utility
// scores toward an activity but needs can still win (a full bladder beats TV). Each day's times
// shift by a few minutes from a hash of (seed, day), not the shared RNG stream, so the schedule is
// stable no matter what else draws random numbers.
import { DAY, HOUR, dayOf } from './state.js';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Day 1 is a Saturday, so the first thing you see is Sam at home.
export const weekdayOf = (day) => (day - 1 + 5) % 7;
export const isWorkday = (day) => weekdayOf(day) < 5;

// Blocks: [startHour, id]. A block runs until the next block's start.
// bias: multiplies the utility of those actions. routine: an activity Sam does in this block
// even when no need is pressing. away: Sam is out of the house.
const WORK = [
  [0, 'sleep'], [6.75, 'morning'], [8.25, 'commute'], [8.75, 'work'], [17.5, 'evening'],
  [19.5, 'relax'], [22.75, 'bedtime'],
];
const WEEKEND = [
  [0, 'sleep'], [8.5, 'morning'], [10, 'hobby'], [12.5, 'lunch'], [13.5, 'free'], [18, 'dinner'],
  [19.5, 'relax'], [23.25, 'bedtime'],
];

export const BLOCKS = {
  sleep: { label: 'Sleeping', sleep: true },
  morning: { label: 'Morning routine', bias: { cook: 2.5, snack: 1.5, drink: 1.5, drinkFridge: 1.5, toilet: 1.3 }, chat: true },
  commute: { label: 'Leaving for work', leave: true },
  work: { label: 'At work', away: true },
  evening: { label: 'Home from work', bias: { cook: 2.5, petDog: 2 }, routine: ['tv', 0.15], chat: true },
  hobby: { label: 'Sewing', bias: { sew: 2 }, routine: ['sew', 0.4], chat: true },
  lunch: { label: 'Lunch', bias: { cook: 2.5, snack: 2 }, chat: true },
  free: { label: 'Free time', bias: { tv: 1.5, sew: 1.5, petDog: 1.5 }, routine: ['sew', 0.2], chat: true },
  dinner: { label: 'Dinner', bias: { cook: 2.5 }, chat: true },
  relax: { label: 'Relaxing', bias: { tv: 2.5 }, routine: ['tv', 0.35], chat: true },
  bedtime: { label: 'Going to bed', sleep: true, windDown: true, bias: { drinkFridge: 2, drinkSink: 2, toilet: 1.5 } },
};

function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The day's plan with jittered start times (±20 min, the same all day so blocks keep their order).
export function planFor(seed, day) {
  const base = isWorkday(day) ? WORK : WEEKEND;
  const shift = (hash(seed, day) - 0.5) * (40 / 60); // hours
  return base.map(([h, id], i) => ({ id, start: i === 0 ? 0 : h + shift, ...BLOCKS[id] }));
}

export function blockAt(st, time = st.time) {
  const day = dayOf({ time });
  const h = (time % DAY) / HOUR;
  const plan = planFor(st.seed, day);
  let cur = plan[0];
  for (const b of plan) if (h >= b.start) cur = b;
  return cur;
}

const fmt = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60 / 5) * 5;
  const H = mm === 60 ? hh + 1 : hh;
  return `${((H + 11) % 12) + 1}:${String(mm % 60).padStart(2, '0')} ${H % 24 < 12 ? 'AM' : 'PM'}`;
};

// Human-readable plan for the HUD: [{time, label, now}]
export function describeDay(st) {
  const day = dayOf(st);
  const h = (st.time % DAY) / HOUR;
  const plan = planFor(st.seed, day).filter((b) => b.id !== 'sleep');
  return plan.map((b, i) => {
    const end = plan[i + 1] ? plan[i + 1].start : 24;
    return { time: fmt(b.start), label: b.label, now: h >= b.start && h < end };
  });
}
