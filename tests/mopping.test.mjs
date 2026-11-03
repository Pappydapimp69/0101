import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command, getOptions } from '../src/sim/sim.js';
import { HOUR } from '../src/sim/state.js';
import { ROOM_TILES } from '../src/sim/tasks.js';
import { MOP, effectiveClean, rinseMop, moppingTick } from '../src/sim/mopping.js';

const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };
function quiet(st) { st.agents.npc.away = true; st.agents.npc.thinkAt = Infinity; }
function hold(st, id) { const p = st.agents.player; st.tools[id].carriedBy = 'player'; st.tools[id].inBucket = false; p.carrying = { kind: 'tool', id }; }
function stand(st, a, c, r) { Object.assign(a, { c, r, x: c + 0.5, z: r + 0.5, path: [], task: null }); }
const kitchenTile = () => ROOM_TILES.kitchen[Math.floor(ROOM_TILES.kitchen.length / 2)];
function bucketTo(st, room) { const [c, r] = ROOM_TILES[room][3]; Object.assign(st.tools.bucket, { c, r, carriedBy: null }); }
const until = (st, cond, max = 3 * HOUR) => { for (let i = 0; i < max && !cond(); i++) step(st); };

test('sweeping alone cannot take a grimy floor to 100', () => {
  const st = createState(1); quiet(st);
  st.rooms.kitchen.clean = 50; st.rooms.kitchen.grime = 30;
  hold(st, 'broom'); stand(st, st.agents.player, ...kitchenTile());
  command(st, { type: 'cleanRoom', room: 'kitchen', kind: 'broom' });
  until(st, () => !st.agents.player.task);
  command(st, { type: 'cleanRoom', room: 'kitchen', kind: 'broom' });
  until(st, () => !st.agents.player.task);
  assert.ok(st.rooms.kitchen.clean > 95, 'dust swept');
  assert.ok(effectiveClean(st, 'kitchen') < 75, `still grimy: ${effectiveClean(st, 'kitchen')}`);
});

test('mopping with a filled bucket in the room lifts grime and dirties the mop', () => {
  const st = createState(2); quiet(st);
  st.rooms.kitchen.grime = 40;
  bucketTo(st, 'kitchen'); hold(st, 'mop'); stand(st, st.agents.player, ...kitchenTile());
  command(st, { type: 'cleanRoom', room: 'kitchen', kind: 'mop' });
  until(st, () => !st.agents.player.task);
  assert.ok(st.rooms.kitchen.grime < 10, `grime ${st.rooms.kitchen.grime}`);
  assert.equal(st.tools.mop.dirt, MOP.mopDirtPerPass);
});

test('no mopping without the bucket in the room, or with an empty bucket', () => {
  const st = createState(3); quiet(st);
  hold(st, 'mop'); stand(st, st.agents.player, ...kitchenTile());
  bucketTo(st, 'laundry');
  const opt = (s) => getOptions(s, { kind: 'floor', room: 'kitchen', c: kitchenTile()[0], r: kitchenTile()[1] }).find((o) => o.cmd.type === 'cleanRoom');
  assert.match(opt(st).disabled, /bucket into this room/);
  bucketTo(st, 'kitchen'); st.tools.bucket.water = false;
  assert.match(opt(st).disabled, /fill the mop bucket/);
});

test('a dirty mop smears: a pass lifts only a third', () => {
  const st = createState(4); quiet(st);
  st.rooms.kitchen.grime = 60; st.tools.mop.dirt = MOP.dirtyMopAt;
  bucketTo(st, 'kitchen'); hold(st, 'mop'); stand(st, st.agents.player, ...kitchenTile());
  command(st, { type: 'cleanRoom', room: 'kitchen', kind: 'mop' });
  const g0 = st.rooms.kitchen.grime;
  until(st, () => !st.agents.player.task);
  const lifted = g0 - st.rooms.kitchen.grime;
  assert.ok(lifted < MOP.grimeGain / 2, `lifted ${lifted}`);
});

test('bucket water lasts 3 days untouched; each rinse costs 10% and there are 8', () => {
  const st = createState(5);
  const b = st.tools.bucket;
  moppingTick(st, 36 * HOUR);
  assert.ok(Math.abs(b.fresh - 50) < 0.01);
  moppingTick(st, 36 * HOUR);
  assert.equal(b.fresh, 0);
  b.fresh = 100;
  for (let i = 0; i < 8; i++) assert.equal(rinseMop(st), null);
  assert.ok(Math.abs(b.fresh - 20) < 0.01);
  assert.ok(rinseMop(st), '9th rinse refused');
});

test('rinsing at the bucket cleans the mop; filling at a sink uses detergent', () => {
  const st = createState(6); quiet(st);
  const p = st.agents.player;
  st.tools.mop.dirt = 80; hold(st, 'mop');
  command(st, { type: 'rinseMop' });
  until(st, () => !p.task);
  assert.equal(st.tools.mop.dirt, 0);
  assert.equal(st.tools.bucket.rinsesLeft, MOP.rinses - 1);
  // empty it, carry it to the kitchen sink and refill
  p.carrying = null; st.tools.mop.carriedBy = null;
  Object.assign(st.tools.bucket, { water: false, fresh: 0 });
  hold(st, 'bucket');
  const d0 = st.detergent;
  command(st, { type: 'fillBucket', obj: 'sinkK' });
  until(st, () => !p.task);
  assert.equal(st.tools.bucket.water, true);
  assert.ok(st.tools.bucket.fresh > 99.9);
  assert.equal(st.detergent, d0 - 1);
  st.money = 100;
  command(st, { type: 'buyDetergent' });
  assert.equal(st.detergent, d0 - 1 + MOP.detergentPack.doses);
});

test('mopping with water at 50% or better: Sam does not care; under 50%: Sam notices', () => {
  for (const fresh of [60, 40]) {
    const st = createState(7); quiet(st);
    const npc = st.agents.npc;
    st.tools.bucket.fresh = fresh;
    bucketTo(st, 'kitchen'); hold(st, 'mop'); stand(st, st.agents.player, ...kitchenTile());
    command(st, { type: 'cleanRoom', room: 'kitchen', kind: 'mop' });
    until(st, () => !st.agents.player.task);
    // Sam comes home and walks into the kitchen
    npc.away = false; stand(st, npc, ...ROOM_TILES.kitchen[0]); npc.thinkAt = Infinity;
    npc.bond = 100; const bond0 = npc.bond;
    run(st, 2);
    const smelled = npc.bumps.some((b) => b.why === 'old mop water smell');
    if (fresh >= 50) { assert.equal(smelled, false); assert.ok(npc.bond >= bond0); }
    else { assert.equal(smelled, true); assert.ok(npc.bond < bond0); }
  }
});
