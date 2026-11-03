// HUD: information minimalism. Everything is a small chip or ring; detail lives in one sheet that
// opens on demand. Rings for needs that are fine fade back; ones that need you pulse.
import { ROOM_BY_ID, roomAt } from '../sim/map.js';
import { dayOf, hourOf } from '../sim/state.js';
import { timeScale } from '../sim/sim.js';
import { createTrend, direction, eta } from '../sim/trend.js';
import { unpaid, overdueBills, ECON } from '../sim/economy.js';
import { daylight } from '../sim/daylight.js';
import { STAGES, stageOf, stageProgress } from '../sim/bond.js';
import { TOPICS, CHAT, topicUnlocked } from '../sim/chat.js';
import { describeDay, weekdayOf, weekOf, workdaysOf, WEEKDAYS } from '../sim/schedule.js';

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
  return short ? `${WEEKDAYS[weekdayOf(dayOf(st))]} ${t}` : `${WEEKDAYS[weekdayOf(dayOf(st))]} · Day ${dayOf(st)} · ${t}`;
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

  // chat wheel: 8 fixed, evenly spaced slots (clockwise from the top) around the countdown ring
  const bubbleEls = {};
  const R = 108; // slots 45° apart: at this radius neighbours clear a 66×50 button
  $('#wheel-ring').innerHTML = TOPICS.map((t, i) => {
    const ang = (i / TOPICS.length) * Math.PI * 2 - Math.PI / 2;
    return `<button data-topic="${t.id}" style="left:${145 + Math.cos(ang) * R}px;top:${145 + Math.sin(ang) * R}px"></button>`;
  }).join('');
  const wheelButtons = () => [...document.querySelectorAll('#wheel-ring button')];
  wheelButtons().forEach((b) => { b.onclick = (e) => { e.stopPropagation(); command({ type: 'topic', id: b.dataset.topic }); }; });

  let open = null; // which sheet is showing
  const sheet = $('#sheet');
  function toggle(name) {
    open = open === name ? null : name;
    sheet.hidden = !open;
    sheet.innerHTML = open ? SKELETON[open] : '';
    for (const k in lastLive) delete lastLive[k];
    sheetTick = 0;
  }
  for (const [id, name] of [['#me', 'me'], ['#sam', 'sam'], ['#dog', 'dog'], ['#rooms', 'rooms'], ['#money', 'money'], ['#morebtn', 'more']]) {
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
    else if (act === 'payall') command({ type: 'payBills' });
    else if (act.startsWith('pay:')) command({ type: 'payBills', id: Number(act.slice(4)) });
  });
  $('#pause').onclick = () => setSpeed(getSpeed() ? 0 : 1);
  $('#speed').onclick = () => setSpeed(getSpeed() >= 3 ? 1 : getSpeed() + 1);
  $('#phone').onclick = () => {
    const t = window.__game.st.agents.player.task;
    command(t && t.name === 'phone' ? { type: 'stop' } : { type: 'phone' });
  };
  $('#stop').onclick = () => command({ type: 'stop' });
  $('#drop').onclick = () => command({ type: 'putDown' });

  let curHour = 12;
  // how much slower each need drains while asleep (asleep rate / awake rate); energy refills instead
  const SLEEP_FACTOR = { hunger: 0.5, thirst: 0.5, bladder: 0.5, social: 0.25, potty: 0.5, play: 1 / 6 };
  // Trends measured in game time, so arrows mean the same thing at every speed.
  const trend = { player: createTrend(), npc: createTrend(), dog: createTrend() };
  const row = (label, v, tr, k) => {
    const r = tr.rate(k);
    const d = direction(r, v);
    const urgent = d === 'down' && v / -r < 2; // runs out within ~2 game hours
    // mood drifts toward a target, it doesn't "run out"; other needs drain slower overnight
    const when = k === 'mood' ? '' : eta(r, v, curHour, SLEEP_FACTOR[k]);
    return `<div class="row"><span>${label}</span><div><div class="bar"><i style="width:${v}%;background:${color(v)}"></i></div>${when ? `<small class="eta ${urgent ? 'down-fast' : d}">${when}</small>` : ''}</div><b>${Math.round(v)}</b><em class="t ${urgent ? 'down-fast' : d}">${ARROW[d]}</em></div>`;
  };
  const rows = (defs, needs, tr) => defs.map(([k, l, i]) => row(`${i} ${l}`, needs[k], tr, k)).join('');

  // Each sheet = a skeleton built once when it opens (buttons live here and are never replaced)
  // plus [data-live] slots whose contents refresh while it stays open.
  const close = '<button data-act="close" aria-label="Close">✕</button>';
  const SKELETON = {
    me: `<h3><span data-live="title"></span>${close}</h3><div data-live="body"></div>`,
    sam: `<h3><span data-live="title"></span>${close}</h3><div data-live="body"></div>
      <div data-live="known"></div>
      <div class="legend">You can't see what Sam needs. Watch what they do. The closer you get, the more you'll tell each other.</div>`,
    dog: `<h3><span>🐶 Biscuit</span>${close}</h3><div data-live="body"></div>`,
    rooms: `<h3><span>Cleanliness</span>${close}</h3><div data-live="body"></div>`,
    money: `<h3><span data-live="title"></span>${close}</h3><div data-live="bills"></div>
      <div class="legend">Earn money by working at the computer in Bedroom 3 (+$${ECON.wage}/h). Bills arrive every Monday at 9 AM and are due 3 days later; late bills add $${ECON.lateFee}/day and weigh on your mood. Pay online from here, any time.</div>`,
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
      case 'sam': {
        const stage = stageOf(npc.bond);
        return {
          // Everything past the bond bar is earned: each stage reveals a little more of Sam.
          title: `Sam${stage >= 5 ? ` ${face(npc.mood)}` : ''}`,
          body: `<div class="row"><span>💛 ${STAGES[stage - 1].name}</span><div class="bar"><i style="width:${stage >= 10 ? 100 : stageProgress(npc.bond) * 100}%;background:var(--accent)"></i></div><b>${stage}/10</b></div>
            <div class="kv">Doing <span>${npc.away ? '💼 At work' : npc.asleep ? 'Sleeping' : npc.task ? npc.task.label : 'Idle'}</span></div>
            ${npc.tell ? `<div class="kv">Lately <span>${npc.tell.text}</span></div>` : ''}
            ${stage >= 3 && npc.grudge > 8 ? `<div class="kv">Feeling <span style="color:var(--warn)">${npc.grudge > 25 ? 'Fed up with you' : 'A bit annoyed with you'}</span></div>` : ''}
            ${stage >= 5 ? row('Mood', npc.mood, trend.npc, 'mood') : ''}
            ${stage >= 10 ? rows(NEEDS_H, npc.needs, trend.npc) : ''}`,
          known: `${stage >= 4 ? `<h4>Works this week</h4><div class="week">${(() => {
            const work = workdaysOf(st.seed, weekOf(dayOf(st)));
            const today = weekdayOf(dayOf(st));
            return WEEKDAYS.map((d, i) => `<span class="${work.includes(i) ? 'on' : ''}${i === today ? ' today' : ''}">${d}</span>`).join('');
          })()}</div>` : ''}
            ${stage >= 8 ? `<h4>Sam's ${WEEKDAYS[weekdayOf(dayOf(st))]}</h4><div class="plan">${describeDay(st).map((b) => `<div class="${b.now ? 'now' : ''}"><time>${b.time}</time>${b.label}</div>`).join('')}</div>` : ''}
            <h4>What you've learned</h4><div class="legend" style="margin-top:0">${STAGES.slice(0, stage).map((s, i) => `${i + 1}. ${s.unlock}`).join('<br>')}${stage < 10 ? `<br><span style="opacity:.6">${stage + 1}. ???</span>` : ''}</div>`,
        };
      }
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
            const cl = st.clutter && st.clutter[id];
            return `<div class="row${id === here ? ' here' : ''}"><span>${ROOM_BY_ID[id].name}</span><div><div class="bar"><i style="width:${v}%;background:${color(v)}"></i></div>${cl ? `<small class="eta down-fast">clutter ×${cl.units} (${cl.items.map((x) => st.tools[x.id].name.toLowerCase() + (x.onFloor ? ' on the floor' : '')).join(', ')})</small>` : ''}</div><b>${Math.round(v)}</b><em></em></div>`;
          }).join(''),
        };
      }
      case 'money': {
        const list = st.bills.slice().sort((a, b) => a.due - b.due);
        const total = unpaid(st).reduce((x, b) => x + b.amount, 0);
        const dueTxt = (b) => {
          if (b.paid) return 'Paid';
          const d = (b.due - st.time) / 86400;
          if (d < 0) return `<span class="late">Overdue ${Math.ceil(-d)}d</span>`;
          return d < 1 ? `Due in ${Math.max(1, Math.round(d * 24))}h` : `Due in ${Math.ceil(d)}d`;
        };
        return {
          title: `💵 $${st.money.toFixed(2)}`,
          bills: list.length
            ? `${list.map((b) => `<div class="bill${b.paid ? ' paid' : ''}"><span>${b.icon} ${b.name}</span><b>$${b.amount.toFixed(2)}</b><small>${dueTxt(b)}</small>${b.paid ? '' : `<button data-act="pay:${b.id}" ${st.money < b.amount ? 'disabled' : ''}>Pay</button>`}</div>`).join('')}
               ${total ? `<div class="btns" style="margin-top:8px"><button data-act="payall" ${st.money < Math.min(...unpaid(st).map((b) => b.amount)) ? 'disabled' : ''}>Pay all I can ($${total.toFixed(2)} owed)</button></div>` : ''}`
            : '<div class="legend">No bills yet. The first ones arrive Monday at 9 AM.</div>',
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

  let lastSeen = null; // last log entry already queued
  const toastQueue = [];
  let toastShownAt = -1e9;
  let toastUntil = 0;
  let sheetTick = 0;

  function update(st, dtReal) {
    const p = st.agents.player;
    const npc = st.agents.npc;
    const dog = st.agents.dog;
    const narrow = window.innerWidth < 520;

    // clock & speed
    const speed = getSpeed();
    $('#clock').textContent = `${daylight(st) > 0.45 ? '☀️' : '🌙'} ${clockText(st, narrow)}`;
    // money chip: badge when bills are waiting, red when overdue
    $('#money-amt').textContent = `$${Math.floor(st.money)}`;
    const late = overdueBills(st).length;
    const waiting = unpaid(st).length;
    $('#money .badge').textContent = late ? `${late} late` : waiting ? '📬' : '';
    $('#money').classList.toggle('warn', !!late);
    const ts = timeScale(st);
    $('#scale').textContent = ts > 1 ? (p.asleep ? `💤×${ts}` : `⏩×${ts}`) : '';
    $('#pause').textContent = speed ? '⏸' : '▶';
    $('#pause').classList.toggle('on', !speed);
    $('#speed').textContent = SPEED_LABEL[Math.max(1, speed)];

    curHour = hourOf(st);
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
    // Sam's mood only shows once you can read them (stage 5); before that, just whether they're home
    const samStage = stageOf(npc.bond);
    $('#sam-face').textContent = npc.away ? '💼' : samStage >= 5 ? face(npc.mood) : '👤';
    $('#sam .badge').textContent = `💛${samStage}`;
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
    // Queue every new entry (two can land in the same step, e.g. overdue + bills arrived), and give
    // each at least 1.5 s on screen before the next replaces it.
    const now = performance.now();
    let start = lastSeen ? st.log.indexOf(lastSeen) + 1 : 0;
    if (lastSeen && start === 0) start = st.log.findIndex((e) => e.t > lastSeen.t); // it scrolled out of the log
    if (start < 0) start = st.log.length;
    for (let i = start; i < st.log.length; i++) toastQueue.push(st.log[i].msg);
    if (st.log.length) lastSeen = st.log[st.log.length - 1];
    if (toastQueue.length > 6) toastQueue.splice(0, toastQueue.length - 6);
    if (toastQueue.length && now - toastShownAt >= 1500) {
      $('#toast').textContent = toastQueue.shift();
      toastShownAt = now;
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
      if (id === 'npc' && stageOf(a.bond) >= 5) txt += ` ${face(a.mood)}`;
      if (id === 'npc' && a.tell && !a.asleep) txt += ` ${a.tell.text}`; // a tell: what you can actually see
      if (a.asleep) txt += ' 💤';
      else if (id === 'dog' && a.waitingAtDoor) txt += ' 🚪';
      else if (a.task && a.task.name === 'talk') txt += ' 💬';
      el.textContent = txt.trim();
      el.hidden = !el.textContent || a.away;
    }

    // speech bubbles: one per speaker, above their head
    for (const who of ['player', 'npc']) {
      const b = (st.bubbles || []).filter((x) => x.who === who && x.from <= st.time).sort((x, y) => y.from - x.from)[0];
      let el = bubbleEls[who];
      if (!el) { el = bubbleEls[who] = document.createElement('div'); el.className = `bubble ${who === 'player' ? 'you' : 'sam'}`; $('#bubbles').appendChild(el); }
      const a = st.agents[who];
      if (!b || a.away) { el.hidden = true; continue; }
      el.hidden = false;
      if (el.textContent !== b.text) el.textContent = b.text;
      const [x, y] = scene.agentHead(who);
      // you two stand side by side, so stack Sam's bubble above yours instead of letting them collide
      el.style.transform = `translate(${x}px, ${y - (who === 'npc' ? 64 : 26)}px) translate(-50%, -100%)`;
    }

    // chat wheel + countdown, while you're in a conversation
    const cv = st.conv;
    const inChat = !!(cv && (cv.a === 'player' || cv.b === 'player'));
    $('#wheel').hidden = !inChat;
    if (inChat) {
      const left = Math.max(0, cv.end - st.time);
      $('#wheel-timer').style.setProperty('--p', (left / (cv.end - cv.start)).toFixed(3));
      $('#wheel-time').innerHTML = `Sam<br>${Math.ceil(left / 60)} min`;
      const ready = st.time >= cv.nextTopicAt;
      wheelButtons().forEach((btn) => {
        const t = TOPICS.find((x) => x.id === btn.dataset.topic);
        const unlocked = topicUnlocked(npc, t);
        btn.classList.toggle('locked', !unlocked);
        btn.classList.toggle('picked', cv.picked.includes(t.id));
        btn.disabled = !unlocked || !ready;
        const label = unlocked ? `<span class="i">${t.icon}</span>${t.name}` : `<span class="i">🔒</span>Bond ${t.stage}`;
        if (btn.dataset.label !== label) { btn.innerHTML = label; btn.dataset.label = label; }
      });
    }

    // Perception only: low mood drains colour from the view, it never slows you down.
    const sat = 0.35 + 0.65 * Math.min(1, p.mood / 60);
    $('#view').style.filter = sat < 0.999 ? `saturate(${sat.toFixed(2)})` : '';
  }

  return { update, toggle, isOpen: () => open, wheelButtons, wheelOpen: () => !$('#wheel').hidden };
}
