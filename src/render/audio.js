// Sound, synthesized at runtime (no audio files). Built from Brain:
// - T14 lean: synth sound behind one sfx(kind) seam, so authored audio can replace a kind later.
// - sound-engine#E7: sound is driven by sim EVENTS read from state, and its variation comes from its own
//   cosmetic RNG; nothing here writes to the sim or draws from st.rng (replays stay identical).
// - dog#E6: frequent one-shots need a per-kind cooldown, a concurrent-voice cap, and every node chain
//   disconnected when it ends.
// - dog#E57: crossfade uncorrelated layers (day / night ambience) with equal-power gains.
// The fail state is expressive here too: as satisfaction falls the mix is muffled and quieter.
// The pure parts (soundEvents, loopLevels, Limiter) run in node for tests and tools/audio-measure.mjs.
import { despair } from '../sim/satisfaction.js?v=d692a33';
import { roomOf } from '../sim/state.js?v=d692a33';

export const AUDIO = {
  voices: 12, // concurrent one-shots
  perFrame: 3, // one-shots started in one frame (fast-forward bunches events)
  cooldown: { blip: 0.09, bark: 1.6, flush: 2.5, door: 0.4, alert: 1.2, car: 4, doorbell: 4, clink: 0.6, chirp: 0.5 }, // real seconds
  dur: { blip: 0.25, bark: 0.45, flush: 1.6, door: 0.3, alert: 0.5, car: 3, doorbell: 1.8, clink: 0.3, chirp: 0.25 },
  hearTiles: 14, // loops fade to nothing this far from you
  storageKey: '0101:sound',
};

const LOOP_OF = { wash: 'water', rinse: 'water', fill: 'water', fillBucket: 'water', cook: 'sizzle', tv: 'tv', host: 'tv', visit: 'tv' };

// What happened between two snapshots: [{ kind, who?, x?, z? }]. Pure: reads st only.
export function snapshot(st) {
  const tasks = {};
  for (const [id, a] of Object.entries(st.agents)) tasks[id] = a.away ? null : a.task ? a.task.name : null;
  return {
    logLast: st.log.length ? st.log[st.log.length - 1] : null,
    bubbles: new Set((st.bubbles || []).map((b) => `${b.who}:${b.from}`)),
    tasks,
    door: !!st.backDoorOpen,
    alert: st.alertEvent || 0,
    npcAway: !!st.agents.npc.away,
    guestAway: st.agents.guest ? !!st.agents.guest.away : true,
  };
}

export function soundEvents(prev, st) {
  const next = snapshot(st);
  const ev = [];
  if (!prev) return { events: ev, next };
  const at = (id) => { const a = st.agents[id]; return a ? { x: a.x, z: a.z } : {}; };
  for (const b of st.bubbles || []) if (!prev.bubbles.has(`${b.who}:${b.from}`)) ev.push({ kind: 'blip', who: b.who, ...at(b.who) });
  for (const [id, cur] of Object.entries(next.tasks)) {
    const was = prev.tasks[id];
    if (cur === was) continue;
    if (was === 'toilet' && id !== 'dog') ev.push({ kind: 'flush', ...at(id) });
    if (id === 'dog' && (cur === 'attention' || cur === 'potty' || cur === 'beg' || cur === 'waitOut')) ev.push({ kind: 'bark', ...at('dog') });
  }
  if (next.door !== prev.door) ev.push({ kind: 'door', x: 22.5, z: 9.5 });
  if (next.alert !== prev.alert) ev.push({ kind: 'alert' });
  if (next.npcAway !== prev.npcAway) ev.push({ kind: 'car', x: 40, z: 6 });
  if (prev.guestAway && !next.guestAway) ev.push({ kind: 'doorbell' });
  // new log lines since the last one we saw (the log is capped, so find it by identity)
  const i = prev.logLast ? st.log.lastIndexOf(prev.logLast) : -1;
  for (const e of st.log.slice(i + 1)) {
    if (/^Washed \d/.test(e.msg)) ev.push({ kind: 'clink', ...at(e.who || 'player') });
    else if (/Groceries arrived/.test(e.msg)) ev.push({ kind: 'doorbell' });
  }
  return { events: ev, next };
}

