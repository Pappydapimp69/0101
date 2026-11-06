// Laundry. Numbers from Brain's laundry training (0101#E78, #E79 and the unattended-window lesson):
// - 7 outfits: a wash-at-5 habit never runs out, and even a weekend-only habit is safe at 7.
// - You change into a clean outfit at your first wake each day; with none clean you wear yesterday's
//   (a mood hit for the day; Sam notices from bond stage 3).
// - Washer: up to 5 outfits and one detergent dose, 60 min. The wet load must go in the dryer within
//   10 h or it goes musty (back to the dirty pile). 10 h is longer than a night's sleep (~8.5 h), so the
//   "washer done" alert alone is enough: no start guard needed (Brain: guard only absences longer than
//   the spoil time).
// - Dryer: 90 min, then fold and the clothes are clean.
import { HOUR, MIN, log, bump } from './state.js?v=9f2ea52';
import { stageOf, addBond } from './bond.js?v=9f2ea52';

export const LAUNDRY = { wardrobe: 7, capacity: 5, washMin: 60, dryMin: 90, mustyHours: 10, dirtyMood: -8, dirtyHours: 14 };

export function initLaundry(st) {
  st.laundry = { clean: LAUNDRY.wardrobe - 1, dirty: 0, washer: null, dryer: null, changedDay: Math.floor(st.time / (24 * HOUR)), dirtyDays: 0, musty: 0, loads: 0 };
}

const day = (st) => Math.floor(st.time / (24 * HOUR));

// The player changes clothes at their first wake each day (called when sleep ends, and at 07:00 if
// they're up already).
export function changeClothes(st) {
  const L = st.laundry;
  if (!L || L.changedDay === day(st)) return;
  L.changedDay = day(st);
  if (L.clean > 0) {
    L.clean -= 1;
    L.dirty += 1;
    if (L.clean <= 1) log(st, `👕 ${L.clean === 0 ? 'That was your last clean outfit.' : 'One clean outfit left.'} Wash a load in the laundry room.`, 'player');
    return;
  }
  L.dirtyDays += 1;
  const p = st.agents.player;
  bump(st, p, LAUNDRY.dirtyMood, LAUNDRY.dirtyHours, "wearing yesterday's clothes");
  log(st, '👕 Nothing clean to wear, so it’s yesterday’s clothes again.', 'player');
  const npc = st.agents.npc;
  if (!npc.away && stageOf(npc.bond) >= 3) {
    log(st, 'Sam: "Wasn’t that what you wore yesterday?"', 'npc');
    addBond(st, -1, 'wearing dirty clothes');
  }
}

export function laundryTick(st) {
  const L = st.laundry;
  if (!L) return;
  const p = st.agents.player;
  if (st.time % (24 * HOUR) === 7 * HOUR && !p.asleep) changeClothes(st);
  const w = L.washer;
  if (w && !w.doneLogged && st.time >= w.doneAt) {
    w.doneLogged = true;
    log(st, '🧺 The washer is done. Move the clothes to the dryer.', 'player');
  }
  if (w && st.time >= w.doneAt + LAUNDRY.mustyHours * HOUR) {
    L.dirty += w.n;
    L.washer = null;
    L.musty += 1;
    log(st, '🧺 The wet laundry sat too long and went musty. It needs washing again.', 'player');
  }
  const d = L.dryer;
  if (d && !d.doneLogged && st.time >= d.doneAt) {
    d.doneLogged = true;
    log(st, '🧺 The dryer is done. Fold the laundry.', 'player');
  }
}

export const washerReady = (st) => !!(st.laundry.washer && st.time >= st.laundry.washer.doneAt);
export const dryerReady = (st) => !!(st.laundry.dryer && st.time >= st.laundry.dryer.doneAt);

export function startWash(st) {
  const L = st.laundry;
  if (L.washer) return 'the washer is in use';
  if (!L.dirty) return 'nothing to wash';
  if ((st.detergent ?? 0) <= 0) return 'out of detergent';
  st.detergent -= 1;
  const n = Math.min(LAUNDRY.capacity, L.dirty);
  L.dirty -= n;
  L.washer = { n, doneAt: st.time + LAUNDRY.washMin * MIN };
  L.loads += 1;
  log(st, `🧺 Washing ${n} outfit${n > 1 ? 's' : ''} (done in an hour).`, 'player');
  return null;
}

export function moveToDryer(st) {
  const L = st.laundry;
  if (!washerReady(st)) return 'the washer is not done';
  if (L.dryer) return 'the dryer is full';
  L.dryer = { n: L.washer.n, doneAt: st.time + LAUNDRY.dryMin * MIN };
  L.washer = null;
  return null;
}

export function foldLaundry(st) {
  const L = st.laundry;
  if (!dryerReady(st)) return 'the dryer is not done';
  L.clean += L.dryer.n;
  log(st, `👕 Folded ${L.dryer.n} clean outfit${L.dryer.n > 1 ? 's' : ''}.`, 'player');
  L.dryer = null;
  return null;
}

export function laundryText(st) {
  const L = st.laundry;
  if (!L) return '';
  const w = L.washer ? (st.time >= L.washer.doneAt ? 'washer done' : 'washing') : null;
  const d = L.dryer ? (st.time >= L.dryer.doneAt ? 'dryer done' : 'drying') : null;
  return `${L.clean} clean · ${L.dirty} dirty${w ? ` · ${w}` : ''}${d ? ` · ${d}` : ''}`;
}
