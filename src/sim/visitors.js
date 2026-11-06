// Visitors: Sam's friend Jo comes over about once a week. Built from Brain's visitor training:
// - Notice: a visit that judges the house needs at least (target - worst state) / cleaning rate of AWAKE
//   notice (0101#E80). Visits are announced by noon for a 19:00 arrival: 7 awake hours.
// - Jo judges the living room and kitchen on arrival; Sam's mood and bond follow (good or embarrassing).
// - A guest occupies Sam (it cost Sam's chats with the player -1 to 3.25 a week by placement alone), so
//   the player is part of the visit: each hour you spend in the living room with them counts as time
//   together (bond + social), which cut the worst case 3.25 -> 1.25 in the sandbox.
// - Visits only land on evenings Sam is home (not a work night), at most one a week.
import { HOUR, MIN, DAY, log, bump, addNeed, roomOf, dayOf } from './state.js';
import { addBond } from './bond.js';
import { effectiveClean } from './mopping.js';
import { shiftFor } from './schedule.js';
import { SPOTS } from './map.js';
import { task } from './tasks.js';

// good/bad lines placed between measured prep (55-89) and lazy (0-28) impressions (tools/visitors-measure.mjs),
// per the fail-state calibration lesson: a guessed 60 sat inside the prep player's spread.
export const VISIT = { hour: 19, hours: 3, announceHour: 12, good: 50, bad: 40, rooms: ['living', 'kitchen'], name: 'Jo', first: [3, 7], gap: [5, 9] };

const hash = (a, b) => { let h = (a * 2654435761 + b * 40503) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x5bd1e935) >>> 0; return (h ^ (h >>> 15)) >>> 0; };

// Which days Jo visits. Each visit comes 5-9 days after the last one, on an evening Sam is home, chosen
// by a hash of (seed, n) so it varies without touching the shared RNG. (It used to be a hashed day within
// each calendar week: same 7-day mean, but 19 of 20 seeds had a 12-13 day gap and some visits came 1-2 days
// apart. Brain: schedule recurring events by bounded interval from the last one.)
const homeEvening = (seed, day) => { const s = shiftFor(seed, day); return !s || s.ret < VISIT.hour - 1; };
const plans = new Map(); // seed -> visit days so far (pure function of the seed, cached)
export function visitDays(seed, upTo) {
  let days = plans.get(seed);
  if (!days) { days = []; plans.set(seed, days); }
  while (!days.length || days[days.length - 1] <= upTo) {
    const n = days.length;
    const lo = n ? days[n - 1] + VISIT.gap[0] : VISIT.first[0];
    const hi = n ? days[n - 1] + VISIT.gap[1] : VISIT.first[1];
    let open = [];
    for (let d = lo; d <= hi; d++) if (homeEvening(seed, d)) open.push(d);
    for (let d = hi + 1; !open.length && d <= hi + 7; d++) if (homeEvening(seed, d)) open.push(d); // Sam works every evening in range
    if (!open.length) open = [hi];
    days.push(open[hash(seed, n) % open.length]);
  }
  return days;
}
export const isVisitDay = (seed, day) => visitDays(seed, day).includes(day);

export function initVisitors(st) {
  st.visit = null; // { day, at, end, announced, impression }
  st.visitsDone = 0;
}

const arriveAt = (day) => (day - 1) * DAY + VISIT.hour * HOUR;

export function houseImpression(st) {
  return VISIT.rooms.reduce((s, r) => s + effectiveClean(st, r), 0) / VISIT.rooms.length;
}

// Once a game minute.
export function visitorTick(st) {
  if (!st.agents.guest) return;
  const day = dayOf(st);
  // announce at noon on the day
  if (isVisitDay(st.seed, day) && (!st.visit || st.visit.day !== day) && st.time >= (day - 1) * DAY + VISIT.announceHour * HOUR && st.time < arriveAt(day)) {
    st.visit = { day, at: arriveAt(day), end: arriveAt(day) + VISIT.hours * HOUR, impression: null, joinedMin: 0 };
    log(st, `📅 Sam: "My friend ${VISIT.name} is coming over at ${VISIT.hour > 12 ? VISIT.hour - 12 : VISIT.hour} PM. Hope the place looks okay."`, 'npc');
  }
  const v = st.visit;
  if (!v || v.day !== day) return;
  const g = st.agents.guest;
  const npc = st.agents.npc;
  const p = st.agents.player;
  if (st.time >= v.at && st.time < v.end && g.away && v.impression === null) {
    if (npc.away || npc.asleep) { v.impression = -1; log(st, `${VISIT.name} couldn't come after all.`, 'npc'); return; }
    g.away = false;
    Object.assign(g, { c: SPOTS.garageExit[0], r: SPOTS.garageExit[1], x: SPOTS.garageExit[0] + 0.5, z: SPOTS.garageExit[1] + 0.5, path: [], task: null });
    g.task = task('visit', 'Visiting', [{ obj: 'couch', pose: 'sit', until: (s) => s.time >= v.end }]);
    const imp = houseImpression(st);
    v.impression = imp;
    st.visitsDone += 1;
    if (imp >= VISIT.good) {
      addBond(st, 6, 'the house looked nice for Jo');
      bump(st, npc, 8, 6, 'the house looked nice for Jo');
      log(st, `👋 ${VISIT.name} arrived. "Your place looks great!" Sam beams.`, 'npc');
    } else if (imp < VISIT.bad) {
      addBond(st, -4, 'the house was a mess for Jo');
      bump(st, npc, -8, 6, 'embarrassed in front of Jo');
      log(st, `👋 ${VISIT.name} arrived and glanced at the mess. Sam looks embarrassed.`, 'npc');
    } else {
      log(st, `👋 ${VISIT.name} arrived. Sam and ${VISIT.name} head to the living room.`, 'npc');
    }
  }
  if (!g.away && st.time < v.end) {
    // the player joining: an hour in the living room with them counts as time together
    if (!p.asleep && roomOf(p) === 'living' && roomOf(npc) === 'living') {
      v.joinedMin += 1;
      addNeed(p, 'social', 20 / 60);
      if (v.joinedMin % 60 === 0) addBond(st, 3, 'hung out with Sam and Jo');
    }
  }
  if (!g.away && st.time >= v.end && !v.leaving) {
    v.leaving = true;
    log(st, `👋 ${VISIT.name} heads home.${v.joinedMin >= 60 ? ' "Nice to meet you!"' : ''}`, 'npc');
    g.task = task('leave', 'Heading home', [{ tiles: [SPOTS.garageExit], dur: 0, end: (s, a) => { a.away = true; a.task = null; } }]);
  }
  if (!g.away && v.leaving && st.time >= v.end + 2 * HOUR) { g.away = true; g.task = null; g.path = []; } // never strand Jo
}

export const visitActive = (st) => !!(st.visit && st.agents.guest && !st.agents.guest.away && st.time < st.visit.end);
export const visitMinutesLeft = (st) => (st.visit ? Math.max(0, Math.ceil((st.visit.end - st.time) / MIN)) : 0);