// Continuous sounds from what people are doing, as gains 0-1 by distance to you. Pure.
export function loopLevels(st) {
  const p = st.agents.player;
  const out = { vacuum: 0, sweep: 0, water: 0, sizzle: 0, tv: 0, hum: 0 };
  const near = (x, z, room) => {
    const d = Math.hypot(x - p.x, z - p.z);
    const g = Math.max(0, 1 - Math.max(0, d - 3) / (AUDIO.hearTiles - 3));
    return room && room === roomOf(p) ? g : g * 0.45; // walls between you and it
  };
  for (const a of Object.values(st.agents)) {
    if (a.away || !a.task) continue;
    let k = LOOP_OF[a.task.name];
    if (a.task.name === 'clean') k = /^Vacuum/.test(a.task.label) ? 'vacuum' : 'sweep';
    if (!k || (a.path && a.path.length)) continue; // walking there, not doing it yet
    out[k] = Math.max(out[k], near(a.x, a.z, roomOf(a)));
  }
  const L = st.laundry;
  if (L && (L.washer || L.dryer)) out.hum = near(34.5, 3.5, 'laundry');
  return out;
}

// Cooldown per kind + concurrent-voice cap + per-frame cap. now() in real seconds.
export class Limiter {
  constructor() { this.last = {}; this.ends = []; }
  admit(kind, now, startedThisFrame) {
    this.ends = this.ends.filter((t) => t > now);
    if (startedThisFrame >= AUDIO.perFrame || this.ends.length >= AUDIO.voices) return false;
    if (now - (this.last[kind] ?? -Infinity) < (AUDIO.cooldown[kind] ?? 0.2)) return false;
    this.last[kind] = now;
    this.ends.push(now + (AUDIO.dur[kind] ?? 0.5));
    return true;
  }
  get active() { return this.ends.length; }
}

