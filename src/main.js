import { createState, step, command, getOptions, timeScale, BASE_RATE } from './sim/sim.js';
import { createScene } from './render/scene.js';
import { createHud } from './render/hud.js';

const seed = Number(new URLSearchParams(location.search).get('seed')) || 1;
const st = createState(seed);
const canvas = document.getElementById('view');
const scene = createScene(canvas);
let speed = 1;
const SPEEDS = { 0: 0, 1: 1, 2: 2, 3: 4 };
const hud = createHud();

// ---------------------------------------------------------------- input
const menu = document.getElementById('menu');
function closeMenu() { menu.hidden = true; }
function openMenu(x, y, opts, title) {
  menu.innerHTML = '';
  if (title) {
    const h = document.createElement('h4');
    h.textContent = title;
    menu.appendChild(h);
  }
  for (const o of opts) {
    const b = document.createElement('button');
    b.textContent = o.disabled ? `${o.label} — ${o.disabled}` : o.label;
    b.disabled = !!o.disabled;
    b.onclick = (e) => { e.stopPropagation(); command(st, o.cmd); closeMenu(); };
    menu.appendChild(b);
  }
  menu.hidden = false;
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  menu.style.left = `${Math.min(x, window.innerWidth - w - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - h - 8)}px`;
}

const TITLES = { npc: 'Sam', dog: 'Biscuit' };
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button, moved: false }; });
canvas.addEventListener('pointermove', (e) => {
  if (down && (down.b === 2 || down.b === 1 || e.shiftKey)) {
    const k = (scene.cam.zoom * 2) / canvas.clientHeight;
    scene.pan(-(e.clientX - down.x) * k, (e.clientY - down.y) * k * 1.4);
    down.x = e.clientX; down.y = e.clientY; down.moved = true;
  }
  const hit = scene.pick(e.clientX, e.clientY);
  canvas.style.cursor = hit && hit.kind !== 'floor' ? 'pointer' : 'default';
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerup', (e) => {
  const d = down;
  down = null;
  if (!d || d.moved || d.b !== 0) return;
  const hit = scene.pick(e.clientX, e.clientY);
  if (!hit) { closeMenu(); return; }
  const opts = getOptions(st, hit);
  if (!opts.length) { closeMenu(); return; }
  if (opts.length === 1 && opts[0].cmd.type === 'walk') { command(st, opts[0].cmd); closeMenu(); return; }
  const title = hit.kind === 'agent' ? TITLES[hit.id] : null;
  openMenu(e.clientX, e.clientY, opts, title);
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); scene.zoomBy(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });

const held = new Set();
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'escape') closeMenu();
  if (k === 'q') scene.rotate(-1);
  if (k === 'e') scene.rotate(1);
  if (k === 'f') scene.cam.follow = true;
  if (k === 't') scene.toggleWalls();
  if (k === ' ') { speed = speed ? 0 : 1; e.preventDefault(); }
  if (['1', '2', '3'].includes(k)) speed = Number(k);
  if (k === '0' || k === 'p') speed = 0;
  held.add(k);
});
window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));

document.querySelectorAll('[data-speed]').forEach((b) => { b.onclick = () => { speed = Number(b.dataset.speed); }; });
document.getElementById('p-stop').onclick = () => command(st, { type: 'stop' });
document.getElementById('p-drop').onclick = () => command(st, { type: 'putDown' });
document.getElementById('p-phone').onclick = () => {
  const t = st.agents.player.task;
  command(st, t && t.name === 'phone' ? { type: 'stop' } : { type: 'phone' });
};
document.getElementById('rot-l').onclick = () => scene.rotate(-1);
document.getElementById('rot-r').onclick = () => scene.rotate(1);
document.getElementById('walls').onclick = () => scene.toggleWalls();
document.getElementById('follow').onclick = () => { scene.cam.follow = true; };

// ---------------------------------------------------------------- loop
// Fixed-step sim (1 step = 1 game second) driven by an accumulator, so speed-ups
// (phone, computer, sleep) run more steps, never bigger ones.
let acc = 0;
let last = performance.now();
const MAX_STEPS = 4000;
function frame() {
  const now = performance.now();
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (speed) {
    acc += dt * BASE_RATE * SPEEDS[speed] * timeScale(st);
    let n = 0;
    while (acc >= 1 && n < MAX_STEPS) { step(st); acc -= 1; n++; }
    if (n >= MAX_STEPS) acc = 0;
  }
  const pan = 12 * dt;
  if (held.has('w') || held.has('arrowup')) scene.pan(0, pan);
  if (held.has('s') || held.has('arrowdown')) scene.pan(0, -pan);
  if (held.has('a') || held.has('arrowleft')) scene.pan(-pan, 0);
  if (held.has('d') || held.has('arrowright')) scene.pan(pan, 0);
  scene.sync(st, dt);
  hud.update(st, scene, speed);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__game = { st, step, command, getOptions, scene, setSpeed: (s) => { speed = s; } };
