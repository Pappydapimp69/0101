import test from 'node:test';
import assert from 'node:assert/strict';
import { clampToBox, screenOffset, BOX } from '../src/render/camerabox.js';

const PITCH = Math.atan(1 / Math.SQRT2);
const HW = 20, HH = 13;

// Brain opticon#E42: check every camera yaw, not just the default pose.
for (const yaw of [Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (5 * Math.PI) / 4, 0.3]) {
  test(`player walking away stays inside the box at yaw ${yaw.toFixed(2)}`, () => {
    let target = { x: 0, z: 0 };
    let moved = false;
    for (const [vx, vz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7, -0.7]]) {
      const player = { x: target.x, z: target.z };
      for (let i = 0; i < 400; i++) {
        player.x += vx * 0.1; player.z += vz * 0.1;
        const t = clampToBox(target, player, yaw, PITCH, HW, HH);
        if (t.x !== target.x || t.z !== target.z) moved = true;
        target = t;
        const o = screenOffset(target, player, yaw, PITCH, HW, HH);
        assert.ok(Math.abs(o.x) <= BOX.x + 1e-9 && Math.abs(o.y) <= BOX.y + 1e-9, `left the box: ${o.x.toFixed(3)}, ${o.y.toFixed(3)}`);
      }
    }
    assert.ok(moved, 'the camera followed');
  });
}

test('inside the box the camera holds still', () => {
  const target = { x: 5, z: 5 };
  const t = clampToBox(target, { x: 6, z: 5.5 }, Math.PI / 4, PITCH, HW, HH);
  assert.deepEqual(t, target);
});

test('at the edge the player is held exactly on it, not pulled back to centre', () => {
  const yaw = Math.PI / 4;
  const t = clampToBox({ x: 0, z: 0 }, { x: 30, z: -30 }, yaw, PITCH, HW, HH);
  const o = screenOffset(t, { x: 30, z: -30 }, yaw, PITCH, HW, HH);
  assert.ok(Math.abs(Math.abs(o.x) - BOX.x) < 1e-9 || Math.abs(Math.abs(o.y) - BOX.y) < 1e-9);
});
