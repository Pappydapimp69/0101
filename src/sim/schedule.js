// Sam's routine and job. Sam works 5 days a week (which 5 changes week to week), leaves between 6:45 and 7:15 AM,
// gets home between 2:15 and 5:45 PM, and spends 42–50 hours a week out of the house.
// Mandatory blocks (sleep, work) bind; the other blocks bias Sam's utility scores, so needs can
// still win. All variation comes from a hash of (seed, day / week), never the shared RNG stream,
// so the plan for any day is fixed no matter what else draws random numbers.
import { DAY, HOUR, dayOf } from './state.js?v=e6c4639';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Day 1 is a Saturday, so the first thing you see is Sam at home.
export const weekdayOf = (day) => (day - 1 + 5) % 7;

export const JOB = {
  leave: [6.75, 7.25], // 6:45–7:15 AM
  ret: [14.25, 17.75], // 2:15–5:45 PM
  weekHours: [42, 50],
  wakeBeforeLeave: 1.5, // up 90 min before leaving (Sam walks slowly: the house is big)
  headOutBefore: 0.75, // starts heading to the car 45 min before leaving (a half-speed walk across the house takes ~35)
};

export const BLOCKS = {
  sleep: { label: 'Sleeping', sleep: true },
  morning: { label: 'Morning routine', bias: { cook: 2.5, snack: 1.5, drinkFridge: 1.5, drinkSink: 1.5, toilet: 1.3 }, chat: true },
  commute: { label: 'Leaving for work', leave: true },
  work: { label: 'At work', away: true },
  home: { label: 'Home from work', bias: { petDog: 2, tv: 1.5, sew: 1.3 }, routine: ['tv', 0.15], chat: true },
  hobby: { label: 'Sewing', bias: { sew: 2 }, routine: ['sew', 0.4], chat: true },
  lunch: { label: 'Lunch', bias: { cook: 2.5, snack: 2 }, chat: true },
  free: { label: 'Free time', bias: { tv: 1.5, sew: 1.5, petDog: 1.5 }, routine: ['sew', 0.2], chat: true },
  dinner: { label: 'Dinner', bias: { cook: 2.5 }, chat: true },
  relax: { label: 'Relaxing', bias: { tv: 2.5 }, routine: ['tv', 0.35], chat: true },
  bedtime: { label: 'Going to bed', sleep: true, windDown: true, bias: { drinkFridge: 2, drinkSink: 2, toilet: 1.5 } },
};

function hash(...xs) {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    h = Math.imul(h ^ (x >>> 0), 16777619);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
  }
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const lerp = (a, b, t) => a + (b - a) * t;

// Week index for a day (weeks start Monday; day 3 is the first Monday).
export const weekOf = (day) => Math.floor((day - 3) / 7);

// Which 5 of the 7 days Sam works in a given week (weekday indexes, Mon = 0). The two days off
// are drawn per week, so the pattern changes week to week. The opening weekend (days 1–2) is off.
const daysCache = new Map();
export function workdaysOf(seed, week) {
  const key = `${seed}:${week}`;
  if (daysCache.has(key)) return daysCache.get(key);
  let days = [];
  if (week >= 0) {
    const all = [0, 1, 2, 3, 4, 5, 6];
    const off1 = all.splice(Math.floor(hash(seed, week, 2) * 7), 1)[0];
    const off2 = all.splice(Math.floor(hash(seed, week, 3) * 6), 1)[0];
    days = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== off1 && d !== off2);
  }
  daysCache.set(key, days);
  return days;
}
export const isWorkday = (seed, day) => workdaysOf(seed, weekOf(day)).includes(weekdayOf(day));

