import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command } from '../src/sim/sim.js';
import { MIN, HOUR, DAY } from '../src/sim/state.js';
import { roomAt } from '../src/sim/map.js';
import { walkable } from '../src/sim/path.js';
import { CHAT, PROMISE, topicFit } from '../src/sim/chat.js';
import { startConversation, cancelTask } from '../src/sim/tasks.js';
import { shiftFor } from '../src/sim/schedule.js';

const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };
function chatting(seed = 1, bond = 450) {
  const st = createState(seed);
  const p = st.agents.player, n = st.agents.npc;
  n.away = false; n.asleep = false; n.task = null; n.bond = bond;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (walkable(n.c + dc, n.r + dr) && roomAt(n.c + dc, n.r + dr) === roomAt(n.c, n.r)) { Object.assign(p, { c: n.c + dc, r: n.r + dr, x: n.c + dc + 0.5, z: n.r + dr + 0.5 }); break; }
  }
  startConversation(st, p, n);
  return st;
}
const samSays = (st) => (st.bubbles || []).filter((b) => b.who === 'npc').map((b) => b.text).join(' / ');
const logs = (st) => st.log.map((e) => e.msg).join('\n');

test('small talk tells you what is on Sam\'s mind (from stage 2)', () => {
  const st = chatting(1, 150);
  st.agents.npc.needs.hunger = 10;
  command(st, { type: 'topic', id: 'small' });
  assert.match(samSays(st), /hungry/i);
  assert.match(logs(st), /Sam seems hungry/);
});

test('Food when Sam is hungry is a promise: cook in time and Sam eats your plate', () => {
  const st = chatting(2);
  const n = st.agents.npc;
  n.needs.hunger = 30;
  assert.equal(topicFit(st, n, 'food'), 1);
  command(st, { type: 'topic', id: 'food' });
  assert.equal(st.promise.kind, 'cook');
  const b0 = n.bond;
  command(st, { type: 'stop' });
  command(st, { type: 'cook' });
  run(st, 90 * MIN);
  assert.equal(st.promise, null, 'kept');
  assert.ok(n.bond >= b0 + PROMISE.keptCook - 1);
  run(st, 2 * HOUR);
  assert.equal(st.plateForSam, false, 'Sam ate the plate');
});

test('a promise you forget is broken: bond and mood drop', () => {
  const st = chatting(3);
  const n = st.agents.npc;
  n.needs.hunger = 30;
  command(st, { type: 'topic', id: 'food' });
  const b0 = n.bond;
  run(st, PROMISE.cookHours * HOUR + MIN);
  assert.equal(st.promise, null);
  assert.ok(n.bond < b0);
  assert.ok(n.bumps.some((b) => b.why === 'you flaked'));
});

test('Plans sets a TV night; being on the couch together keeps it', () => {
  const st = chatting(4, 650);
  const n = st.agents.npc;
  n.mood = 80; n.needs.energy = 90;
  st.time = Math.floor(st.time / DAY) * DAY + 15 * HOUR; // 3 PM
  assert.equal(topicFit(st, n, 'plans'), 1);
  command(st, { type: 'topic', id: 'plans' });
  assert.equal(st.promise.kind, 'tv');
  command(st, { type: 'stop' });
  const at = st.promise.at;
  const b0 = n.bond;
  // jump to TV time with both at home and free
  st.time = at; n.away = false; n.asleep = false; cancelTask(st, n); n.thinkAt = 0;
  command(st, { type: 'tv' });
  run(st, 90 * MIN);
  assert.equal(st.promise, null, 'kept');
  assert.ok(n.bond > b0 + 5, `bond ${b0} -> ${n.bond}`);
});

test('Work, when it fits and bills are waiting, gets Sam to chip in once a week', () => {
  const st = chatting(5);
  const n = st.agents.npc;
  // move to the evening of Sam's first workday, just home
  let day = 1; while (!shiftFor(st.seed, day)) day++;
  st.time = (day - 1) * DAY + 18 * HOUR; n.homeAt = st.time;
  st.bills.push({ id: 999, name: 'Power', icon: '⚡', amount: 80, issued: st.time, due: st.time + DAY, paid: false });
  assert.equal(topicFit(st, n, 'work'), 1);
  const m0 = st.money;
  command(st, { type: 'topic', id: 'work' });
  assert.equal(st.money, m0 + PROMISE.chipIn);
  run(st, CHAT.topicGap);
  command(st, { type: 'topic', id: 'work' });
  assert.equal(st.money, m0 + PROMISE.chipIn, 'only once a week');
});

test('Feelings, when Sam is low, clears any grudge', () => {
  const st = chatting(6);
  const n = st.agents.npc;
  n.mood = 20; n.grudge = 30;
  assert.equal(topicFit(st, n, 'feelings'), 1);
  command(st, { type: 'topic', id: 'feelings' });
  assert.equal(n.grudge, 0);
});
