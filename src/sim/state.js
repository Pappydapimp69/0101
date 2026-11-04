import { ROOM_LIST, TOOLS, START, roomAt } from './map.js?v=f56e121';

export const MIN = 60;
export const HOUR = 3600;
export const DAY = 24 * HOUR;

// All rates are points per game hour on a 0–100 scale (100 = fully satisfied / spotless).
export const TUNING = {
  human: {
    awake: { hunger: 6, thirst: 8, bladder: 10, social: 4, energy: 5.5 },
    asleep: { hunger: 3, thirst: 4, bladder: 5, social: 1, energy: -12.5 },
    speed: 0.05, // tiles per game second (1/3 of 0.15: walking looks the same on screen as before time ran 3x faster)
  },
  dog: {
    awake: { hunger: 5, thirst: 7, potty: 7, play: 6, energy: 4 },
    asleep: { hunger: 2.5, thirst: 3.5, potty: 3.5, play: 1, energy: -15 },
    speed: 0.03,
  },
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
  // Leftovers from last night.
  placeDish(st, 'kitchen', 10.5, 5.3);
  placeDish(st, 'kitchen', 11.5, 1.5);
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
