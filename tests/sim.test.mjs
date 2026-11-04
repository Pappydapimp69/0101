import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECTS, TOOLS, ROOM_LIST, START, DOORS, roomAt, COLS } from '../src/sim/map.js';
import { ROOM_TILES } from '../src/sim/tasks.js';
import { flood, idx, walkable, approachTiles } from '../src/sim/path.js';
// Put the player on a walkable tile next to Sam, whatever the map looks like.
function besideNpc(st) {
  const n = st.agents.npc;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = n.c + dc, r = n.r + dr;
    if (walkable(c, r) && roomAt(c, r) === roomAt(n.c, n.r)) return { c, r, x: c + 0.5, z: r + 0.5 };
  }
  throw new Error('no tile beside Sam');
}

import { createState, step, command, getOptions, wouldCutOff } from '../src/sim/sim.js';
import { HOUR, MIN, TUNING } from '../src/sim/state.js';

const run = (st, secs) => { for (let i = 0; i < secs; i++) step(st); };

test('every slot, tool and room is reachable on the real map', () => {
  const st = createState(1);
  st.backDoorOpen = true;
  const { dist } = flood(st, 'human', ...START.player);
  for (const o of OBJECTS) for (const s of o.slots) {
    assert.ok(walkable(...s.tile), `${o.id} slot ${s.tile} not walkable`);
    assert.ok(Number.isFinite(dist[idx(...s.tile)]), `${o.id} slot unreachable`);
  }
  for (const t of TOOLS) {
    assert.ok(approachTiles(...t.home).some(([c, r]) => Number.isFinite(dist[idx(c, r)])), `${t.id} unreachable`);
  }
  for (const r of ROOM_LIST) {
    let ok = false;
    for (let i = 0; i < dist.length; i++) if (Number.isFinite(dist[i]) && roomAt(i % COLS, Math.floor(i / COLS)) === r.id) ok = true;
    assert.ok(ok, `${r.id} unreachable`);
  }
  for (const d of DOORS) assert.notEqual(roomAt(...d.a), roomAt(...d.b), 'door joins one room to itself');
});

test('dog cannot reach the yard with the back door closed', () => {
  const st = createState(1);
  const { dist } = flood(st, 'dog', ...START.dog);
  const [yc, yr] = OBJECTS.find((o) => o.id === 'pottySpot').slots[0].tile;
  assert.equal(dist[idx(yc, yr)], Infinity);
  st.backDoorOpen = true;
  assert.ok(Number.isFinite(flood(st, 'dog', ...START.dog).dist[idx(yc, yr)]));
});

test('Sam cuts you off only when social AND mood are low', () => {
  const st = createState(2);
  const npc = st.agents.npc;
  npc.needs.social = 30; npc.mood = 30;
  assert.ok(wouldCutOff(npc));
  npc.mood = 70;
  assert.ok(!wouldCutOff(npc));
  npc.needs.social = 80; npc.mood = 20;
  assert.ok(!wouldCutOff(npc));
});

test('talking to a cut-off Sam builds a grudge that fades', () => {
  const st = createState(3);
  const npc = st.agents.npc;
  const p = st.agents.player;
  npc.task = { name: 'hold', label: 'x', steps: [{ until: () => false }], i: 0, phase: 'act', el: 0 };
  npc.needs.social = 10; npc.mood = 10;
  // put them side by side
  Object.assign(p, besideNpc(st));
  for (let k = 0; k < 3; k++) {
    npc.needs.social = 10; npc.mood = 10;
    command(st, { type: 'talk' });
    run(st, 5);
  }
  assert.ok(npc.grudge >= 30, `grudge ${npc.grudge}`);
  assert.equal(st.conv, null);
  const g = npc.grudge;
  for (let i = 0; i < 2 * HOUR; i++) { npc.needs.social = 10; step(st); }
  assert.ok(npc.grudge < g - 10, 'grudge should fade');
});

test('Sam talks when in a good mood, and both gain social', () => {
  const st = createState(4);
  const npc = st.agents.npc;
  const p = st.agents.player;
  npc.task = null; npc.mood = 80; npc.needs.social = 50; p.needs.social = 20;
  Object.assign(p, besideNpc(st));
  command(st, { type: 'talk' });
  run(st, 60);
  assert.ok(st.conv, 'conversation should start');
  run(st, 30 * MIN); // chats are slower-paced: +20 social over the full hour
  assert.ok(p.needs.social > 25);
});

test('rooms you occupy get dirty faster', () => {
  const st = createState(5);
  st.rooms.bedroom3.clean = 80; st.rooms.garage.clean = 80;
  for (const a of Object.values(st.agents)) a.task = { name: 'hold', label: 'x', steps: [{ until: () => false }], i: 0, phase: 'act', el: 0, low: false };
  st.agents.npc.thinkAt = Infinity; st.agents.dog.thinkAt = Infinity;
  { const [c, r] = ROOM_TILES.bedroom3[Math.floor(ROOM_TILES.bedroom3.length / 2)]; Object.assign(st.agents.player, { c, r, x: c + 0.5, z: r + 0.5 }); }
  run(st, HOUR);
  assert.ok(st.rooms.bedroom3.clean < st.rooms.garage.clean, `${st.rooms.bedroom3.clean} vs ${st.rooms.garage.clean}`);
});

