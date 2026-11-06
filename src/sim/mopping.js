// Two kinds of dirt, and the mop's water.
//
// - Every room gathers DUST (room.clean, 100 = no dust); the broom and vacuum clean it.
// - Hard floors also gather GRIME (room.grime, 0 = none) from feet, cooking, toilets and spills;
//   only the mop removes it. A room's cleanliness is dust-clean minus grime, so sweeping alone
//   can't take a grimy room to 100.
// - The mop needs its bucket filled with water + detergent (at a sink, one dose from the
//   household supply). Full water stays good for 3 days and goes stale on its own.
// - Mopping dirties the mop; a dirty mop smears grime around instead of lifting it. Rinse it in
//   the bucket: each rinse costs the water 10% freshness, and a bucket holds 8 rinses.
// - Mopping with water under 50% fresh leaves the room smelling of old mop water for a while.
//   Sam notices.
import { ROOM_BY_ID, roomAt } from './map.js?v=6cc01f2';
import { HOUR, MIN, clamp, log, bump, roomOf, mulberry, TUNING } from './state.js?v=6cc01f2';
import { stageOf, addBond } from './bond.js?v=6cc01f2';

export const MOP = {
  waterLifeHours: 72, // full, untouched water lasts 3 days
  rinseCost: 10, // freshness lost per rinse
  rinses: 8, // rinses per fill
  staleBelow: 50, // water under this smells, and Sam notices
  staleHours: 12, // how long the smell hangs around after mopping with stale water
  grimeGain: 45, // grime lifted by one 20-min pass with a clean mop
  dustGain: 10, // a mop pass also picks up some dust
  mopDirtPerPass: 35, // a pass dirties the mop this much
  dirtyMopAt: 70, // at or above this the mop smears: it lifts only a third as much
  detergentStart: 10, // doses on hand at the start
  detergentPack: { doses: 10, price: 6 },
  grime: { base: 0.5, human: 0.3, dog: 0.4, puddle: 2, cook: 4, toilet: 3 }, // per hour / per event
};

export const isHard = (room) => ROOM_BY_ID[room] && ROOM_BY_ID[room].floor === 'hard';
export const effectiveClean = (st, room) => {
  const r = st.rooms[room];
  return r ? clamp(r.clean - (r.grime || 0)) : 85;
};
export function addGrime(st, room, amount) {
  const r = st.rooms[room];
  if (r && isHard(room)) r.grime = clamp((r.grime || 0) + amount);
}

export function initMopping(st) {
  for (const [id, r] of Object.entries(st.rooms)) r.grime = isHard(id) ? Math.round(5 + mulberry(st) * 10) : 0;
  const b = st.tools.bucket;
  if (b) Object.assign(b, { water: true, fresh: 100, rinsesLeft: MOP.rinses });
  const m = st.tools.mop;
  if (m) m.dirt = 0;
  st.detergent = MOP.detergentStart;
}

// Once per step: grime builds on hard floors, bucket water ages, stale-mop smell fades.
export function moppingTick(st, dt) {
  const G = MOP.grime;
  const add = {};
  for (const id in st.rooms) if (isHard(id)) add[id] = G.base;
  for (const a of Object.values(st.agents)) {
    if (a.away) continue;
    const r = roomOf(a);
    if (add[r] !== undefined) add[r] += a.kind === 'dog' ? G.dog : G.human;
  }
  for (const m of st.messes) if (m.type === 'puddle' && add[m.room] !== undefined) add[m.room] += G.puddle;
  for (const [id, v] of Object.entries(add)) st.rooms[id].grime = clamp((st.rooms[id].grime || 0) + (v * (TUNING.dirtScale ?? 1) * dt) / HOUR);
  const b = st.tools.bucket;
  if (b && b.water) b.fresh = Math.max(0, b.fresh - (100 / MOP.waterLifeHours) * (dt / HOUR));
  // Sam notices a room mopped with stale water
  const npc = st.agents.npc;
  const room = roomOf(npc);
  const r = st.rooms[room];
  if (r && r.staleUntil > st.time && !npc.away && !npc.asleep && r.staleNoticed !== r.staleUntil) {
    r.staleNoticed = r.staleUntil;
    bump(st, npc, -6, MOP.staleHours, 'old mop water smell');
    if (stageOf(npc.bond) >= 3) log(st, 'Sam: "Did someone mop with old water? It stinks in here."', 'npc');
    else log(st, `Sam wrinkles their nose in the ${ROOM_BY_ID[room].name}.`, 'npc');
    addBond(st, -2, 'stale mop water');
  }
  // ...and a stagnant bucket sitting where they are
  if (b && b.water && b.fresh <= 0 && !b.stagnantNoticed && !npc.away && !npc.asleep && !b.carriedBy && roomAt(b.c, b.r) === room) {
    b.stagnantNoticed = true;
    bump(st, npc, -4, 6, 'stagnant mop bucket');
    log(st, stageOf(npc.bond) >= 3 ? 'Sam: "That mop bucket is rank. Can we dump it?"' : 'Sam eyes the mop bucket and steps around it.', 'npc');
  }
}

