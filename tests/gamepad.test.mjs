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
  // Player starts at (20,18) in the master bedroom; west wall at col 19|18 has no door on row 18.
  for (let i = 0; i < 400; i++) { nudge(st, -1, 0); step(st); }
  assert.equal(p.c, 19, 'blocked by the wall');
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
  Object.assign(p, { c: 11, r: 3, x: 11.5, z: 3.5 });
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

import { roomAt } from '../src/sim/map.js';
function roomOfP(p) { return roomAt(p.c, p.r); }
