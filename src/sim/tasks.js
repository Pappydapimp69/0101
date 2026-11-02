// Task = a list of steps. A step may walk somewhere (an object slot, a tile set, or another
// agent), then act for a duration or until a condition holds. Player and NPC share builders.
import { OBJ, roomAt, ROOM_BY_ID, COLS, ROWS } from './map.js?v=7c67799';
import { pathTo, approachTiles, walkable } from './path.js?v=7c67799';
import {
  MIN, HOUR, TUNING, addNeed, dirty, placeDish, log, bump, clamp, dist, roomOf, pick,
} from './state.js?v=7c67799';

export function task(name, label, steps, opts = {}) {
  return { name, label, steps, i: 0, phase: 'start', el: 0, repath: 0, ...opts };
}

const slotKey = (objId, i) => `${objId}:${i}`;
export function slotFree(st, objId, i, a) {
  const who = st.claims[slotKey(objId, i)];
  return !who || who === a.id;
}
export function freeSlots(st, objId, a) {
  return OBJ[objId].slots.map((s, i) => i).filter((i) => slotFree(st, objId, i, a));
}
function release(st, a) {
  for (const k of Object.keys(st.claims)) if (st.claims[k] === a.id) delete st.claims[k];
}

function goalsFor(st, a, s) {
  if (s.obj) {
    return freeSlots(st, s.obj, a).map((i) => OBJ[s.obj].slots[i].tile);
  }
  if (s.tiles) return typeof s.tiles === 'function' ? s.tiles(st, a) : s.tiles;
  if (s.follow) return besideTiles(st.agents[s.follow]);
  return null;
}

// Tiles next to an agent (so two people never stand in the same spot).
function besideTiles(t) {
  const out = [];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const c = t.c + dc;
    const r = t.r + dr;
    if (walkable(c, r) && roomAt(c, r) === roomAt(t.c, t.r)) out.push([c, r]);
  }
  return out.length ? out : [[t.c, t.r]];
}

function moveAlong(st, a, dt) {
  const spd = TUNING[a.kind].speed * dt;
  const [c, r] = a.path[0];
  const tx = c + 0.5;
  const tz = r + 0.5;
  const dx = tx - a.x;
  const dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d > 1e-6) a.facing = Math.atan2(dx, dz);
  if (d <= spd) {
    a.x = tx; a.z = tz; a.c = c; a.r = r;
    a.path.shift();
  } else {
    a.x += (dx / d) * spd;
    a.z += (dz / d) * spd;
  }
}

function fail(st, a, msg) {
  if (msg && a.id === 'player') log(st, msg, a.id);
  cancelTask(st, a);
}

export function cancelTask(st, a) {
  const t = a.task;
  release(st, a);
  a.task = null;
  a.path = [];
  a.drawAt = null;
  a.pose = 'stand';
  a.asleep = false;
  if (t && t.onCancel) t.onCancel(st, a, t);
}

function finish(st, a) {
  release(st, a);
  a.task = null;
  a.drawAt = null;
  a.pose = 'stand';
  a.asleep = false;
}

const FOLLOW_ACT = 1.6; // act within this distance…
const FOLLOW_ARRIVE = 1.05; // …and stop walking strictly inside it

