import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrend, direction, eta } from '../src/sim/trend.js';
import { createState, step, command } from '../src/sim/sim.js';

test('rate is per game hour regardless of how often it is sampled', () => {
  for (const every of [1, 10, 30]) {
    const tr = createTrend({ every });
    for (let t = 0; t <= 600; t++) tr.push(t, { v: 80 - (t * 6) / 3600 });
    assert.ok(Math.abs(tr.rate('v') + 6) < 0.01, `every ${every}: ${tr.rate('v')}`);
  }
});

test('trend follows a change of direction within the window', () => {
  const tr = createTrend({ window: 120, every: 10 });
  let v = 50;
  for (let t = 0; t < 600; t++) { v -= 8 / 3600; tr.push(t, { v }); }
  assert.equal(direction(tr.rate('v'), v), 'down');
  for (let t = 600; t < 800; t++) { v += 120 / 3600; tr.push(t, { v }); }
  assert.equal(direction(tr.rate('v'), v), 'up');
});

test('steady or pinned values show no arrow', () => {
  assert.equal(direction(0.3, 50), '');
  assert.equal(direction(5, 100), '');
  assert.equal(direction(-5, 0), '');
});

test('eta text', () => {
  assert.equal(eta(-10, 50), 'empty in 5h');
  assert.equal(eta(60, 75), 'full in 25m');
  assert.equal(eta(-6, 20), 'empty in 3h 20m');
  assert.equal(eta(0, 50), '');
});

test('eating shows hunger going up in the real sim', () => {
  const st = createState(3);
  st.agents.npc.thinkAt = Infinity;
  const tr = createTrend();
  const p = st.agents.player;
  for (let i = 0; i < 300; i++) { step(st); tr.push(st.time, p.needs); }
  assert.equal(direction(tr.rate('hunger'), p.needs.hunger), 'down');
  command(st, { type: 'snack' });
  let sawUp = false;
  for (let i = 0; i < 3600 && !sawUp; i++) {
    step(st); tr.push(st.time, p.needs);
    if (p.task && p.task.name === 'snack' && p.task.i === 1 && direction(tr.rate('hunger'), p.needs.hunger) === 'up') sawUp = true;
  }
  assert.ok(sawUp, 'hunger arrow never turned up while eating');
});
