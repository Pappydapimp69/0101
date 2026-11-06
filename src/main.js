import {
  createState, step, command, getOptions, timeScale, BASE_RATE, steer, stopNudge, focusTargets,
} from './sim/sim.js';
import { BTN, stickToWorld, createNavLatch, createPadReader, DEAD } from './input/gamepad.js';
import { activeAlert } from './sim/alerts.js';
import { createScene } from './render/scene.js';
import { createHud } from './render/hud.js';

import { readSave, writeSave, clearSave } from './sim/save.js';

// Load the autosave unless a seed is asked for in the URL (tests, shared links) or ?new.
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 1;
let store = null;
try { store = window.localStorage; } catch { store = null; }
if (params.has('new') && store) clearSave(store);
const loaded = !params.has('seed') && !params.has('new') && store ? readSave(store) : null;
const st = loaded || createState(seed);
// Autosave every 20 real seconds and whenever the tab is hidden or closed.
const save = () => { if (store) writeSave(store, st); };
if (store) {
  setInterval(save, 20000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
}
const canvas = document.getElementById('view');
const scene = createScene(canvas);
let speed = 1;
let lastAlert = 0;
const SPEEDS = { 0: 0, 1: 1, 2: 2, 3: 4 };

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
let inputKind = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
const hud = createHud({
  command: (cmd) => command(st, cmd),
  scene,
  getSpeed: () => speed,
  setSpeed: (v) => { speed = v; },
  getInput: () => (usingPad ? 'pad' : inputKind),
});

// One finger / left button: tap = interact, drag = pan. Two fingers: pinch to zoom.
const pointers = new Map();
let down = null;
let pinch = null;
canvas.addEventListener('pointerdown', (e) => {
  inputKind = e.pointerType === 'touch' ? 'touch' : 'mouse';
  usingPad = false;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
    down = null;
  } else if (pointers.size === 1) {
    down = { x: e.clientX, y: e.clientY, b: e.button, moved: false, sx: e.clientX, sy: e.clientY };
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && Math.abs(e.movementX) + Math.abs(e.movementY) > 2) { usingPad = false; inputKind = 'mouse'; }
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 0 && pinch.d > 0) scene.zoomBy(pinch.d / d);
    pinch.d = d;
    return;
  }
  if (down) {
    if (!down.moved && Math.hypot(e.clientX - down.sx, e.clientY - down.sy) > (e.pointerType === 'touch' ? 10 : 5)) down.moved = true;
    if (down.moved) {
      const k = (scene.cam.zoom * 2) / Math.min(canvas.clientHeight, canvas.clientWidth);
      scene.pan(-(e.clientX - down.x) * k, (e.clientY - down.y) * k * 1.4);
    }
    down.x = e.clientX; down.y = e.clientY;
  }
  if (e.pointerType === 'mouse' && !down) {
    const hit = scene.pick(e.clientX, e.clientY);
    canvas.style.cursor = hit && hit.kind !== 'floor' ? 'pointer' : 'default';
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
}
canvas.addEventListener('pointercancel', (e) => { endPointer(e); down = null; });
canvas.addEventListener('pointerup', (e) => {
  endPointer(e);
  const d = down;
  down = null;
  if (!d || d.moved || d.b !== 0) return;
  if (hud.isOpen()) hud.toggle(hud.isOpen()); // a tap on the world closes the detail sheet
  // pick where the finger/cursor went DOWN, not where it lifted (release drifts onto the next tile)
  const hit = scene.pick(d.sx, d.sy);
  if (!hit) { closeMenu(); return; }
  const opts = getOptions(st, hit);
  if (!opts.length) { closeMenu(); return; }
  if (opts.length === 1 && opts[0].cmd.type === 'walk') { command(st, opts[0].cmd); closeMenu(); return; }
  const title = hit.kind === 'agent' ? TITLES[hit.id] : null;
  openMenu(d.sx, d.sy, opts, title);
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); scene.zoomBy(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });

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
let wheelFocus = -1;
let wheelStep = 0;
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

  if (!menu.hidden) {
    // a worn stick resting just off centre must read as neutral, or the latch never re-arms for the D-pad
    const v = pad.held(BTN.DOWN) ? 1 : pad.held(BTN.UP) ? -1 : Math.abs(pad.ly) > DEAD ? pad.ly : 0;
    const m = navLatch.step(v);
    if (m) setMenuFocus(menuFocus + m);
    if (pad.pressed(BTN.A)) { const b = menuButtons()[menuFocus]; if (b) b.click(); }
    if (pad.pressed(BTN.B)) closeMenu();
    return;
  }
  if (hud.isOpen() && pad.pressed(BTN.B)) { hud.toggle(hud.isOpen()); return; }

  if (hud.wheelOpen()) {
    const bs = hud.wheelButtons();
    // left/right (stick or d-pad) steps along the topic row
    const x = Math.abs(pad.lx) > 0.5 ? Math.sign(pad.lx) : pad.held(BTN.RIGHT) ? 1 : pad.held(BTN.LEFT) ? -1 : 0;
    if (x && x !== wheelStep) wheelFocus = wheelFocus < 0 ? 0 : (wheelFocus + x + bs.length) % bs.length;
    wheelStep = x;
    if (wheelFocus >= bs.length) wheelFocus = bs.length - 1;
    if (bs[wheelFocus]) bs[wheelFocus].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    bs.forEach((b, i) => b.classList.toggle('focus', i === wheelFocus));
    if (pad.pressed(BTN.A) && wheelFocus >= 0 && !bs[wheelFocus].disabled) bs[wheelFocus].click();
    if (pad.pressed(BTN.B)) command(st, { type: 'stop' });
    return;
  }
  wheelFocus = -1;
  // d-pad left/right cycle focus, so movement is the stick only; steer() looks a few tiles ahead
  const dir = stickToWorld(pad.lx, pad.ly, scene.cam.yawTarget);
  if (dir) {
    steer(st, dir[0], dir[1]);
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
  if (pad.pressed(BTN.Y)) {
    // Y fixes a red low-need alert when one is showing (the alert says "Press Ⓨ"), else the phone
    const al = activeAlert(st);
    if (al && al.cmd) command(st, al.cmd);
    else document.getElementById('phone').click();
  }
  if (pad.pressed(BTN.LB)) scene.rotate(-1);
  if (pad.pressed(BTN.RB)) scene.rotate(1);
  if (pad.value(BTN.LT) > 0.2) scene.zoomBy(1 + pad.value(BTN.LT) * dt * 1.5);
  if (pad.value(BTN.RT) > 0.2) scene.zoomBy(1 - pad.value(BTN.RT) * dt * 1.2);
  if (Math.hypot(pad.rx, pad.ry) > DEAD) scene.pan(pad.rx * 14 * dt, -pad.ry * 14 * dt);
  if (pad.pressed(BTN.RS)) scene.cam.follow = true;
  if (pad.pressed(BTN.UP)) speed = Math.min(3, speed + 1);
  if (pad.pressed(BTN.DOWN)) speed = Math.max(0, speed - 1);
  if (pad.pressed(BTN.START)) speed = speed ? 0 : 1;
  if (pad.pressed(BTN.BACK)) hud.toggle('me');
  if (pad.pressed(BTN.LS)) command(st, { type: 'run' }); // L3: run on/off (walls: ⋯ menu or T)
}

function drawFocus() {
  document.body.classList.toggle('pad', usingPad);
  const focused = usingPad && menu.hidden ? focusList.find((t) => t.key === focusKey) : null;
  scene.setFocus(focused ? [focused.x, focused.z] : null);
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
  if (k === 'escape') { closeMenu(); if (hud.isOpen()) hud.toggle(hud.isOpen()); }
  if (k === 'q') scene.rotate(-1);
  if (k === 'e') scene.rotate(1);
  if (k === 'f') scene.cam.follow = true;
  if (k === 't') scene.toggleWalls();
  if (k === 'r') command(st, { type: 'run' });
  if (k === ' ') { speed = speed ? 0 : 1; e.preventDefault(); }
  if (['1', '2', '3'].includes(k)) speed = Number(k);
  if (k === '0' || k === 'p') speed = 0;
  held.add(k);
});
window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));

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
    if ((st.alertEvent || 0) !== lastAlert) { lastAlert = st.alertEvent || 0; if (speed > 1) speed = 1; } // a need went critical: no fast-forward
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
  hud.update(st, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__game = { st, step, command, getOptions, scene, setSpeed: (s) => { speed = s; }, focusTargets, save, loaded: !!loaded };
