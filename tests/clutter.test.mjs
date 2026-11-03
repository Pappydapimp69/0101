import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command } from '../src/sim/sim.js';
import { MIN } from '../src/sim/state.js';
import { roomAt } from '../src/sim/map.js';
import { walkable } from '../src/sim/path.js';
import { ROOM_TILES } from '../src/sim/tasks.js';
import { againstWall, clutterByRoom, CLUTTER } from '../src/sim/clutter.js';

const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };
const T = (st, id) => st.tools[id];
function hold(st, id) { const p = st.agents.player; st.tools[id].carriedBy = 'player'; p.carrying = { kind: 'tool', id }; }
function stand(st, c, r) { Object.assign(st.agents.player, { c, r, x: c + 0.5, z: r + 0.5, path: [], task: null }); }
const openTile = (room) => ROOM_TILES[room].find(([c, r]) => !againstWall(c, r) && walkable(c, r));
const wallTile = (room) => ROOM_TILES[room].find(([c, r]) => againstWall(c, r) && walkable(c, r));
function quiet(st) { st.agents.npc.away = true; st.agents.npc.thinkAt = Infinity; }

test('the mop starts standing in its bucket; together they count as one item', () => {
  const st = createState(1);
  assert.equal(T(st, 'mop').inBucket, true);
  const room = roomAt(T(st, 'bucket').c, T(st, 'bucket').r);
  Object.assign(st.agents.player, { c: T(st, 'bucket').c, r: T(st, 'bucket').r }); // someone looking
  const cl = clutterByRoom(st)[room];
  assert.ok(cl.items.some((x) => x.id === 'bucket') && !cl.items.some((x) => x.id === 'mop'));
});

test('a broom put down in open space lies on the floor; against a wall it stands up', () => {
  const st = createState(2); quiet(st);
  const [oc, or] = openTile('living');
  hold(st, 'broom'); stand(st, oc, or); command(st, { type: 'putDown' });
  assert.equal(T(st, 'broom').upright, false);
  const [wc, wr] = wallTile('living');
  hold(st, 'broom'); stand(st, wc, wr); command(st, { type: 'putDown' });
  assert.equal(T(st, 'broom').upright, true);
});

test('a broom on the floor is clutter even unseen; upright and unseen it is not', () => {
  const st = createState(3); quiet(st);
  const [oc, or] = openTile('garage');
  hold(st, 'broom'); stand(st, oc, or); command(st, { type: 'putDown' });
  stand(st, ...openTile('kitchen'));
  assert.ok(clutterByRoom(st).garage, 'lying broom counts with nobody around');
  const [wc, wr] = wallTile('garage');
  hold(st, 'broom'); stand(st, wc, wr); command(st, { type: 'putDown' });
  stand(st, ...openTile('kitchen'));
  assert.ok(!clutterByRoom(st).garage, 'upright and out of sight: not clutter');
  stand(st, ...openTile('garage'));
  assert.ok(clutterByRoom(st).garage, 'in view of a person: clutter');
});

test('mop and bucket apart count as two; mop put back in the bucket counts as one', () => {
  const st = createState(4); quiet(st);
  const [bc, br] = [T(st, 'bucket').c, T(st, 'bucket').r];
  const room = roomAt(bc, br);
  hold(st, 'mop'); T(st, 'mop').inBucket = false;
  const [wc, wr] = wallTile(room);
  stand(st, wc, wr); command(st, { type: 'putDown' });
  const apart = clutterByRoom(st)[room].items.filter((x) => x.id === 'mop' || x.id === 'bucket').length;
  assert.equal(apart, 2);
  hold(st, 'mop'); stand(st, bc, br); command(st, { type: 'putDown' });
  assert.equal(T(st, 'mop').inBucket, true);
  assert.equal(clutterByRoom(st)[room].items.filter((x) => x.id === 'mop' || x.id === 'bucket').length, 1);
});

test('a broom in a room with both a mop and a bucket counts half', () => {
  const st = createState(5); quiet(st);
  const room = roomAt(T(st, 'bucket').c, T(st, 'bucket').r); // mop + bucket live here
  stand(st, ...openTile(room));
  const withKit = clutterByRoom(st)[room].items.find((x) => x.id === 'broom');
  assert.equal(withKit.units, 0.5);
  hold(st, 'broom'); stand(st, ...wallTile('garage')); command(st, { type: 'putDown' });
  const alone = clutterByRoom(st).garage.items.find((x) => x.id === 'broom');
  assert.equal(alone.units, 1);
});

test('clutter in your room lowers your mood', () => {
  const a = createState(6), b = createState(6);
  for (const st of [a, b]) quiet(st);
  hold(b, 'broom'); stand(b, ...openTile('living')); command(b, { type: 'putDown' });
  stand(a, ...openTile('living'));
  run(a, 2 * 60 * MIN); run(b, 2 * 60 * MIN);
  assert.ok(b.agents.player.mood < a.agents.player.mood - 1, `${b.agents.player.mood} vs ${a.agents.player.mood}`);
  assert.equal(CLUTTER.moodPerUnit < 0, true);
});
