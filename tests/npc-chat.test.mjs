import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command } from '../src/sim/sim.js';
import { HOUR, TUNING } from '../src/sim/state.js';

// Run with an idle, well-kept player; record every conversation Sam starts.
function run(st, secs) {
  const starts = [];
  let last = null;
  for (let i = 0; i < secs; i++) {
    const p = st.agents.player;
    p.needs.bladder = 100; p.needs.energy = 100; p.needs.hunger = 100; p.needs.thirst = 100;
    step(st);
    if (st.conv && st.conv !== last && st.conv.a === 'npc') starts.push(st.time);
    last = st.conv;
  }
  return starts;
}

test('Sam does not come to chat right away on a new game', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const st = createState(seed);
    const t0 = st.time;
    const starts = run(st, 2 * HOUR);
    assert.equal(starts.length, 0, `seed ${seed}: Sam chatted at +${((starts[0] - t0) / 60).toFixed(0)} min`);
  }
});

test('first chat time is spread out, not the same tick for every seed', () => {
  const at = new Set();
  for (let seed = 1; seed <= 8; seed++) at.add(Math.round(createState(seed).agents.npc.chatReadyAt / 600));
  assert.ok(at.size >= 4, `only ${at.size} distinct first-chat times`);
});

test('after any chat Sam waits out the cooldown before seeking you again', () => {
  const st = createState(4);
  const starts = run(st, 3 * 24 * HOUR);
  assert.ok(starts.length >= 1, 'Sam should still come to chat sometimes');
  for (let i = 1; i < starts.length; i++) {
    assert.ok(starts[i] - starts[i - 1] >= TUNING.npcChat.cooldownHours * HOUR - 1, `chats ${(starts[i] - starts[i - 1]) / HOUR}h apart`);
  }
});

test('a chat you start also resets Sam\'s cooldown', () => {
  const st = createState(5);
  const npc = st.agents.npc;
  const p = st.agents.player;
  npc.mood = 80; npc.needs.social = 60; npc.task = null;
  Object.assign(p, { c: 11, r: 17, x: 11.5, z: 17.5 });
  command(st, { type: 'talk' });
  for (let i = 0; i < 60 && !st.conv; i++) step(st);
  assert.ok(st.conv);
  assert.ok(npc.chatReadyAt >= st.time + TUNING.npcChat.cooldownHours * HOUR - 61);
});