export function runTask(st, a, dt) {
  const t = a.task;
  if (!t) {
    if (a.path.length) moveAlong(st, a, dt);
    a.pose = a.path.length ? 'walk' : 'stand';
    return;
  }
  const s = t.steps[t.i];
  if (!s) return finish(st, a);

  if (t.phase === 'start') {
    a.drawAt = null;
    a.pose = 'stand';
    a.path = [];
    const goals = goalsFor(st, a, s);
    if (goals) {
      if (!goals.length) return fail(st, a, s.busyMsg || `${s.obj ? OBJ[s.obj].name : 'That'} is in use.`);
      const near = s.follow && dist(a, st.agents[s.follow]) <= FOLLOW_ARRIVE;
      if (!near) {
        const p = pathTo(st, a.kind, [a.c, a.r], goals);
        if (!p) return fail(st, a, "Can't get there.");
        a.path = p;
      }
    }
    t.phase = 'move';
    t.repath = 0;
  }

  if (t.phase === 'move') {
    if (s.follow) {
      const tgt = st.agents[s.follow];
      t.repath += dt;
      if (dist(a, tgt) <= FOLLOW_ARRIVE) a.path = [];
      else if (t.repath >= 4 || !a.path.length) {
        t.repath = 0;
        a.path = pathTo(st, a.kind, [a.c, a.r], besideTiles(tgt)) || [];
        if (!a.path.length && dist(a, tgt) > FOLLOW_ACT) return fail(st, a, `Can't reach ${tgt.name}.`);
      }
    }
    if (a.path.length) {
      a.pose = 'walk';
      moveAlong(st, a, dt);
      if (a.task !== t) return;
      if (a.path.length || (s.follow && dist(a, st.agents[s.follow]) > FOLLOW_ACT)) return;
    }
    if (s.obj) {
      const o = OBJ[s.obj];
      const i = o.slots.findIndex((sl) => sl.tile[0] === a.c && sl.tile[1] === a.r);
      if (i < 0 || !slotFree(st, s.obj, i, a)) { t.phase = 'start'; return; } // someone beat us to it
      st.claims[slotKey(s.obj, i)] = a.id;
      t.slot = i;
      const sl = o.slots[i];
      if (sl.at) a.drawAt = sl.at;
      const cx = o.rect[0] + o.rect[2] / 2;
      const cz = o.rect[1] + o.rect[3] / 2;
      if (!sl.at) a.facing = Math.atan2(cx - a.x, cz - a.z);
      else a.facing = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }[o.face] ?? a.facing;
    }
    if (s.follow) {
      const tgt = st.agents[s.follow];
      a.facing = Math.atan2(tgt.x - a.x, tgt.z - a.z);
    }
    t.phase = 'act';
    t.el = 0;
    if (s.begin && s.begin(st, a, t) === false) { if (a.task === t) finish(st, a); return; }
    if (a.task !== t) return;
  }

  if (t.phase === 'act') {
    a.pose = s.pose || 'use';
    t.el += dt;
    if (s.roam) {
      if (a.path.length) moveAlong(st, a, dt);
      else if (t.el - (t.roamAt || 0) > 90) {
        t.roamAt = t.el;
        a.path = pathTo(st, a.kind, [a.c, a.r], [pick(st, s.roam(st, a))]) || [];
      }
    }
    if (s.tick) s.tick(st, a, dt, t);
    if (a.task !== t) return;
    const done = s.until ? s.until(st, a, t) : t.el >= (s.dur || 0);
    if (done) {
      if (s.end) s.end(st, a, t);
      if (a.task !== t) return;
      release(st, a);
      a.drawAt = null;
      t.i++;
      t.phase = 'start';
      if (t.i >= t.steps.length) finish(st, a);
    }
  }
}

// ----------------------------------------------------------------- builders
const perSec = (perHour) => perHour / HOUR;
const roomTiles = (roomId) => {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (roomAt(c, r) === roomId && walkable(c, r)) out.push([c, r]);
  return out;
};
export const ROOM_TILES = {};
for (const id of Object.keys(ROOM_BY_ID)) ROOM_TILES[id] = roomTiles(id);

function eatAtTable(minutes, hunger) {
  return {
    obj: 'table', dur: minutes * MIN, pose: 'sit',
    tick: (st, a, dt) => addNeed(a, 'hunger', (hunger * dt) / (minutes * MIN)),
    end: (st, a, t) => {
      a.carrying = null;
      const [x, z] = OBJ.table.slots[t.slot].dish;
      placeDish(st, 'kitchen', x, z);
    },
  };
}

