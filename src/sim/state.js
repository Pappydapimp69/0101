import { ROOM_LIST, TOOLS, START, roomAt } from './map.js?v=9f2ea52';

export const MIN = 60;
export const HOUR = 3600;
export const DAY = 24 * HOUR;

// All rates are points per game hour on a 0–100 scale (100 = fully satisfied / spotless).
export const TUNING = {
  human: {
    awake: { hunger: 6, thirst: 8, bladder: 10, social: 4, energy: 5.5 },
    asleep: { hunger: 3, thirst: 4, bladder: 5, social: 1, energy: -12.5 },
    speed: 0.02875, // tiles per game second, everyone (0.15, cut to 1/3 when time ran 3x faster, halved, then +15%)
  },
  dog: {
    awake: { hunger: 5, thirst: 7, potty: 7, play: 6, energy: 4 },
    asleep: { hunger: 2.5, thirst: 3.5, potty: 3.5, play: 1, energy: -15 },
    speed: 0.01725,
  },
  // All room dirt and grime rates are scaled by this. Measured (tools/good-player-measure.mjs REAL=1): with
  // the house doubled in size and walking 4x slower than when these rates were set, a good player doing
  // every chore (dishes, dog, messes, 60 min a day cleaning) was grey 76-95% of the time at 1x; at 0.5x
  // 0-33%. Brain 0101#E11: past ~60 dirt a day a room needs cutting at the source.
  dirtScale: 0.5,
  // Need drains are scaled by this (refills untouched). Measured (tools/good-player-measure.mjs REAL=1): at
  // the owner's walking speeds a good player spent 43-52% of the awake day walking, work 1-3%, and was grey
  // 70-76% of the time; at 0.5x walking 24-27%, a 4 h work shift fits, grey 0% (Brain dlist#E33: drains must
  // leave time-to-half longer than the travel to refill).
  needScale: 0.5,
  dirt: {
    base: 1, // every room, always
    human: 1.5, // per person in the room
    dog: 2, // per dog in the room (shedding)
    dish: 0.6, // per dirty dish left in the room
    puddle: 3,
    debris: 2,
    toilet: 0.04, // × toilet dirt
    doorOpen: 3, // kitchen, while the back door is open
  },
  cutoff: { social: 60, mood: 45 }, // NPC cuts you off when BOTH are below these (40/40 almost never happened)
  // Running (player only): 1.5x speed, and every 4 real seconds of actually moving at a run (at
  // 1x: 4 s x 3 game min = 12 game min) costs 1% hunger and 1% thirst. Charged only while moving,
  // so it is a cost per distance run (Brain dlist#E55: drain locomotion per metre).
  run: { mult: 1.5, drainEvery: 12 * 60, drain: 1 },
  npcSpeed: 1, // multiplier for Sam and Biscuit on top of their kind's speed (everyone was halved together)
  grudge: { perCutoff: 12, max: 60, fadePerHour: 8, perChat: -10 },
  timeScale: { phone: 4, computer: 4, sleep: 8 },
  // Sam starting a chat with you: needs to be lonely, in a decent mood, and off cooldown.
  npcChat: { lonely: 70, mood: 50, cooldownHours: 4, firstMinHours: 2, firstMaxHours: 5 },
};

export function mulberry(st) {
  st.rng = (st.rng + 0x6d2b79f5) >>> 0;
  let t = st.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rand = mulberry;
export const pick = (st, arr) => arr[Math.floor(mulberry(st) * arr.length)];

function agent(id, kind, name, [c, r], needs) {
  return {
    id, kind, name, c, r, x: c + 0.5, z: r + 0.5, facing: 0,
    path: [], task: null, needs, mood: 70, bumps: [], grudge: 0,
    carrying: null, pose: 'stand', drawAt: null, asleep: false,
    thinkAt: 0, warnedAt: {}, chewAt: 0,
  };
}

export function createState(seed = 1) {
  const st = {
    seed, rng: seed >>> 0, time: 8 * HOUR, // Day 1, 8:00 AM
    backDoorOpen: false,
    rooms: {}, toilets: { toiletMB: { dirt: 10 }, toiletW: { dirt: 20 } },
    bowls: { food: 40, water: 60 },
    tools: {}, dishes: [], messes: [], claims: {}, conv: null,
    log: [], nextId: 1, agents: {},
  };
  for (const r of ROOM_LIST) if (!r.outdoor) st.rooms[r.id] = { clean: 70 + Math.floor(mulberry(st) * 25) };
  for (const t of TOOLS) st.tools[t.id] = { ...t, c: t.home[0], r: t.home[1], carriedBy: null };
  st.agents.player = agent('player', 'human', 'You', START.player,
    { hunger: 70, thirst: 65, bladder: 60, social: 55, energy: 90 });
  st.agents.npc = agent('npc', 'human', 'Sam', START.npc,
    { hunger: 60, thirst: 70, bladder: 75, social: 45, energy: 85 });
  // First chat attempt lands at a random point 2–5 game hours in, not on the first tick.
  const C = TUNING.npcChat;
  st.agents.npc.chatReadyAt = st.time + (C.firstMinHours + mulberry(st) * (C.firstMaxHours - C.firstMinHours)) * HOUR;
  st.agents.dog = agent('dog', 'dog', 'Biscuit', START.dog,
    { hunger: 50, thirst: 60, potty: 45, play: 50, energy: 80 });
  // Sam's friend Jo: away except during a visit (see visitors.js)
  st.agents.guest = agent('guest', 'human', 'Jo', START.npc, { hunger: 80, thirst: 80, bladder: 80, social: 80, energy: 90 });
  st.agents.guest.away = true;
  // Leftovers from last night: on the table and the counter. (These were at 10.5,5.3 and 11.5,1.5, which
  // became the yard when the house was rebuilt: "Pick up dishes" walked you outside or failed.)
  placeDish(st, 'kitchen', 26.5, 12.3);
  placeDish(st, 'kitchen', 24.5, 3.4);
  return st;
}

export const clamp = (v, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v);
export const hourOf = (st) => (st.time % DAY) / HOUR;
export const dayOf = (st) => Math.floor(st.time / DAY) + 1;
export const isNight = (st) => { const h = hourOf(st); return h >= 22 || h < 6.5; };
export const roomOf = (a) => roomAt(a.c, a.r);

export function log(st, msg, who = null) {
  st.log.push({ t: st.time, msg, who });
  if (st.log.length > 60) st.log.shift();
}

export function addNeed(a, k, v) { a.needs[k] = clamp(a.needs[k] + v); }

export function dirty(st, roomId, amount) {
  const r = st.rooms[roomId];
  if (r) r.clean = clamp(r.clean - amount);
}

export function bump(st, a, amount, hours, why) {
  a.bumps.push({ amount, until: st.time + hours * HOUR, why });
}

export function placeDish(st, room, x, z) {
  const here = st.dishes.filter((d) => Math.abs(d.x - x) < 0.3 && Math.abs(d.z - z) < 0.3).length;
  st.dishes.push({ id: st.nextId++, room, x, z, stack: here });
}

export function addMess(st, type, a) {
  const room = roomOf(a);
  if (!room || !st.rooms[room]) return;
  st.messes.push({ id: st.nextId++, type, room, x: a.x + (mulberry(st) - 0.5) * 0.4, z: a.z + (mulberry(st) - 0.5) * 0.4 });
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
