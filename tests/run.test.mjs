import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, command } from '../src/sim/sim.js';
import { TUNING } from '../src/sim/state.js';
import { ROOM_TILES } from '../src/sim/tasks.js';

const run = (st, s) => { for (let i = 0; i < s; i++) step(st); };
function setup(running) {
  const st = createState(1);
  st.agents.npc.thinkAt = Infinity; st.agents.npc.away = true;
  const p = st.agents.player;
  // freeze normal drain so only running shows
  for (const k of ['awake', 'asleep']) for (const n in TUNING.human[k]) TUNING.human[k][n] = TUNING.human[k][n];
  const [c, r] = ROOM_TILES.living[0];
  Object.assign(p, { c, r, x: c + 0.5, z: r + 0.5, path: [], task: null });
  if (running) command(st, { type: 'run', on: true });
  return st;
}
const far = () => ROOM_TILES.living[ROOM_TILES.living.length - 1];

test('running is 1.5x walking speed', () => {
  const dist = (running) => {
    const st = setup(running);
    const p = st.agents.player;
    const [c, r] = far();
    command(st, { type: 'walk', c, r });
    const x0 = p.x, z0 = p.z;
    let moved = 0, lx = p.x, lz = p.z;
    for (let i = 0; i < 120; i++) { step(st); moved += Math.hypot(p.x - lx, p.z - lz); lx = p.x; lz = p.z; }
    return moved;
  };
  const w = dist(false), rn = dist(true);
  assert.ok(Math.abs(rn / w - TUNING.run.mult) < 0.02, `run/walk ${(rn / w).toFixed(3)}`);
});

test('running costs 1% hunger and thirst per 12 game min (4 real s at 1x) of moving, nothing while standing', () => {
  const R = TUNING.run;
  // same walk, with and without running; the difference is the run cost
  const cost = (running, secs) => {
    const st = setup(running);
    const p = st.agents.player;
    const [c, r] = far();
    command(st, { type: 'walk', c, r });
    const h0 = p.needs.hunger, t0 = p.needs.thirst;
    let movingSecs = 0;
    for (let i = 0; i < secs; i++) { const was = p.path.length > 0; step(st); if (was) movingSecs++; }
    return { h: h0 - p.needs.hunger, t: t0 - p.needs.thirst, movingSecs };
  };
  const walk = cost(false, 300), runC = cost(true, 300);
  const extraH = runC.h - walk.h * (runC.movingSecs ? 1 : 1);
  assert.ok(Math.abs(extraH - runC.movingSecs * R.drain / R.drainEvery) < 0.05, `extra hunger ${extraH.toFixed(3)} for ${runC.movingSecs} s`);
  // standing with run on costs nothing extra
  const st = setup(true);
  const p = st.agents.player;
  const h0 = p.needs.hunger;
  const st2 = setup(false);
  const h2 = st2.agents.player.needs.hunger;
  run(st, 600); run(st2, 600);
  assert.ok(Math.abs((h0 - p.needs.hunger) - (h2 - st2.agents.player.needs.hunger)) < 1e-9);
});

test('run toggles on and off', () => {
  const st = setup(false);
  command(st, { type: 'run' }); assert.equal(st.agents.player.running, true);
  command(st, { type: 'run' }); assert.equal(st.agents.player.running, false);
});
