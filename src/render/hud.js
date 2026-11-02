// HUD: information minimalism. Everything is a small chip or ring; detail lives in one sheet that
// opens on demand. Rings for needs that are fine fade back; ones that need you pulse.
import { ROOM_BY_ID, roomAt } from '../sim/map.js';
import { dayOf, hourOf } from '../sim/state.js';
import { timeScale } from '../sim/sim.js';
import { createTrend, direction, eta } from '../sim/trend.js';

const $ = (sel) => document.querySelector(sel);
const NEEDS_H = [['hunger', 'Hunger', '🍔'], ['thirst', 'Thirst', '💧'], ['bladder', 'Bladder', '🚽'], ['social', 'Social', '💬'], ['energy', 'Energy', '⚡']];
const NEEDS_D = [['hunger', 'Hunger', '🍖'], ['thirst', 'Thirst', '💧'], ['potty', 'Potty', '🌳'], ['play', 'Play', '🎾'], ['energy', 'Energy', '⚡']];
const ROOM_ORDER = ['kitchen', 'laundry', 'living', 'garage', 'bedroom3', 'hallway', 'bedroom1', 'bathroom', 'masterBath', 'masterBed'];
const SPEED_LABEL = ['⏸', '1×', '2×', '4×'];

const face = (m) => (m >= 75 ? '😄' : m >= 55 ? '🙂' : m >= 40 ? '😐' : m >= 25 ? '🙁' : '😫');
const color = (v) => (v >= 60 ? 'var(--good)' : v >= 30 ? 'var(--warn)' : 'var(--bad)');
const ARROW = { up: '▲', down: '▼', '': '' };
const hhmm = (t) => `${String(Math.floor((t % 86400) / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;

function clockText(st, short) {
  const h = hourOf(st);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const t = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
  return short ? t : `Day ${dayOf(st)} · ${t}`;
}

const LEGEND = {
  mouse: '<b>Click</b> floor to walk · <b>click</b> things for actions · <b>drag</b> to pan · <b>wheel</b> zoom · <b>Q/E</b> rotate · <b>T</b> walls · <b>F</b> follow · <b>Space</b> pause · <b>1/2/3</b> speed',
  touch: '<b>Tap</b> floor to walk · <b>tap</b> things for actions · <b>drag</b> to pan · <b>pinch</b> to zoom · rotate and walls are in this menu',
  pad: '<b>L-stick</b> walk · <b>A</b> use highlighted · <b>D-pad ◀▶</b> pick target · <b>B</b> stop/back · <b>X</b> put down · <b>Y</b> phone · <b>LB/RB</b> rotate · <b>LT/RT</b> zoom · <b>R-stick</b> pan (<b>R3</b> follow) · <b>D-pad ▲▼</b> speed · <b>Start</b> pause · <b>Back</b> your needs · <b>L3</b> walls',
};

export function createHud({ command, scene, getSpeed, setSpeed, getInput }) {
  const labels = {};
  for (const id of ['player', 'npc', 'dog']) {
    const d = document.createElement('div');
    d.className = `label label-${id}`;
    $('#labels').appendChild(d);
    labels[id] = d;
  }
  $('#me-rings').innerHTML = NEEDS_H.map(([k, l, i]) => `<span class="ring" data-k="${k}" data-icon="${i}" title="${l}"></span>`).join('');

  let open = null; // which sheet is showing
  const sheet = $('#sheet');
  function toggle(name) {
    open = open === name ? null : name;
    sheet.hidden = !open;
    sheet.innerHTML = open ? SKELETON[open] : '';
    for (const k in lastLive) delete lastLive[k];
    sheetTick = 0;
  }
  for (const [id, name] of [['#me', 'me'], ['#sam', 'sam'], ['#dog', 'dog'], ['#rooms', 'rooms'], ['#morebtn', 'more']]) {
    $(id).addEventListener('click', (e) => { e.stopPropagation(); toggle(name); });
  }
  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') toggle(open);
    else if (act.startsWith('speed')) setSpeed(Number(act.slice(5)));
    else if (act === 'rotL') scene.rotate(-1);
    else if (act === 'rotR') scene.rotate(1);
    else if (act === 'walls') scene.toggleWalls();
    else if (act === 'follow') scene.cam.follow = true;
  });
  $('#pause').onclick = () => setSpeed(getSpeed() ? 0 : 1);
  $('#speed').onclick = () => setSpeed(getSpeed() >= 3 ? 1 : getSpeed() + 1);
  $('#phone').onclick = () => {
    const t = window.__game.st.agents.player.task;
    command(t && t.name === 'phone' ? { type: 'stop' } : { type: 'phone' });
  };
  $('#stop').onclick = () => command({ type: 'stop' });
  $('#drop').onclick = () => command({ type: 'putDown' });

  // Trends measured in game time, so arrows mean the same thing at every speed.
  const trend = { player: createTrend(), npc: createTrend(), dog: createTrend() };
  const row = (label, v, tr, k) => {
    const r = tr.rate(k);
    const d = direction(r, v);
    const urgent = d === 'down' && v / -r < 2; // runs out within ~2 game hours
    const when = k === 'mood' ? '' : eta(r, v); // mood drifts toward a target; it doesn't "run out"
    return `<div class="row"><span>${label}</span><div><div class="bar"><i style="width:${v}%;background:${color(v)}"></i></div>${when ? `<small class="eta ${urgent ? 'down-fast' : d}">${when}</small>` : ''}</div><b>${Math.round(v)}</b><em class="t ${urgent ? 'down-fast' : d}">${ARROW[d]}</em></div>`;
  };
  const rows = (defs, needs, tr) => defs.map(([k, l, i]) => row(`${i} ${l}`, needs[k], tr, k)).join('');

  // Each sheet = a skeleton built once when it opens (buttons live here and are never replaced)
  // plus [data-live] slots whose contents refresh while it stays open.
  const close = '<button data-act="close" aria-label="Close">✕</button>';
  const SKELETON = {
    me: `<h3><span data-live="title"></span>${close}</h3><div data-live="body"></div>`,
    sam: `<h3><span data-live="title"></span>${close}</h3><div data-live="body"></div>
      <div class="legend">Sam has their own needs. Talk when they're in a good mood.</div>`,
    dog: `<h3><span>🐶 Biscuit</span>${close}</h3><div data-live="body"></div>`,
    rooms: `<h3><span>Cleanliness</span>${close}</h3><div data-live="body"></div>`,
    more: `<h3><span data-live="title"></span>${close}</h3>
      <h4>Speed</h4><div class="btns">${SPEED_LABEL.map((l, i) => `<button data-act="speed${i}">${l}</button>`).join('')}</div>
      <h4>Camera</h4><div class="btns"><button data-act="rotL">⟲ Rotate</button><button data-act="rotR">⟳ Rotate</button><button data-act="walls">Walls</button><button data-act="follow">◎ Follow me</button></div>
      <h4>Recent</h4><div class="log" data-live="log"></div>
      <h4>Controls</h4><div class="legend" data-live="legend"></div>`,
  };

  function live(st) {
    const p = st.agents.player;
    const npc = st.agents.npc;
    const dog = st.agents.dog;
    switch (open) {
      case 'me':
        return {
          title: `You ${face(p.mood)}`,
          body: `${row('Mood', p.mood, trend.player, 'mood')}
            ${rows(NEEDS_H, p.needs, trend.player)}<div class="kv">Doing <span>${p.task ? p.task.label : 'Idle'}</span></div>`,
        };
      case 'sam':
        return {
          title: `Sam ${face(npc.mood)}`,
          body: `${row('Mood', npc.mood, trend.npc, 'mood')}
            <div class="kv">Doing <span>${npc.asleep ? 'Sleeping' : npc.task ? npc.task.label : 'Idle'}</span></div>
            ${npc.grudge > 8 ? `<div class="kv">Feeling <span style="color:var(--warn)">${npc.grudge > 25 ? 'Fed up with you' : 'A bit annoyed with you'}</span></div>` : ''}`,
        };
      case 'dog':
        return {
          body: `${rows(NEEDS_D, dog.needs, trend.dog)}
            <div class="kv">Doing <span>${dog.waitingAtDoor ? '🚪 Waiting at the back door' : dog.task ? dog.task.label : 'Idle'}</span></div>
            <div class="kv">Food bowl <span>${Math.round(st.bowls.food)}%</span></div>
            <div class="kv">Water bowl <span>${Math.round(st.bowls.water)}%</span></div>
            <div class="kv">Back door <span>${st.backDoorOpen ? 'Open' : 'Closed'}</span></div>`,
        };
      case 'rooms': {
        const here = roomAt(p.c, p.r);
        return {
          body: ROOM_ORDER.map((id) => {
            const v = st.rooms[id].clean;
            return `<div class="row${id === here ? ' here' : ''}"><span>${ROOM_BY_ID[id].name}</span><div class="bar"><i style="width:${v}%;background:${color(v)}"></i></div><b>${Math.round(v)}</b></div>`;
          }).join(''),
        };
      }
      case 'more':
        return {
          title: clockText(st),
          log: st.log.slice(-8).reverse().map((e) => `<div><time>${hhmm(e.t)}</time>${e.msg}</div>`).join('') || '<div>Nothing yet.</div>',
          legend: LEGEND[getInput()],
        };
      default:
        return {};
    }
  }

  // Never swap the sheet's DOM out from under a finger or cursor mid-press (the click would be lost).
  let pressing = false;
  sheet.addEventListener('pointerdown', () => { pressing = true; });
  window.addEventListener('pointerup', () => { pressing = false; });
  window.addEventListener('pointercancel', () => { pressing = false; });
  const lastLive = {};

  let lastLog = '';
  let toastUntil = 0;
  let sheetTick = 0;

  function update(st, dtReal) {
    const p = st.agents.player;
    const npc = st.agents.npc;
    const dog = st.agents.dog;
    const narrow = window.innerWidth < 520;

    // clock & speed
    const speed = getSpeed();
    $('#clock').textContent = clockText(st, narrow);
    const ts = timeScale(st);
    $('#scale').textContent = ts > 1 ? (p.asleep ? `💤×${ts}` : `⏩×${ts}`) : '';
    $('#pause').textContent = speed ? '⏸' : '▶';
    $('#pause').classList.toggle('on', !speed);
    $('#speed').textContent = SPEED_LABEL[Math.max(1, speed)];

    trend.player.push(st.time, { ...p.needs, mood: p.mood });
    trend.npc.push(st.time, { mood: npc.mood });
    trend.dog.push(st.time, dog.needs);

    // your needs: rings fade when fine, pulse when urgent; ▲/▼ show which way each is moving
    $('#me .face').textContent = face(p.mood);
    const md = direction(trend.player.rate('mood'), p.mood);
    $('#mood-trend').textContent = ARROW[md];
    $('#mood-trend').className = `t ${md === 'down' ? 'down-soft' : md}`;
    for (const el of document.querySelectorAll('#me-rings .ring')) {
      const v = p.needs[el.dataset.k];
      const r = trend.player.rate(el.dataset.k);
      const d = direction(r, v);
      // falling is normal; it only turns red when it will run out within ~2 game hours
      el.dataset.trend = d === 'down' && v / -r < 2 ? 'down-fast' : d;
      el.style.setProperty('--v', v.toFixed(0));
      el.style.setProperty('--c', color(v));
      el.classList.toggle('quiet', v >= 60);
      el.classList.toggle('alert', v < 25);
    }

    // people chips: only shout when something needs you
    $('#sam-face').textContent = face(npc.mood);
    $('#sam .badge').textContent = npc.grudge > 8 ? '😤' : '';
    const dogAlert = dog.waitingAtDoor ? '🚪' : (st.bowls.food < 20 || st.bowls.water < 20) && Math.min(dog.needs.hunger, dog.needs.thirst) < 40 ? '🥣'
      : dog.needs.play < 25 ? '🎾' : '';
    $('#dog .badge').textContent = dogAlert;
    const here = roomAt(p.c, p.r);
    const hereClean = st.rooms[here] ? Math.round(st.rooms[here].clean) : null;
    let worst = null;
    for (const id of ROOM_ORDER) if (!worst || st.rooms[id].clean < st.rooms[worst].clean) worst = id;
    $('#room-name').textContent = hereClean !== null ? `${narrow ? '' : `${ROOM_BY_ID[here].name} `}${hereClean}%` : 'Outside';
    const dirty = st.rooms[worst].clean < 35;
    $('#rooms .badge').textContent = dirty ? '!' : '';
    $('#rooms').classList.toggle('warn', dirty);

    // action bar: only what you're doing / holding right now
    const c = p.carrying;
    const doing = p.task ? p.task.label : '';
    const holding = c ? (c.kind === 'tool' ? st.tools[c.id].name : c.kind === 'dishes' ? `${c.n} dish${c.n > 1 ? 'es' : ''}` : '') : '';
    $('#doing').innerHTML = [doing && `<b>${doing}</b>`, holding && `holding ${holding}`].filter(Boolean).join(' · ');
    $('#doing').hidden = !doing && !holding;
    $('#stop').hidden = !p.task;
    $('#drop').hidden = !c || c.kind === 'meal';
    $('#phone').classList.toggle('on', !!(p.task && p.task.name === 'phone'));

    // toast: newest message for a few seconds, then gone (history lives in the ⋯ menu)
    const last = st.log.length ? st.log[st.log.length - 1] : null;
    const sig = last ? `${last.t}:${st.log.length}:${last.msg}` : '';
    const now = performance.now();
    if (sig && sig !== lastLog) {
      lastLog = sig;
      $('#toast').textContent = last.msg;
      toastUntil = now + 5000;
    }
    $('#toast').classList.toggle('gone', now > toastUntil);

    // detail sheet refreshes a few times a second while open
    sheetTick -= dtReal;
    if (open && sheetTick <= 0 && !pressing) {
      sheetTick = 0.25;
      const vals = live(st);
      for (const [k, html] of Object.entries(vals)) {
        if (lastLive[k] === html) continue;
        lastLive[k] = html;
        const el = sheet.querySelector(`[data-live="${k}"]`);
        if (el) el.innerHTML = html;
      }
      sheet.querySelectorAll('[data-act^="speed"]').forEach((b) => b.classList.toggle('on', Number(b.dataset.act.slice(5)) === speed));
    }

    for (const [id, el] of Object.entries(labels)) {
      const a = st.agents[id];
      const [x, y] = scene.agentHead(id);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      let txt = id === 'player' ? '' : a.name;
      if (id === 'npc') txt += ` ${face(a.mood)}`;
      if (a.asleep) txt += ' 💤';
      else if (id === 'dog' && a.waitingAtDoor) txt += ' 🚪';
      else if (a.task && a.task.name === 'talk') txt += ' 💬';
      el.textContent = txt.trim();
      el.hidden = !el.textContent;
    }

    // Perception only: low mood drains colour from the view, it never slows you down.
    const sat = 0.35 + 0.65 * Math.min(1, p.mood / 60);
    $('#view').style.filter = sat < 0.999 ? `saturate(${sat.toFixed(2)})` : '';
  }

  return { update, toggle, isOpen: () => open };
}
