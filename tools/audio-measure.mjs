// Sound events on the real sim, emulating 60 fps frames at each game speed (the game steps
// 3 game s per real s x speed x timeScale). The player handles alerts, sleeps at 22:30 and chats with
// Sam when free, so speech, the dog, doors, flushes and alerts all happen.
// PREDICTION (before the first run):
//   P1 at 1x the limiter drops under 10% of events (normal play keeps its sounds);
//   P2 at 4x no frame starts more than AUDIO.perFrame sounds and voices never pass AUDIO.voices;
//   P3 reading events never changes the sim: the state after 3 days is identical with and without it.
const root = new URL('../src/sim/', import.meta.url).href;
const { createState, step, command, timeScale } = await import(root + 'sim.js');
const { HOUR, DAY } = await import(root + 'state.js');
const { activeAlert } = await import(root + 'alerts.js');
const { soundEvents, Limiter, AUDIO } = await import(new URL('../src/render/audio.js', import.meta.url).href);

const strip = (st) => JSON.stringify(st, (k, v) => (typeof v === 'function' ? undefined : v instanceof Set ? [...v] : v));

function drive(st) {
  const p = st.agents.player;
  if (st.time % DAY === 22 * HOUR + 30 * 60 && !p.asleep) command(st, { type: 'sleep', obj: 'bedP' });
  if (st.time % 60 === 0 && !p.asleep && !p.task) {
    const al = activeAlert(st);
    if (al && al.cmd) command(st, al.cmd);
    else if (!st.conv && !st.agents.npc.away && st.time % (3 * HOUR) === 0) command(st, { type: 'talk' });
  }
}

function run(seed, speed, listen = true) {
  const st = createState(seed);
  const lim = new Limiter();
  let prev = null, acc = 0, real = 0;
  const raw = {}, kept = {};
  let peakVoices = 0, worstFrame = 0;
  while (st.time < 8 * HOUR + 3 * DAY) {
    real += 1 / 60;
    acc += (1 / 60) * 180 * speed * timeScale(st);
    while (acc >= 1) { drive(st); step(st); acc -= 1; }
    if (!listen) continue;
    const { events, next } = soundEvents(prev, st);
    prev = next;
    let started = 0;
    for (const e of events) {
      raw[e.kind] = (raw[e.kind] || 0) + 1;
      if (lim.admit(e.kind, real, started)) { started++; kept[e.kind] = (kept[e.kind] || 0) + 1; }
    }
    worstFrame = Math.max(worstFrame, started);
    peakVoices = Math.max(peakVoices, lim.active);
  }
  const nRaw = Object.values(raw).reduce((a, b) => a + b, 0), nKept = Object.values(kept).reduce((a, b) => a + b, 0);
  return { seed, speed, realMin: +(real / 60).toFixed(1), raw, kept, dropShare: nRaw ? +(1 - nKept / nRaw).toFixed(3) : 0, peakVoices, worstFrame, hash: strip(st).length + ':' + strip(st).slice(-200) };
}

const out = [];
for (const seed of [1, 2, 3]) for (const speed of [1, 4]) { const r = run(seed, speed); out.push(r); const { hash, ...show } = r; console.log(JSON.stringify(show)); }
const P1 = out.filter((r) => r.speed === 1).every((r) => r.dropShare < 0.1);
const P2 = out.filter((r) => r.speed === 4).every((r) => r.worstFrame <= AUDIO.perFrame && r.peakVoices <= AUDIO.voices);
const P3 = [1, 2, 3].every((s) => run(s, 1, false).hash === out.find((r) => r.seed === s && r.speed === 1).hash);
console.log(`P1 ${P1}  P2 ${P2}  P3 ${P3}`);
console.log(`RESULT: ${P1 && P2 && P3 ? 'PASS' : 'FAIL'} drop at 1x ${out.filter((r) => r.speed === 1).map((r) => (100 * r.dropShare).toFixed(1) + '%').join('/')}, at 4x ${out.filter((r) => r.speed === 4).map((r) => (100 * r.dropShare).toFixed(1) + '%').join('/')}; peak voices ${out.map((r) => r.peakVoices).join('/')}; replay identical ${P3}`);