// ---------------------------------------------------------------- browser synth
export function createAudio() {
  let ac = null, master, tone, noiseBuf, loops = {}, amb = null, prev = null;
  let muted = false;
  try { muted = localStorage.getItem(AUDIO.storageKey) === 'off'; } catch { /* storage blocked */ }
  const lim = new Limiter();
  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); // cosmetic RNG
  let chirpAt = 0;

  function ensure() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.6;
    tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 16000;
    tone.connect(master).connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    return true;
  }
  const noise = () => { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; };
  const env = (g, t, a, peak, hold, rel) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel); return t + a + hold + rel; };
  // one-shot: build a chain into `out`, start sources, disconnect everything when the last one ends
  function shot(build, pan = 0) {
    const out = ac.createGain();
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-0.8, Math.min(0.8, pan)); out.connect(p).connect(tone); } else out.connect(tone);
    const nodes = [out, p].filter(Boolean);
    const srcs = build(out, ac.currentTime, nodes);
    const lastSrc = srcs[srcs.length - 1];
    lastSrc.onended = () => { for (const n of [...nodes, ...srcs]) { try { n.disconnect(); } catch { /* gone */ } } };
  }
  const osc = (type, f) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; return o; };

  const SFX = {
    blip(out, t, nodes, ev) {
      const base = ev.who === 'npc' ? 300 : ev.who === 'guest' ? 360 : 430;
      const srcs = [];
      for (let i = 0; i < 3; i++) {
        const o = osc('triangle', base * (0.9 + rnd() * 0.35)); const g = ac.createGain();
        const t0 = t + i * 0.07; o.connect(g).connect(out); nodes.push(g);
        o.start(t0); o.stop(env(g, t0, 0.008, 0.07, 0.02, 0.04) + 0.01); srcs.push(o);
      }
      return srcs;
    },
    bark(out, t, nodes) {
      const srcs = [];
      for (let i = 0; i < 2; i++) {
        const t0 = t + i * 0.2;
        const o = osc('sawtooth', 420); o.frequency.setValueAtTime(420, t0); o.frequency.exponentialRampToValueAtTime(220, t0 + 0.11);
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
        const g = ac.createGain(); o.connect(f).connect(g).connect(out); nodes.push(f, g);
        o.start(t0); o.stop(env(g, t0, 0.005, 0.22, 0.03, 0.08) + 0.01); srcs.push(o);
      }
      return srcs;
    },
    flush(out, t, nodes) {
      const s = noise(); const f = ac.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(250, t + 1.4);
      const g = ac.createGain(); s.connect(f).connect(g).connect(out); nodes.push(f, g);
      s.start(t); s.stop(env(g, t, 0.08, 0.16, 0.5, 0.9)); return [s];
    },
    door(out, t, nodes) {
      const o = osc('sine', 110); o.frequency.exponentialRampToValueAtTime(55, t + 0.15);
      const g = ac.createGain(); o.connect(g).connect(out); nodes.push(g);
      o.start(t); o.stop(env(g, t, 0.004, 0.3, 0, 0.2)); return [o];
    },
    alert(out, t, nodes) {
      return [880, 660].map((f, i) => { const o = osc('sine', f); const g = ac.createGain(); o.connect(g).connect(out); nodes.push(g); const t0 = t + i * 0.17; o.start(t0); o.stop(env(g, t0, 0.01, 0.14, 0.05, 0.12)); return o; });
    },
    car(out, t, nodes) {
      const o = osc('sawtooth', 48); o.frequency.linearRampToValueAtTime(75, t + 1.2); o.frequency.linearRampToValueAtTime(60, t + 2.8);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
      const g = ac.createGain(); o.connect(f).connect(g).connect(out); nodes.push(f, g);
      o.start(t); o.stop(env(g, t, 0.6, 0.14, 1.2, 1.1)); return [o];
    },
    doorbell(out, t, nodes) {
      return [659, 523].map((f, i) => { const o = osc('sine', f); const g = ac.createGain(); o.connect(g).connect(out); nodes.push(g); const t0 = t + i * 0.45; o.start(t0); o.stop(env(g, t0, 0.005, 0.16, 0, 1.1)); return o; });
    },
    clink(out, t, nodes) {
      return [2400, 3150].map((f) => { const o = osc('sine', f * (0.97 + rnd() * 0.06)); const g = ac.createGain(); o.connect(g).connect(out); nodes.push(g); o.start(t); o.stop(env(g, t, 0.002, 0.05, 0, 0.22)); return o; });
    },
    chirp(out, t, nodes) {
      const f0 = 2600 + rnd() * 1200; const o = osc('sine', f0); o.frequency.exponentialRampToValueAtTime(f0 * 1.35, t + 0.09);
      const g = ac.createGain(); o.connect(g).connect(out); nodes.push(g);
      o.start(t); o.stop(env(g, t, 0.01, 0.025, 0.03, 0.06)); return [o];
    },
  };

  // Loops: built once, gains ramped. Each is noise or tone through a filter, sometimes with an LFO.
  function makeLoop(kind) {
    const g = ac.createGain(); g.gain.value = 0; g.connect(tone);
    const add = (src, type, f, q = 0.7) => { const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; src.connect(fl).connect(g); src.start(); };
    const lfo = (rate, depth, param) => { const l = osc('sine', rate); const d = ac.createGain(); d.gain.value = depth; l.connect(d).connect(param); l.start(); };
    const peak = { vacuum: 0.05, sweep: 0.05, water: 0.06, sizzle: 0.035, tv: 0.035, hum: 0.04 }[kind];
    if (kind === 'vacuum') { add(osc('sawtooth', 118), 'lowpass', 700); add(noise(), 'bandpass', 2200, 0.8); }
    if (kind === 'sweep') { const am = ac.createGain(); am.gain.value = 0.5; am.connect(g); const s = noise(); const fl = ac.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = 2500; s.connect(fl).connect(am); s.start(); lfo(1.8, 0.5, am.gain); }
    if (kind === 'water') { add(noise(), 'bandpass', 1300, 0.6); }
    if (kind === 'sizzle') { add(noise(), 'highpass', 4500); }
    if (kind === 'tv') { const am = ac.createGain(); am.gain.value = 0.6; am.connect(g); const s = noise(); const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 700; fl.Q.value = 1.5; s.connect(fl).connect(am); s.start(); lfo(3.1, 0.4, am.gain); }
    if (kind === 'hum') { add(osc('sine', 58), 'lowpass', 400); add(osc('sine', 117), 'lowpass', 400); }
    return { g, peak };
  }
  function makeAmbience() {
    const day = ac.createGain(); const night = ac.createGain(); day.gain.value = 0; night.gain.value = 0;
    day.connect(tone); night.connect(tone);
    const air = noise(); const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 350; air.connect(fl).connect(day); air.start();
    // crickets: a high tone gated on and off
    const c = osc('sine', 4600); const gate = ac.createGain(); gate.gain.value = 0; c.connect(gate).connect(night); c.start();
    const pulse = osc('square', 28); const pd = ac.createGain(); pd.gain.value = 0.5; pulse.connect(pd).connect(gate.gain); pulse.start();
    const slow = osc('sine', 0.7); const sd = ac.createGain(); sd.gain.value = 0.5; slow.connect(sd).connect(gate.gain); slow.start();
    return { day, night };
  }

  function update(st, dt, { fast = false } = {}) {
    const { events, next } = soundEvents(prev, st);
    prev = next;
    if (!ac || ac.state !== 'running') return;
    const now = ac.currentTime;
    const p = st.agents.player;
    const d = despair(st);
    // fail state: muffled and quieter as it deepens
    tone.frequency.setTargetAtTime(16000 * Math.pow(700 / 16000, d), now, 0.5);
    const dim = (1 - 0.55 * d) * (p.asleep ? 0.35 : 1);
    let started = 0;
    for (const e of events) {
      if (e.x !== undefined && Math.hypot(e.x - p.x, e.z - p.z) > AUDIO.hearTiles * 1.6) continue; // too far to hear
      if (!lim.admit(e.kind, now, started)) continue;
      started++;
      const pan = e.x !== undefined ? (e.x - p.x) / 12 : 0;
      shot((out, t, nodes) => { out.gain.value = dim; return SFX[e.kind](out, t, nodes, e); }, pan);
    }
    const lv = loopLevels(st);
    for (const [k, v] of Object.entries(lv)) {
      if (!loops[k] && v > 0) loops[k] = makeLoop(k);
      if (loops[k]) loops[k].g.gain.setTargetAtTime(v * loops[k].peak * dim * (fast ? 0.4 : 1), now, 0.15);
    }
    // day / night ambience, equal-power crossfade around dawn (6-7) and dusk (19.5-21)
    if (!amb) amb = makeAmbience();
    const h = (st.time % 86400) / 3600;
    const dayness = h < 6 || h > 21 ? 0 : h < 7 ? h - 6 : h > 19.5 ? (21 - h) / 1.5 : 1;
    amb.day.gain.setTargetAtTime(0.03 * Math.sin((dayness * Math.PI) / 2) * dim, now, 1);
    amb.night.gain.setTargetAtTime(0.012 * Math.cos((dayness * Math.PI) / 2) * dim, now, 1);
    if (dayness > 0.5 && !p.asleep && now > chirpAt) {
      chirpAt = now + 2 + rnd() * 6;
      if (lim.admit('chirp', now, started)) shot((out, t, nodes) => { out.gain.value = dim * 0.6; const a = SFX.chirp(out, t, nodes); const b = rnd() < 0.5 ? SFX.chirp(out, t + 0.14, nodes) : []; return [...a, ...b]; }, rnd() * 1.4 - 0.7);
    }
  }

  return {
    unlock() { if (ensure() && ac.state !== 'running') ac.resume().catch(() => {}); },
    update,
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem(AUDIO.storageKey, m ? 'off' : 'on'); } catch { /* storage blocked */ }
      if (ac) master.gain.setTargetAtTime(m ? 0 : 0.6, ac.currentTime, 0.05);
    },
    get voices() { return lim.active; },
    get state() { return ac ? ac.state : 'none'; },
  };
}
