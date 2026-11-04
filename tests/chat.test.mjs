import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command } from '../src/sim/sim.js';
import { MIN, HOUR } from '../src/sim/state.js';
import { flood, idx, walkable } from '../src/sim/path.js';
import { OBJ, roomAt } from '../src/sim/map.js';
import { CHAT, TOPICS, topicFit } from '../src/sim/chat.js';
import { startConversation } from '../src/sim/tasks.js';

const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };
function chatting(seed = 1) {
  const st = createState(seed);
  const p = st.agents.player, n = st.agents.npc;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (walkable(n.c + dc, n.r + dr) && roomAt(n.c + dc, n.r + dr) === roomAt(n.c, n.r)) { Object.assign(p, { c: n.c + dc, r: n.r + dr, x: n.c + dc + 0.5, z: n.r + dr + 0.5 }); break; }
  }
  n.task = null; n.asleep = false;
  startConversation(st, p, n);
  return st;
}

test('a closed back door blocks people as well as the dog', () => {
  const st = createState(1);
  const [yc, yr] = OBJ.pottySpot.slots[0].tile;
  const p = st.agents.player;
  st.backDoorOpen = false;
  assert.equal(flood(st, 'human', p.c, p.r).dist[idx(yc, yr)], Infinity);
  st.backDoorOpen = true;
  assert.ok(Number.isFinite(flood(st, 'human', p.c, p.r).dist[idx(yc, yr)]));
});

test('the door can be opened from the yard side, so nobody is trapped outside', () => {
  const st = createState(1);
  st.backDoorOpen = false;
  const p = st.agents.player;
  const [yc, yr] = OBJ.pottySpot.slots[0].tile;
  Object.assign(p, { c: yc, r: yr, x: yc + 0.5, z: yr + 0.5 });
  command(st, { type: 'door', open: true });
  run(st, 30 * MIN); // the walk from the potty spot to the door is slow
  assert.equal(st.backDoorOpen, true);
});

test('a chat lasts CHAT.minutes, then Sam says a closing line', () => {
  const st = chatting();
  const conv = st.conv;
  assert.equal(conv.end - conv.start, CHAT.minutes * MIN);
  st.agents.npc.thinkAt = Infinity;
  run(st, CHAT.minutes * MIN - 5);
  assert.ok(st.conv, 'still chatting just before the end');
  run(st, 10);
  assert.equal(st.conv, null);
  assert.ok((st.bubbles || []).some((b) => b.who === 'npc'), 'Sam signs off');
});

test('picking a topic shows your line, then Sam replies a beat later', () => {
  const st = chatting(2);
  assert.equal(command(st, { type: 'topic', id: 'small' }), null);
  const mine = st.bubbles.filter((b) => b.who === 'player');
  const sams = st.bubbles.filter((b) => b.who === 'npc' && b.from > st.time);
  assert.equal(mine.length, 1);
  assert.equal(sams.length, 1, 'Sam replies after a delay');
  assert.equal(command(st, { type: 'topic', id: 'small' }), 'wait', 'one topic at a time');
  run(st, CHAT.topicGap);
  assert.equal(command(st, { type: 'topic', id: 'day' }), null);
});

test('deep topics stay locked until the bond earns them', () => {
  const st = chatting(3);
  assert.equal(command(st, { type: 'topic', id: 'feelings' }), 'locked');
  st.agents.npc.bond = 350; // stage 4
  assert.equal(command(st, { type: 'topic', id: 'feelings' }), null);
});

test('a topic that fits Sam pays more bond than one that misses; two misses end the chat early', () => {
  const st = chatting(4);
  const n = st.agents.npc;
  n.bond = 600; n.mood = 30; n.needs.hunger = 20; // hungry and low: food fits, jokes miss
  assert.equal(topicFit(st, n, 'food'), 1);
  assert.equal(topicFit(st, n, 'jokes'), -1);
  const b0 = n.bond;
  command(st, { type: 'topic', id: 'food' });
  const afterFit = n.bond - b0;
  run(st, CHAT.topicGap);
  const b1 = n.bond;
  n.mood = 30; n.needs.hunger = 20;
  command(st, { type: 'topic', id: 'jokes' });
  assert.ok(afterFit > n.bond - b1, 'fit beats miss');
  run(st, CHAT.topicGap);
  n.mood = 30; n.needs.hunger = 20; // nine game minutes passed: keep Sam low and hungry
  command(st, { type: 'topic', id: 'jokes' });
  assert.ok(st.conv.end - st.time <= CHAT.wrapUp + 1, 'Sam wraps up after two misses');
});

test('the wheel has 8 evenly placed slots', () => {
  assert.equal(TOPICS.length, 8);
});