export const T = {
  walk: (c, r) => task('walk', 'Walking', [{ tiles: approachTiles(c, r), dur: 0 }]),

  cook: () => task('cook', 'Cooking', [
    { obj: 'stove', dur: 30 * MIN, begin: (st, a) => { dirty(st, 'kitchen', 8); }, end: (st, a) => { a.carrying = { kind: 'meal' }; } },
    eatAtTable(20, 65),
  ], { hands: true }),

  snack: () => task('snack', 'Snacking', [
    { obj: 'fridge', dur: 3 * MIN, begin: (st) => dirty(st, 'kitchen', 1), end: (st, a) => { a.carrying = { kind: 'meal' }; } },
    eatAtTable(10, 25),
  ], { hands: true }),

  drinkFridge: () => task('drink', 'Having a drink', [
    { obj: 'fridge', dur: 4 * MIN, tick: (st, a, dt) => addNeed(a, 'thirst', (45 * dt) / (4 * MIN)), end: (st) => placeDish(st, 'kitchen', 11.5, 1.5) },
  ], { hands: true }),

  drinkSink: (obj) => task('drink', 'Drinking water', [
    { obj, dur: 3 * MIN, tick: (st, a, dt) => addNeed(a, 'thirst', (30 * dt) / (3 * MIN)) },
  ]),

  toilet: (obj) => task('toilet', 'Using the toilet', [
    {
      obj, dur: 6 * MIN, pose: 'sit',
      begin: (st, a) => {
        if (st.toilets[obj].dirt > 60) bump(st, a, -8, 2, 'gross toilet');
      },
      end: (st, a) => {
        a.needs.bladder = 100;
        st.toilets[obj].dirt = clamp(st.toilets[obj].dirt + 15);
        dirty(st, OBJ[obj].room, 3);
      },
    },
  ], { busy: true }),

  sleep: (obj) => task('sleep', 'Sleeping', [
    {
      obj, pose: 'lie',
      begin: (st, a) => { a.asleep = true; },
      until: (st, a) => a.needs.energy >= 100 || a.needs.bladder < 8 ||
        (a.id === 'player' && (a.needs.hunger < 6 || a.needs.thirst < 6)),
      end: (st, a) => {
        a.asleep = false;
        if (a.id === 'player' && a.needs.energy < 100) log(st, 'You woke up — something needs attention.', a.id);
      },
    },
  ], { busy: true, timeScale: TUNING.timeScale.sleep, sleeping: true }),

  passOut: () => task('passOut', 'Passed out', [
    {
      pose: 'lie', begin: (st, a) => { a.asleep = true; },
      tick: (st, a, dt) => addNeed(a, 'energy', perSec(-3) * dt), // slower than a bed (asleep rate applies too)
      until: (st, a) => a.needs.energy >= 35,
      end: (st, a) => { a.asleep = false; },
    },
  ], { busy: true, timeScale: TUNING.timeScale.sleep, sleeping: true }),

  nap: () => task('nap', 'Napping', [
    { obj: 'couch', pose: 'lie', begin: (st, a) => { a.asleep = true; }, until: (st, a, t) => a.needs.energy >= 70 || t.el > 2 * HOUR, end: (st, a) => { a.asleep = false; } },
  ], { low: true, timeScale: TUNING.timeScale.sleep, sleeping: true }),

  tv: (minutes = 45) => task('tv', 'Watching TV', [
    { obj: 'couch', pose: 'sit', dur: minutes * MIN, end: (st, a) => bump(st, a, 6, 1, 'watched TV') },
  ], { low: true }),

  computer: (minutes = null) => task('computer', 'On the computer', [
    {
      obj: 'desk', pose: 'sit',
      tick: (st, a, dt) => addNeed(a, 'social', perSec(28) * dt),
      until: (st, a, t) => a.needs.social >= 100 || (minutes !== null && t.el >= minutes * MIN),
    },
  ], { low: true, hands: true, timeScale: TUNING.timeScale.computer }),

  phone: (minutes = null) => task('phone', 'On the phone', [
    {
      pose: 'phone',
      tick: (st, a, dt) => addNeed(a, 'social', perSec(20) * dt),
      until: (st, a, t) => a.needs.social >= 100 || (minutes !== null && t.el >= minutes * MIN),
    },
  ], { low: true, timeScale: TUNING.timeScale.phone }),

  fillBowl: (which) => task('fill', which === 'food' ? 'Filling the food bowl' : 'Filling the water bowl', [
    { obj: which === 'food' ? 'foodBowl' : 'waterBowl', dur: 2 * MIN, end: (st) => { st.bowls[which] = 100; } },
  ], { hands: true }),

  door: (open) => task('door', open ? 'Opening the back door' : 'Closing the back door', [
    { obj: 'backDoor', dur: 0.3 * MIN, end: (st) => { st.backDoorOpen = open; } },
  ]),

  pickTool: (id) => task('pickTool', 'Grabbing a tool', [
    {
      tiles: (st) => approachTiles(st.tools[id].c, st.tools[id].r), dur: 0.2 * MIN,
      begin: (st, a) => {
        const tool = st.tools[id];
        if (tool.carriedBy) return false;
        dropCarried(st, a);
        tool.carriedBy = a.id;
        a.carrying = { kind: 'tool', id };
      },
    },
  ]),

  pickDishes: (room) => task('pickDishes', 'Collecting dishes', [
    {
      tiles: (st) => st.dishes.filter((d) => d.room === room).flatMap((d) => approachTiles(Math.floor(d.x), Math.floor(d.z))),
      dur: 0.5 * MIN,
      begin: (st, a) => {
        const mine = st.dishes.filter((d) => d.room === room);
        if (!mine.length) return false;
        if (a.carrying && a.carrying.kind === 'tool') dropCarried(st, a);
        st.dishes = st.dishes.filter((d) => d.room !== room);
        const have = a.carrying && a.carrying.kind === 'dishes' ? a.carrying.n : 0;
        a.carrying = { kind: 'dishes', n: have + mine.length };
      },
    },
  ]),

  wash: () => task('wash', 'Washing dishes', [
    {
      obj: 'sinkK',
      begin: (st, a) => !!(a.carrying && a.carrying.kind === 'dishes'),
      until: (st, a, t) => t.el >= a.carrying.n * 2 * MIN,
      end: (st, a) => { log(st, `Washed ${a.carrying.n} dish${a.carrying.n > 1 ? 'es' : ''}.`, a.id); a.carrying = null; },
    },
  ]),

  cleanRoom: (room, kind) => {
    const spec = CLEANING[kind];
    return task('clean', `${spec.verb} the ${ROOM_BY_ID[room].name}`, [
      {
        tiles: ROOM_TILES[room], dur: spec.minutes * MIN, pose: 'clean', roam: () => ROOM_TILES[room],
        tick: (st, a, dt) => { const r = st.rooms[room]; r.clean = clamp(r.clean + (spec.gain * dt) / (spec.minutes * MIN)); },
        end: (st) => {
          const before = st.messes.length;
          st.messes = st.messes.filter((m) => !(m.room === room && spec.removes.includes(m.type)));
          if (st.messes.length < before) log(st, `Cleaned up the mess in the ${ROOM_BY_ID[room].name}.`);
        },
      },
    ]);
  },

  wipeCounters: (obj) => task('wipe', 'Wiping counters', [
    { obj, dur: 10 * MIN, pose: 'clean', tick: (st, a, dt) => { st.rooms.kitchen.clean = clamp(st.rooms.kitchen.clean + (20 * dt) / (10 * MIN)); } },
  ]),

  cleanToilet: (obj) => task('cleanToilet', 'Scrubbing the toilet', [
    {
      obj, dur: 8 * MIN, pose: 'clean',
      tick: (st, a, dt) => {
        st.toilets[obj].dirt = clamp(st.toilets[obj].dirt - (100 * dt) / (8 * MIN));
        const r = st.rooms[OBJ[obj].room];
        r.clean = clamp(r.clean + (10 * dt) / (8 * MIN));
      },
    },
  ]),

  cleanMess: (id) => task('cleanMess', 'Cleaning up a mess', [
    {
      tiles: (st) => { const m = st.messes.find((x) => x.id === id); return m ? approachTiles(Math.floor(m.x), Math.floor(m.z)) : []; },
      dur: 4 * MIN, pose: 'clean',
      end: (st) => {
        const m = st.messes.find((x) => x.id === id);
        if (!m) return;
        st.messes = st.messes.filter((x) => x.id !== id);
        const r = st.rooms[m.room];
        if (r) r.clean = clamp(r.clean + 3);
      },
    },
  ]),

  wander: (st, a, tiles, linger) => task('wander', 'Hanging out', [
    { tiles: [pick(st, tiles)], dur: linger },
  ], { low: true }),
};

