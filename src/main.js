import {
  createState, step, command, getOptions, timeScale, BASE_RATE, nudge, stopNudge, focusTargets,
} from './sim/sim.js?v=c68f1a6';
import { BTN, stickToDir, createNavLatch, createPadReader, DEAD } from './input/gamepad.js?v=c68f1a6';
import { createScene } from './render/scene.js?v=c68f1a6';
import { createHud } from './render/hud.js?v=c68f1a6';

const seed = Number(new URLSearchParams(location.search).get('seed')) || 1;
const st = createState(seed);
const canvas = document.getElementById('view');
const scene = createScene(canvas);
let speed = 1;
const SPEEDS = { 0: 0, 1: 1, 2: 2, 3: 4 };
const hud = createHud();

// ---------------------------------------------------------------- input
const menu = document.getElementById('menu');
let menuFocus = 0;
const menuButtons = () => [...menu.querySelectorAll('button:not(:disabled)')];
function setMenuFocus(i) {
  const bs = menuButtons();
  if (!bs.length) return;
  menuFocus = (i + bs.length) % bs.length;
  bs.forEach((b, k) => b.classList.toggle('focus', k === menuFocus));
}
function closeMenu() { menu.hidden = true; }
function openMenu(x, y, opts, title) {
  menu.innerHTML = '';
  navLatch.reset(); // a direction already held when the menu opens must not move the focus
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
  setMenuFocus(0);
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  menu.style.left = `${Math.min(x, window.innerWidth - w - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - h - 8)}px`;
}

const TITLES = { npc: 'Sam', dog: 'Biscuit' };
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button, moved: false }; });
canvas.addEventListener('pointermove', (e) => {
  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) usingPad = false;
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

// ---------------------------------------------------------------- gamepad
// Left stick walks (camera-relative) · A interacts with the highlighted thing · D-pad ◀▶ picks
// what's highlighted · B stops / closes · X puts down · Y phone · LB/RB rotate · LT/RT zoom ·
// right stick pans · R3 re-follows · D-pad ▲▼ speed · Start pauses · Back toggles walls.
const padReader = createPadReader();
const navLatch = createNavLatch();
let usingPad = false;
let focusKey = null;
let focusList = [];
let stickWasHeld = false;
const focusEl = document.getElementById('focus');

function interact(t) {
  const opts = getOptions(st, t).filter((o) => o.cmd.type !== 'walk');
  if (!opts.length) return;
  const usable = opts.filter((o) => !o.disabled);
  if (usable.length === 1 && opts.length === 1) { command(st, usable[0].cmd); return; }
  const [x, y] = scene.worldToScreen(t.x, 1, t.z);
  openMenu(x + 24, y - 20, opts, t.label);
}

function handlePad(dt) {
  const pad = padReader.poll();
  if (!pad) { usingPad = false; return; }
  // The first press after the mouse was in use only wakes pad mode (shows the highlight);
  // it must not also act on whatever happens to be highlighted.
  if (!usingPad) { if (pad.active) usingPad = true; return; }
  document.body.classList.add('pad');

  if (!menu.hidden) {
    const v = pad.held(BTN.DOWN) ? 1 : pad.held(BTN.UP) ? -1 : pad.ly;
    const m = navLatch.step(v);
    if (m) setMenuFocus(menuFocus + m);
    if (pad.pressed(BTN.A)) { const b = menuButtons()[menuFocus]; if (b) b.click(); }
    if (pad.pressed(BTN.B)) closeMenu();
    return;
  }

  const dir = stickToDir(pad.lx, pad.ly, scene.cam.yawTarget);
  if (dir) {
    nudge(st, dir[0], dir[1]);
    stickWasHeld = true;
    focusKey = null; // re-target the nearest thing while walking
  } else if (stickWasHeld) {
    stopNudge(st);
    stickWasHeld = false;
  }

  focusList = focusTargets(st);
  let fi = focusList.findIndex((t) => t.key === focusKey);
  if (fi < 0) fi = 0;
  if (pad.pressed(BTN.RIGHT)) fi += 1;
  if (pad.pressed(BTN.LEFT)) fi -= 1;
  const n = focusList.length;
  const focused = n ? focusList[((fi % n) + n) % n] : null;
  focusKey = focused ? focused.key : null;

  if (pad.pressed(BTN.A) && focused) interact(focused);
  if (pad.pressed(BTN.B)) command(st, { type: 'stop' });
  if (pad.pressed(BTN.X)) command(st, { type: 'putDown' });
  if (pad.pressed(BTN.Y)) document.getElementById('p-phone').click();
  if (pad.pressed(BTN.LB)) scene.rotate(-1);
  if (pad.pressed(BTN.RB)) scene.rotate(1);
  if (pad.value(BTN.LT) > 0.2) scene.zoomBy(1 + pad.value(BTN.LT) * dt * 1.5);
  if (pad.value(BTN.RT) > 0.2) scene.zoomBy(1 - pad.value(BTN.RT) * dt * 1.2);
  if (Math.hypot(pad.rx, pad.ry) > DEAD) scene.pan(pad.rx * 14 * dt, -pad.ry * 14 * dt);
  if (pad.pressed(BTN.RS)) scene.cam.follow = true;
  if (pad.pressed(BTN.UP)) speed = Math.min(3, speed + 1);
  if (pad.pressed(BTN.DOWN)) speed = Math.max(0, speed - 1);
  if (pad.pressed(BTN.START)) speed = speed ? 0 : 1;
  if (pad.pressed(BTN.BACK)) scene.toggleWalls();
}

function drawFocus() {
  const focused = usingPad && menu.hidden ? focusList.find((t) => t.key === focusKey) : null;
  scene.setFocus(focused ? [focused.x, focused.z] : null);
  document.body.classList.toggle('pad', usingPad);
  if (!focused) { focusEl.hidden = true; return; }
  const [x, y] = scene.worldToScreen(focused.x, 1.6, focused.z);
  focusEl.hidden = false;
  focusEl.textContent = `Ⓐ ${focused.label}${focusList.length > 1 ? '  ◀▶' : ''}`;
  focusEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
}
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
  handlePad(dt);
  const pan = 12 * dt;
  if (held.has('w') || held.has('arrowup')) scene.pan(0, pan);
  if (held.has('s') || held.has('arrowdown')) scene.pan(0, -pan);
  if (held.has('a') || held.has('arrowleft')) scene.pan(-pan, 0);
  if (held.has('d') || held.has('arrowright')) scene.pan(pan, 0);
  scene.sync(st, dt);
  drawFocus();
  hud.update(st, scene, speed);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__game = { st, step, command, getOptions, scene, setSpeed: (s) => { speed = s; }, focusTargets };