// What the floor needs, for labels: "dust 30 · grime 12".
export const dirtText = (st, room) => {
  const r = st.rooms[room];
  const dust = Math.round(100 - r.clean);
  return isHard(room) ? `dust ${dust} · grime ${Math.round(r.grime || 0)}` : `dust ${dust}`;
};
// Look buckets for the renderer.
export const waterLook = (b) => (!b.water ? 'empty' : b.fresh <= 0 ? 'stagnant' : b.fresh < MOP.staleBelow ? 'stale' : 'fresh');
export const mopLook = (m) => (m.dirt >= MOP.dirtyMopAt ? 'dirty' : m.dirt >= 30 ? 'used' : 'clean');

export const bucketStatus = (b) => (!b.water ? 'empty' : b.fresh <= 0 ? 'stagnant' : `${Math.round(b.fresh)}% fresh · ${b.rinsesLeft} rinse${b.rinsesLeft === 1 ? '' : 's'} left`);
export const mopStatus = (m) => mopLook(m);

// One mopping pass over a room (called through the cleaning task). Returns the end handler.
export function mopPass(st, room) {
  const mop = st.tools.mop;
  const b = st.tools.bucket;
  const eff = mop.dirt >= MOP.dirtyMopAt ? 1 / 3 : 1;
  return {
    tick: (dt, total) => {
      const r = st.rooms[room];
      r.grime = clamp((r.grime || 0) - (MOP.grimeGain * eff * dt) / total);
      r.clean = clamp(r.clean + (MOP.dustGain * dt) / total);
    },
    end: () => {
      mop.dirt = clamp(mop.dirt + MOP.mopDirtPerPass);
      if (b.fresh < MOP.staleBelow) st.rooms[room].staleUntil = st.time + MOP.staleHours * HOUR;
      if (eff < 1) log(st, 'The mop is dirty: it mostly pushed the grime around. Rinse it in the bucket.', 'player');
      else if (mop.dirt >= MOP.dirtyMopAt) log(st, 'The mop is getting dirty. Rinse it in the bucket.', 'player');
    },
  };
}

// Can the player mop this room right now? null if yes, else the reason.
export function cantMop(st, room) {
  const b = st.tools.bucket;
  const where = b.carriedBy ? roomOf(st.agents[b.carriedBy]) : null;
  const bucketRoom = where || roomAt(b.c, b.r);
  if (bucketRoom !== room) return 'bring the mop bucket into this room';
  if (!b.water) return 'fill the mop bucket at a sink first';
  return null;
}

export function rinseMop(st) {
  const b = st.tools.bucket;
  const m = st.tools.mop;
  if (!b.water || b.rinsesLeft <= 0) return 'the bucket needs refilling';
  m.dirt = 0;
  b.rinsesLeft -= 1;
  b.fresh = Math.max(0, b.fresh - MOP.rinseCost);
  log(st, `Rinsed the mop. Bucket: ${bucketStatus(b)}.`, 'player');
  return null;
}

export function fillBucket(st) {
  const b = st.tools.bucket;
  if (st.detergent <= 0) return 'out of detergent: buy more on the computer or in the 💵 panel';
  st.detergent -= 1;
  Object.assign(b, { water: true, fresh: 100, rinsesLeft: MOP.rinses, stagnantNoticed: false });
  log(st, `Filled the mop bucket with fresh water and detergent (${st.detergent} dose${st.detergent === 1 ? '' : 's'} left).`, 'player');
  return null;
}

export function buyDetergent(st) {
  const { doses, price } = MOP.detergentPack;
  if (st.money < price) return 'not enough money';
  st.money = Math.round((st.money - price) * 100) / 100;
  st.detergent += doses;
  log(st, `Bought detergent (+${doses} doses) for $${price}.`, 'player');
  return null;
}

export const MOP_MINUTES = 20 * MIN;