export const CLEANING = {
  broom: { verb: 'Sweeping', floors: ['hard'], gain: 40, minutes: 15, removes: ['debris'] },
  vacuum: { verb: 'Vacuuming', floors: ['carpet'], gain: 45, minutes: 15, removes: ['debris'] },
  mop: { verb: 'Mopping', floors: ['hard'], gain: 35, minutes: 20, removes: ['puddle'] },
};

export function dropCarried(st, a) {
  const c = a.carrying;
  if (!c) return;
  if (c.kind === 'tool') {
    const tool = st.tools[c.id];
    tool.carriedBy = null;
    tool.c = a.c;
    tool.r = a.r;
  } else if (c.kind === 'dishes') {
    const room = roomOf(a);
    for (let i = 0; i < c.n; i++) placeDish(st, room, a.x, a.z);
  }
  a.carrying = null;
}

// ---------------------------------------------------------------- social
// One conversation object shared by both participants: either side ending it ends it for both.
export function startConversation(st, a, b) {
  const conv = { a: a.id, b: b.id, end: st.time + 15 * MIN };
  st.conv = conv;
  const g = TUNING.grudge;
  const npc = a.id === 'npc' ? a : b;
  npc.grudge = clamp(npc.grudge + g.perChat, 0, g.max);
  npc.chatReadyAt = st.time + TUNING.npcChat.cooldownHours * HOUR; // any real chat restarts Sam's cooldown
  for (const [me, other] of [[a, b], [b, a]]) {
    if (me.task) cancelTask(st, me);
    me.path = [];
    me.facing = Math.atan2(other.x - me.x, other.z - me.z);
    me.task = task('talk', `Talking with ${other.name}`, [
      {
        pose: 'talk',
        tick: (s2, ag, dt) => {
          addNeed(ag, 'social', perSec(60) * dt);
          ag.facing = Math.atan2(other.x - ag.x, other.z - ag.z);
        },
        until: (s2) => s2.conv !== conv || s2.time >= conv.end,
        end: (s2) => { if (s2.conv === conv) s2.conv = null; },
      },
    ], { phase: 'act', partner: other.id });
    me.task.onCancel = (s2) => { if (s2.conv === conv) s2.conv = null; };
  }
  log(st, `You and Sam are chatting.`);
}