test('cooking dirties the kitchen and leaves a dish; washing clears it', () => {
  const st = createState(6);
  const p = st.agents.player;
  st.dishes = [];
  st.rooms.kitchen.clean = 90;
  st.agents.npc.thinkAt = Infinity;
  command(st, { type: 'cook' });
  run(st, 2 * HOUR);
  assert.ok(st.rooms.kitchen.clean <= 80);
  const mine = st.dishes.length;
  assert.ok(mine >= 1);
  command(st, { type: 'pickDishes', room: 'kitchen' });
  run(st, 10 * MIN);
  assert.equal(p.carrying && p.carrying.kind, 'dishes');
  command(st, { type: 'wash' });
  run(st, 30 * MIN);
  assert.equal(p.carrying, null);
});

test('toilet use dirties the toilet; wipes clean it', () => {
  const st = createState(7);
  st.agents.npc.thinkAt = Infinity;
  const before = st.toilets.toiletMB.dirt;
  command(st, { type: 'toilet', obj: 'toiletMB' });
  run(st, 60 * MIN);
  assert.ok(st.toilets.toiletMB.dirt > before);
  command(st, { type: 'pickTool', id: 'wipesW' });
  run(st, 45 * MIN);
  assert.equal(st.agents.player.carrying.id, 'wipesW');
  assert.ok(getOptions(st, { kind: 'obj', id: 'toiletMB' }).some((o) => o.cmd.type === 'cleanToilet'));
  command(st, { type: 'cleanToilet', obj: 'toiletMB' });
  run(st, 45 * MIN);
  assert.equal(st.toilets.toiletMB.dirt, 0);
});

test('vacuum is refused on hard floors, allowed on carpet', () => {
  const st = createState(8);
  st.agents.player.carrying = { kind: 'tool', id: 'vacuum' };
  st.tools.vacuum.carriedBy = 'player';
  const hard = getOptions(st, { kind: 'floor', c: 10, r: 4, room: 'kitchen' }).find((o) => o.cmd.type === 'cleanRoom');
  const soft = getOptions(st, { kind: 'floor', c: 18, r: 11, room: 'living' }).find((o) => o.cmd.type === 'cleanRoom');
  assert.ok(hard.disabled);
  assert.ok(!soft.disabled);
});

test('dog has an accident with the door shut, not with it open', () => {
  for (const open of [false, true]) {
    const st = createState(9);
    st.agents.npc.thinkAt = Infinity; // nobody lets the dog out
    st.backDoorOpen = open;
    st.agents.dog.needs.potty = 25;
    for (let i = 0; i < 6 * HOUR; i++) { st.agents.player.needs.bladder = 100; step(st); }
    const puddles = st.messes.filter((m) => m.type === 'puddle').length;
    if (open) assert.equal(puddles, 0); else assert.ok(puddles >= 1);
  }
});

test('deterministic: same seed, same three days', () => {
  const sig = (seed) => {
    const st = createState(seed);
    run(st, 3 * 24 * HOUR);
    const { npc, dog } = st.agents;
    return JSON.stringify([npc.c, npc.r, npc.needs, dog.c, dog.r, dog.needs, st.rooms, st.dishes.length, st.messes.length]);
  };
  assert.equal(sig(11), sig(11));
});

test('soak: Sam keeps their own needs up for a week while the player idles', () => {
  const st = createState(12);
  const npc = st.agents.npc;
  const low = { hunger: 100, thirst: 100, bladder: 100, energy: 100 };
  const used = new Set();
  for (let i = 0; i < 7 * 24 * HOUR; i++) {
    step(st);
    if (npc.task) used.add(npc.task.name);
    for (const k in low) low[k] = Math.min(low[k], npc.needs[k]);
    st.agents.player.needs.bladder = 100; // keep the idle player from flooding the house
    st.agents.player.needs.energy = 100;
  }
  for (const k of ['hunger', 'thirst', 'energy']) assert.ok(low[k] > 0, `Sam's ${k} hit zero`);
  for (const t of ['cook', 'drink', 'toilet', 'sleep']) assert.ok(used.has(t), `Sam never did ${t}`);
  for (const a of Object.values(st.agents)) for (const v of Object.values(a.needs)) assert.ok(v >= 0 && v <= 100);
});

test('phone speeds time up', async () => {
  const { timeScale } = await import('../src/sim/sim.js');
  const st = createState(13);
  assert.equal(timeScale(st), 1);
  command(st, { type: 'phone' });
  step(st);
  assert.equal(timeScale(st), TUNING.timeScale.phone);
});