// The five shifts of one week: leave and return hours whose durations sum to the week's total.
const weekCache = new Map();
export function weekShifts(seed, week) {
  const key = `${seed}:${week}`;
  if (weekCache.has(key)) return weekCache.get(key);
  const total = lerp(...JOB.weekHours, hash(seed, week, 1));
  const leave = [0, 1, 2, 3, 4].map((i) => lerp(...JOB.leave, hash(seed, week, 10 + i)));
  // each day's hours out can range from (earliest return - leave) to (latest return - leave)
  const lo = leave.map((l) => JOB.ret[0] - l);
  const hi = leave.map((l) => JOB.ret[1] - l);
  const hours = [...lo];
  // water-fill the rest of the week's total into the days in random proportions, capped per day
  let rest = total - lo.reduce((s, v) => s + v, 0);
  const w = [0, 1, 2, 3, 4].map((i) => 0.2 + hash(seed, week, 20 + i));
  for (let guard = 0; rest > 1e-9 && guard < 20; guard++) {
    const open = [0, 1, 2, 3, 4].filter((i) => hours[i] < hi[i] - 1e-9);
    const sw = open.reduce((s, i) => s + w[i], 0);
    let used = 0;
    for (const i of open) {
      const add = Math.min(hi[i] - hours[i], (rest * w[i]) / sw);
      hours[i] += add;
      used += add;
    }
    rest -= used;
  }
  const shifts = leave.map((l, i) => ({ leave: l, ret: l + hours[i] }));
  weekCache.set(key, shifts);
  return shifts;
}

export function shiftFor(seed, day) {
  const days = workdaysOf(seed, weekOf(day));
  const i = days.indexOf(weekdayOf(day));
  return i < 0 ? null : weekShifts(seed, weekOf(day))[i];
}

export function weekHours(seed, week) {
  return weekShifts(seed, week).reduce((s, x) => s + (x.ret - x.leave), 0);
}

// The day's plan: [{id, start, ...block}], start in hours. A block runs until the next one starts.
const planCache = new Map();
export function planFor(seed, day) {
  const key = `${seed}:${day}`;
  let plan = planCache.get(key);
  if (!plan) {
    plan = buildPlan(seed, day);
    if (planCache.size > 64) planCache.clear();
    planCache.set(key, plan);
  }
  return plan;
}

function buildPlan(seed, day) {
  const j = (k) => (hash(seed, day, k) - 0.5) * (40 / 60); // ±20 min
  const bed = isWorkday(seed, day + 1) ? 21.75 + j(3) / 2 : 23.25 + j(3);
  const shift = shiftFor(seed, day);
  let blocks;
  if (shift) {
    blocks = [[0, 'sleep'], [shift.leave - JOB.wakeBeforeLeave, 'morning'], [shift.leave - JOB.headOutBefore, 'commute'],
      [shift.leave, 'work'], [shift.ret, 'home']];
    const dinner = Math.max(18 + j(1), shift.ret + 0.25);
    blocks.push([dinner, 'dinner'], [Math.max(19.5 + j(2), dinner + 1), 'relax'], [bed, 'bedtime']);
  } else {
    blocks = [[0, 'sleep'], [8.5 + j(1), 'morning'], [10 + j(1), 'hobby'], [12.5 + j(2), 'lunch'], [13.5 + j(2), 'free'],
      [18 + j(4), 'dinner'], [19.5 + j(4), 'relax'], [bed, 'bedtime']];
  }
  return blocks.map(([start, id]) => ({ id, start, ...BLOCKS[id], shift }));
}

function indexAt(plan, h) {
  let i = 0;
  plan.forEach((b, k) => { if (h >= b.start) i = k; });
  return i;
}

export function blockAt(st, time = st.time) {
  const plan = planFor(st.seed, dayOf({ time }));
  return plan[indexAt(plan, (time % DAY) / HOUR)];
}

// Absolute game times Sam is due out of / back into the house on that day (null on days off).
export function shiftTimes(st, time = st.time) {
  const day = dayOf({ time });
  const s = shiftFor(st.seed, day);
  if (!s) return null;
  const d0 = (day - 1) * DAY;
  return { leaveAt: d0 + s.leave * HOUR, returnAt: d0 + s.ret * HOUR };
}

export const fmtHour = (h) => {
  let m = Math.round((h * 60) / 5) * 5;
  const H = Math.floor(m / 60) % 24;
  m %= 60;
  return `${((H + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`;
};

// Human-readable plan for the HUD: [{time, label, now}]. Sleep and the walk to the car are folded
// into their neighbours.
export function describeDay(st) {
  const plan = planFor(st.seed, dayOf(st));
  let cur = indexAt(plan, (st.time % DAY) / HOUR);
  if (plan[cur].id === 'commute') cur -= 1;
  const out = [];
  plan.forEach((b, i) => {
    if (b.id === 'sleep' || b.id === 'commute') return;
    const label = b.id === 'work' ? `Leaves for work · back ${fmtHour(b.shift.ret)}` : b.label;
    out.push({ time: fmtHour(b.start), label, now: i === cur });
  });
  return out;
}
