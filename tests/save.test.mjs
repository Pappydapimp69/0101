import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command } from '../src/sim/sim.js';
import { DAY, HOUR } from '../src/sim/state.js';
import { serialize, deserialize, writeSave, readSave, SAVE_KEY } from '../src/sim/save.js';

const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const strip = (text) => JSON.parse(text).state;

test('a save is small and round-trips exactly (tasks and chats dropped, everything else kept)', () => {
  const st = createState(3);
  run(st, 2 * DAY + 12 * HOUR);
  st.promise = { kind: 'cook', until: st.time + HOUR, text: 'x' };
  const text = serialize(st);
  assert.ok(text.length < 60000, `bytes ${text.length}`);
  const back = deserialize(text);
  assert.deepEqual(strip(serialize(back)), strip(text));
  assert.equal(back.time, st.time);
  assert.equal(back.rng, st.rng, 'RNG state words kept (Brain seven#E48)');
  assert.equal(back.money, st.money);
  assert.equal(back.agents.npc.bond, st.agents.npc.bond);
  assert.deepEqual(back.promise, st.promise);
  assert.deepEqual(back.hintsShown, st.hintsShown);
});

test('a loaded game keeps running sensibly for 3 more days (no NaN, Sam keeps going to work)', () => {
  const st = createState(4);
  run(st, 1 * DAY + 20 * HOUR);
  const back = deserialize(serialize(st));
  let leaves = 0, wasAway = back.agents.npc.away;
  for (let i = 0; i < 3 * DAY; i++) { step(back); if (back.agents.npc.away && !wasAway) leaves++; wasAway = back.agents.npc.away; }
  for (const a of Object.values(back.agents)) for (const [k, v] of Object.entries(a.needs)) assert.ok(Number.isFinite(v) && v >= 0 && v <= 100, `${a.id}.${k} = ${v}`);
  assert.ok(Number.isFinite(back.money));
  assert.ok(leaves >= 1, `Sam left for work ${leaves} times in 3 days after loading`);
});

test('storage: namespaced key, bad saves rejected, throwing storage tolerated', () => {
  const st = createState(5);
  const s = memStore();
  assert.equal(writeSave(s, st), true);
  assert.ok([...s.m.keys()].every((k) => k.startsWith('0101:')), 'namespaced (Brain seven#E5)');
  assert.equal(readSave(s).time, st.time);
  s.setItem(SAVE_KEY, '{broken');
  assert.equal(readSave(s), null);
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  assert.equal(writeSave(bad, st), false);
  assert.equal(readSave(bad), null);
});
