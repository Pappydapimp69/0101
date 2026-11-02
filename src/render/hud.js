import { ROOM_BY_ID, roomAt } from '../sim/map.js?v=c68f1a6';
import { dayOf, hourOf } from '../sim/state.js?v=c68f1a6';
import { timeScale } from '../sim/sim.js?v=c68f1a6';

const $ = (sel) => document.querySelector(sel);
const NEEDS_H = [['hunger', 'Hunger'], ['thirst', 'Thirst'], ['bladder', 'Bladder'], ['social', 'Social'], ['energy', 'Energy']];
const NEEDS_D = [['hunger', 'Hunger'], ['thirst', 'Thirst'], ['potty', 'Potty'], ['play', 'Play'], ['energy', 'Energy']];
const ROOM_ORDER = ['kitchen', 'laundry', 'living', 'garage', 'bedroom3', 'hallway', 'bedroom1', 'bathroom', 'masterBath', 'masterBed'];

const face = (m) => (m >= 75 ? '😄' : m >= 55 ? '🙂' : m >= 40 ? '😐' : m >= 25 ? '🙁' : '😫');
const color = (v) => (v >= 60 ? 'var(--good)' : v >= 30 ? 'var(--warn)' : 'var(--bad)');

function clockText(st) {
  const h = hourOf(st);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const h12 = ((hh + 11) % 12) + 1;
  return `Day ${dayOf(st)} · ${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

function bars(el, defs, needs) {
  if (!el.dataset.built) {
    el.innerHTML = defs.map(([k, label]) => `<div class="need"><span>${label}</span><div class="bar"><i data-k="${k}"></i></div></div>`).join('');
    el.dataset.built = '1';
  }
  for (const [k] of defs) {
    const i = el.querySelector(`i[data-k="${k}"]`);
    const v = needs[k];
    i.style.width = `${v}%`;
    i.style.background = color(v);
  }
}

export function createHud() {
  const roomsEl = $('#rooms');
  roomsEl.innerHTML = ROOM_ORDER.map((id) => `<div class="room" data-id="${id}"><span>${ROOM_BY_ID[id].name}</span><div class="bar"><i></i></div><b></b></div>`).join('');
  const labels = {};
  for (const id of ['player', 'npc', 'dog']) {
    const d = document.createElement('div');
    d.className = `label label-${id}`;
    $('#labels').appendChild(d);
    labels[id] = d;
  }
  let lastLog = -1;

  function update(st, scene, speed) {
    const p = st.agents.player;
    const npc = st.agents.npc;
    const dog = st.agents.dog;
    $('#clock').textContent = clockText(st);
    const ts = timeScale(st);
    $('#scale').textContent = ts > 1 ? (p.asleep ? `💤 ×${ts}` : `⏩ ×${ts}`) : '';
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === speed));

    $('#p-mood').textContent = face(p.mood);
    $('#p-moodbar').style.width = `${p.mood}%`;
    $('#p-moodbar').style.background = color(p.mood);
    bars($('#p-needs'), NEEDS_H, p.needs);
    $('#p-doing').textContent = p.task ? p.task.label : 'Idle';
    $('#p-stop').hidden = !p.task;
    $('#p-phone').textContent = p.task && p.task.name === 'phone' ? '📱 Put phone away' : '📱 Phone';
    const c = p.carrying;
    $('#p-hold').textContent = c ? (c.kind === 'tool' ? st.tools[c.id].name : c.kind === 'dishes' ? `${c.n} dirty dish${c.n > 1 ? 'es' : ''}` : 'Food') : 'Nothing';
    $('#p-drop').hidden = !c || c.kind === 'meal';

    $('#n-mood').textContent = face(npc.mood);
    $('#n-moodbar').style.width = `${npc.mood}%`;
    $('#n-moodbar').style.background = color(npc.mood);
    $('#n-doing').textContent = npc.asleep ? 'Sleeping' : npc.task ? npc.task.label : 'Idle';
    $('#n-grudge').textContent = npc.grudge > 25 ? 'Fed up with you' : npc.grudge > 8 ? 'A bit annoyed with you' : '';

    bars($('#d-needs'), NEEDS_D, dog.needs);
    $('#d-doing').textContent = dog.waitingAtDoor ? '🚪 Waiting at the back door!' : dog.task ? dog.task.label : 'Idle';
    $('#d-bowls').textContent = `Food bowl ${Math.round(st.bowls.food)}% · Water bowl ${Math.round(st.bowls.water)}% · Back door ${st.backDoorOpen ? 'open' : 'closed'}`;

    const here = roomAt(p.c, p.r);
    roomsEl.querySelectorAll('.room').forEach((row) => {
      const v = st.rooms[row.dataset.id].clean;
      const i = row.querySelector('i');
      i.style.width = `${v}%`;
      i.style.background = color(v);
      row.querySelector('b').textContent = Math.round(v);
      row.classList.toggle('here', row.dataset.id === here);
    });

    const last = st.log.length ? st.log[st.log.length - 1] : null;
    const sig = last ? `${last.t}:${st.log.length}:${last.msg}` : '';
    if (sig !== lastLog) {
      lastLog = sig;
      $('#log').innerHTML = st.log.slice(-7).reverse().map((e) => {
        const h = Math.floor((e.t % 86400) / 3600);
        const m = Math.floor((e.t % 3600) / 60);
        return `<div><time>${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}</time> ${e.msg}</div>`;
      }).join('');
    }

    // Labels over heads
    for (const [id, el] of Object.entries(labels)) {
      const a = st.agents[id];
      const [x, y] = scene.agentHead(id);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      let txt = a.name;
      if (id === 'npc') txt += ` ${face(a.mood)}`;
      if (a.asleep) txt += ' 💤';
      else if (id === 'dog' && a.waitingAtDoor) txt += ' 🚪';
      else if (a.task && a.task.name === 'talk') txt += ' 💬';
      el.textContent = txt;
    }

    // Perception only: low mood drains colour from the view, it never slows you down.
    const sat = 0.35 + 0.65 * Math.min(1, p.mood / 60);
    $('#view').style.filter = sat < 0.999 ? `saturate(${sat.toFixed(2)})` : '';
  }

  return { update };
}
