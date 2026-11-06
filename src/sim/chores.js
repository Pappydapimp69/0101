// Shared chores. Measured (tools/dirt-load-measure.mjs): the house needs ~124 cleaning minutes a game day
// before any walking, and Sam did none of it. Brain had nothing on splitting housework, so the rule was
// trained in the real sim (tools/chores-measure.mjs): Sam tidies a dirty room they're in only while their
// share of the last ~3 days of cleaning is no bigger than yours (plus a little slack), so a diligent
// player gets real help and a lazy one can't make Sam do it all.
import { HOUR, MIN, clamp, log } from './state.js?v=6cc01f2';
import { effectiveClean, isHard } from './mopping.js?v=6cc01f2';

export const CHORES = {
  enabled: true,
  memoryHours: 72, // shares fade with a 3-day time constant
  slackMin: 15, // Sam may lead by this much
  tidyBelow: 55, // Sam tidies the room they're in when it's this dirty
  tidyMin: 15,
  tidyDust: 30, // per tidy
  tidyGrime: 20,
  rooms: ['kitchen', 'living', 'hallway', 'bathroom', 'masterBed'], // shared rooms + Sam's own
};
export const CHORE_TASKS = new Set(['clean', 'wipe', 'cleanToilet', 'cleanMess', 'tidy']);

export function addChore(st, who, dt) {
  const c = st.chores || (st.chores = { player: 0, npc: 0 });
  c[who] = (c[who] || 0) + dt / MIN;
  const tot = st.choreTotal || (st.choreTotal = { player: 0, npc: 0 });
  tot[who] = (tot[who] || 0) + dt / MIN;
}

// Every game minute: shares fade.
export function choresTick(st) {
  const c = st.chores || (st.chores = { player: 0, npc: 0 });
  const k = Math.exp(-60 / (CHORES.memoryHours * HOUR));
  c.player *= k;
  c.npc *= k;
}

// Should Sam tidy the room they're standing in?
export function samWouldTidy(st) {
  if (!CHORES.enabled) return null;
  const npc = st.agents.npc;
  const c = st.chores || { player: 0, npc: 0 };
  if (c.npc > c.player + CHORES.slackMin) return null; // doing more than their share already
  // Run 1 (tidy only the room Sam stands in) took 44-46% of the cleaning but cut the player's own minutes
  // only 5-23%: Sam's rooms are not the player's. Sam now tidies the dirtiest SHARED room (or their own).
  let best = null;
  for (const room of CHORES.rooms) {
    if (!st.rooms[room]) continue;
    const v = effectiveClean(st, room);
    if (v < CHORES.tidyBelow && (!best || v < best.v)) best = { room, v };
  }
  return best ? best.room : null;
}

export function tidyTick(st, room, dt) {
  const r = st.rooms[room];
  const frac = dt / (CHORES.tidyMin * MIN);
  r.clean = clamp(r.clean + CHORES.tidyDust * frac);
  if (isHard(room)) r.grime = clamp((r.grime || 0) - CHORES.tidyGrime * frac);
}

export function tidyDone(st, room) {
  log(st, `Sam tidied up the ${room === 'masterBed' ? 'master bedroom' : room}.`, 'npc');
}
