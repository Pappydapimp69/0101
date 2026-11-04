import test from 'node:test';
import assert from 'node:assert/strict';
import { stickToDir, createNavLatch } from '../src/input/gamepad.js';
import { createState, step, nudge, stopNudge, focusTargets, command } from '../src/sim/sim.js';

const DEFAULT_YAW = Math.PI / 4;

test('stick up walks up the screen at the default camera', () => {
  assert.deepEqual(stickToDir(0, -1, DEFAULT_YAW), [-1, -1]);
  assert.deepEqual(stickToDir(1, 0, DEFAULT_YAW), [1, -1]);
  assert.deepEqual(stickToDir(0, 1, DEFAULT_YAW), [1, 1]);
  assert.equal(stickToDir(0.1, -0.2, DEFAULT_YAW), null); // dead zone
});

test('stick stays camera-relative after rotating the camera', () => {
  // At the default pose a hard-coded mapping and a camera-relative one agree, so test rotated poses.
  for (let q = 0; q < 4; q++) {
    const yaw = DEFAULT_YAW + (q * Math.PI) / 2;
    const [dc, dr] = stickToDir(0, -1, yaw);
    // "up the screen" is away from the camera: opposite of (sin yaw, cos yaw)
    assert.ok(dc * Math.sin(yaw) + dr * Math.cos(yaw) < 0, `yaw q${q}: ${dc},${dr}`);
    const [rc, rr] = stickToDir(1, 0, yaw);
    // "right" is perpendicular to the view: (cos yaw, -sin yaw)
    assert.ok(rc * Math.cos(yaw) - rr * Math.sin(yaw) > 0, `yaw q${q} right: ${rc},${rr}`);
  }
  assert.notDeepEqual(stickToDir(0, -1, DEFAULT_YAW), stickToDir(0, -1, DEFAULT_YAW + Math.PI / 2));
});

test('menu nav latch ignores a direction held when the menu opened', () => {
  const l = createNavLatch();
  assert.equal(l.step(0.9), 0); // held from walking
  assert.equal(l.step(0.9), 0);
  assert.equal(l.step(0.0), 0); // back to neutral
  assert.equal(l.step(0.9), 1); // fresh press moves once
  assert.equal(l.step(0.9), 0); // no auto-repeat while held
  assert.equal(l.step(0.1), 0);
  assert.equal(l.step(-0.8), -1);
});

test('nudge walks tile by tile, slides along walls, and stops on release', () => {
  const st = createState(1);
  const p = st.agents.player;
  st.agents.npc.thinkAt = Infinity;
  // The master bedroom's west wall has no door; walking west must stop at its first column.
  const westCol = Math.min(...ROOM_TILES.masterBed.map(([c]) => c));
  for (let i = 0; i < 400; i++) { nudge(st, -1, 0); step(st); }
  assert.equal(p.c, westCol, 'blocked by the wall');
  assert.equal(roomOfP(p), 'masterBed');
  // diagonal into the wall slides north along it
  const r0 = p.r;
  for (let i = 0; i < 200; i++) { nudge(st, -1, -1); step(st); }
  assert.ok(p.r < r0, 'slid along the wall');
  stopNudge(st);
  assert.ok(p.path.length <= 1);
});

test('nudge cancels the current action', () => {
  const st = createState(2);
  command(st, { type: 'cook' });
  step(st);
  nudge(st, 0, -1);
  assert.equal(st.agents.player.task, null);
});

test('focus targets list nearby usable things, nearest first', () => {
  const st = createState(3);
  const p = st.agents.player;
  { const [c, r] = OBJ.fridge.slots[0].tile; Object.assign(p, { c, r, x: c + 0.5, z: r + 0.5 }); }
  const ts = focusTargets(st);
  const labels = ts.map((t) => t.label);
  assert.ok(labels.includes('Fridge') && labels.includes('Stove'), labels.join(','));
  assert.ok(!labels.includes('Your Bed'), 'other rooms excluded');
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i].d >= ts[i - 1].d);
  // holding a broom adds "this floor" as a target
  command(st, { type: 'pickTool', id: 'broom' });
  for (let i = 0; i < 1200; i++) step(st);
  assert.ok(focusTargets(st).some((t) => t.kind === 'floor'));
});