// The rule the design calls for: low social AND poor mood → you get cut off.
export function wouldCutOff(npc) {
  const c = TUNING.cutoff;
  return npc.needs.social < c.social && npc.mood - npc.grudge < c.mood;
}

export const T_social = {
  talk: () => task('talk-approach', 'Going to talk to Sam', [
    {
      follow: 'npc', dur: 0,
      begin: (st, a) => {
        const npc = st.agents.npc;
        if (npc.asleep || (npc.task && npc.task.busy)) {
          log(st, `Sam is busy (${npc.task ? npc.task.label.toLowerCase() : 'asleep'}).`, a.id);
          return false;
        }
        if (wouldCutOff(npc)) {
          const g = TUNING.grudge;
          npc.grudge = clamp(npc.grudge + g.perCutoff, 0, g.max);
          addNeed(a, 'social', 1.5);
          log(st, pick(st, ['Sam cuts you off.', 'Sam: "Not now."', 'Sam sighs and looks away.', 'Sam: "Can you not?"']), 'npc');
          return false;
        }
        startConversation(st, a, npc);
      },
    },
  ]),

  pet: () => task('pet', 'Petting Biscuit', [
    {
      follow: 'dog', dur: 4 * MIN, pose: 'pet',
      begin: (st, a) => {
        const dog = st.agents.dog;
        if (dog.task) cancelTask(st, dog);
        dog.task = task('petted', 'Getting pets', [{ pose: 'happy', until: () => a.task === null || a.task.name !== 'pet' }], { phase: 'act' });
      },
      tick: (st, a, dt) => { addNeed(st.agents.dog, 'play', perSec(150) * dt); addNeed(a, 'social', perSec(60) * dt); },
    },
  ]),

  fetch: () => task('fetch', 'Playing fetch', [
    { obj: 'toy', dur: 0.2 * MIN },
    {
      follow: 'dog', dur: 15 * MIN, pose: 'throw',
      begin: (st, a) => {
        const dog = st.agents.dog;
        if (dog.task) cancelTask(st, dog);
        dog.task = task('fetch', 'Playing fetch', [{ pose: 'play', until: () => a.task === null || a.task.name !== 'fetch' }], { phase: 'act' });
      },
      tick: (st, a, dt) => {
        addNeed(st.agents.dog, 'play', perSec(240) * dt);
        addNeed(a, 'social', perSec(30) * dt);
        dirty(st, roomOf(a), perSec(6) * dt);
      },
    },
  ], { hands: true }),
};
