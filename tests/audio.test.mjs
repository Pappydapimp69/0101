import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step } from '../src/sim/sim.js';
import { soundEvents, loopLevels, Limiter, AUDIO } from '../src/render/audio.js';

test('sound events come from state changes and never touch the sim', () => {
  const st = createState(1);
  const before = JSON.stringify(st, (k, v) => (typeof v === 'function' ? undefined : v));
  let { next } = soundEvents(null, st);
  st.backDoorOpen = !st.backDoorOpen;
  st.alertEvent = (st.alertEvent || 0) + 1;
  const r = soundEvents(next, st);
  assert.deepEqual(r.events.map((e) => e.kind).sort(), ['alert', 'door']);
  assert.equal(soundEvents(r.next, st).events.length, 0, 'no repeat without a new change');
  st.backDoorOpen = !st.backDoorOpen; delete st.alertEvent;
  assert.equal(JSON.stringify(st, (k, v) => (typeof v === 'function' ? undefined : v)), before);
  loopLevels(st);
  assert.equal(JSON.stringify(st, (k, v) => (typeof v === 'function' ? undefined : v)), before);
});

test('limiter: per-kind cooldown, voice cap and per-frame cap', () => {
  const l = new Limiter();
  assert.ok(l.admit('bark', 0, 0));
  assert.ok(!l.admit('bark', 0.5, 0), 'bark cooldown');
  assert.ok(l.admit('bark', 2, 0));
  assert.ok(!l.admit('door', 3, AUDIO.perFrame), 'per-frame cap');
  const m = new Limiter();
  let n = 0;
  for (let i = 0; i < 40; i++) if (m.admit('blip', i * 0.1, 0)) n++;
  assert.ok(m.active <= AUDIO.voices && n > 0);
});

test('a running task near you makes its loop audible, far away it is silent', () => {
  const st = createState(1);
  const p = st.agents.player;
  st.agents.npc.task = { name: 'cook', label: 'Cooking' }; st.agents.npc.path = [];
  Object.assign(st.agents.npc, { c: 22, r: 4, x: 22.5, z: 4.5 });
  Object.assign(p, { c: 23, r: 5, x: 23.5, z: 5.5 });
  assert.ok(loopLevels(st).sizzle > 0.9);
  Object.assign(p, { c: 45, r: 49, x: 45.5, z: 49.5 });
  assert.equal(loopLevels(st).sizzle, 0);
});