import { roomAt, OBJ } from '../src/sim/map.js';
import { ROOM_TILES } from '../src/sim/tasks.js';
function roomOfP(p) { return roomAt(p.c, p.r); }

// ---------------------------------------------------------------- steer: stick movement with lookahead
import { steer } from '../src/sim/sim.js';
import { DOORS, DOOR_EDGES, roomAt as roomAtT } from '../src/sim/map.js';
import { walkable as walkableT } from '../src/sim/path.js';
import { stickToWorld } from '../src/input/gamepad.js';

function doorTrial(move, d, off, lat) {
  const ra = roomAtT(...d.a), rb = roomAtT(...d.b);
  const ax = d.a[0] !== d.b[0];
  const sgn = ax ? Math.sign(d.b[0] - d.a[0]) : Math.sign(d.b[1] - d.a[1]);
  const span = [];
  for (const [k, v] of DOOR_EDGES) if (v === d) { const [c, r] = k.split('|')[0].split(',').map(Number); span.push(ax ? r : c); }
  const mid = (Math.min(...span) + Math.max(...span)) / 2;
  const c = ax ? d.a[0] - sgn * 2 : Math.round(mid + off), r = ax ? Math.round(mid + off) : d.a[1] - sgn * 2;
  if (!walkableT(c, r) || roomAtT(c, r) !== ra) return null;
  const wx = ax ? sgn : lat, wz = ax ? lat : sgn;
  const tx = ax ? sgn * 2.5 : mid - c, tz = ax ? mid - r : sgn * 2.5;
  if ((tx * wx + tz * wz) / (Math.hypot(tx, tz) * Math.hypot(wx, wz)) < Math.cos(Math.PI / 6)) return null; // door not ahead
  const st = createState(1);
  st.agents.npc.thinkAt = Infinity; st.agents.npc.away = true; st.agents.dog.thinkAt = Infinity; st.backDoorOpen = true;
  const p = st.agents.player;
  Object.assign(p, { c, r, x: c + 0.5, z: r + 0.5, path: [], task: null });
  for (let i = 0; i < 700; i++) { move(st, wx, wz); step(st); if (roomAtT(p.c, p.r) === rb) return true; }
  return false;
}

test('steer threads a doorway that is roughly ahead (old 8-way nudge did not)', () => {
  let n = 0, steerOk = 0, nudgeOk = 0;
  for (const d of DOORS) for (let off = -4; off <= 4; off++) for (const lat of [-1, 0, 1]) {
    const s = doorTrial(steer, d, off, lat);
    if (s === null) continue;
    n++; if (s) steerOk++;
    if (doorTrial(nudge, d, off, lat)) nudgeOk++;
  }
  assert.ok(n > 60, `trials ${n}`);
  assert.ok(steerOk / n >= 0.95, `steer ${steerOk}/${n}`);
  assert.ok(nudgeOk / n < 0.8, `nudge ${nudgeOk}/${n} (the bug this replaces)`);
});

test('steer still stops at a wall and slides along it, and stops on release', () => {
  const st = createState(1);
  const p = st.agents.player;
  st.agents.npc.thinkAt = Infinity;
  const westCol = Math.min(...ROOM_TILES.masterBed.map(([c]) => c));
  for (let i = 0; i < 400; i++) { steer(st, -1, 0); step(st); }
  assert.equal(p.c, westCol, 'blocked by the wall');
  assert.equal(roomOfP(p), 'masterBed');
  const r0 = p.r;
  for (let i = 0; i < 200; i++) { steer(st, -1, -0.6); step(st); }
  assert.ok(p.r < r0, 'slid along the wall');
  stopNudge(st);
  assert.ok(p.path.length <= 1);
});

test('stickToWorld keeps the stick angle (no 8-way snap)', () => {
  const [x1, z1] = stickToWorld(0.3, -0.9, DEFAULT_YAW);
  const [x2, z2] = stickToWorld(0.5, -0.8, DEFAULT_YAW);
  assert.ok(Math.abs(Math.atan2(z1, x1) - Math.atan2(z2, x2)) > 0.1);
  assert.equal(stickToWorld(0.05, 0.05, DEFAULT_YAW), null);
});
