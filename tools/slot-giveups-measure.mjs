// Count "in use" give-ups and arrival races on the real sim, 14 days x 3 seeds, good-player bot + Sam.
// PREDICTION: under 2 give-ups a day in total (player + Sam).
const root = new URL('../src/sim/', import.meta.url).href;
const tasks = await import(root + 'tasks.js');
const { createState, step, command } = await import(root + 'sim.js');
const { HOUR, DAY } = await import(root + 'state.js');
const { activeAlert } = await import(root + 'alerts.js');
const res = [];
for (const seed of [1, 2, 3]) {
  const st = createState(seed);
  const p = st.agents.player;
  let inUse = 0, races = 0;
  const byObj = {};
  for (let i = 0; i < 14 * DAY; i++) {
    if (st.time % DAY === 8 * HOUR) { for (const r of Object.values(st.rooms)) { r.clean = 90; r.grime = 0; } st.messes = []; st.dishes = []; }
    if (st.time % 60 === 0 && !p.asleep && !p.task) {
      const n = p.needs;
      const c = n.bladder < 50 ? { type: 'toilet', obj: 'toiletW' } : n.thirst < 50 ? { type: 'drinkSink', obj: 'sinkK' } : n.hunger < 50 ? { type: 'cook' } : (st.time % DAY) >= 22.5 * HOUR ? { type: 'sleep', obj: 'bedP' } : null;
      if (c) command(st, c);
    }
    const before = {};
    for (const a of Object.values(st.agents)) before[a.id] = a.task && a.task.steps[a.task.i] && a.task.steps[a.task.i].obj ? { t: a.task, phase: a.task.phase, obj: a.task.steps[a.task.i].obj } : null;
    const logN = st.log.length, last = st.log[st.log.length - 1];
    step(st);
    for (const a of Object.values(st.agents)) {
      const b = before[a.id];
      if (!b) continue;
      if (b.phase === 'move' && a.task === b.t && a.task.phase === 'start') { races++; byObj[b.obj] = (byObj[b.obj] || 0) + 1; }
      if (a.task !== b.t && b.phase !== 'act' && !a.task) { inUse++; byObj[b.obj + ':gaveup'] = (byObj[b.obj + ':gaveup'] || 0) + 1; }
    }
  }
  const fc = st.failCounts || {};
  const sum = (re) => Object.entries(fc).filter(([k]) => re.test(k)).reduce((x, [, v]) => x + v, 0);
  res.push({ seed, toiletInUse: sum(/Toilet is in use/), sinkFridgeInUse: sum(/(Sink|Fridge) is in use/), stoveRefusals: sum(/Stove is in use/), cantReachDog: sum(/reach Biscuit/), races });
}
for (const r of res) console.log(JSON.stringify(r));
console.log(`RESULT: ${res.every((r) => r.toiletInUse === 0 && r.sinkFridgeInUse === 0 && r.cantReachDog <= 1) ? 'PASS' : 'FAIL'} toilet in-use ${res.map((r) => r.toiletInUse).join('/')}, can't reach dog ${res.map((r) => r.cantReachDog).join('/')}, stove refusals (bot retries each minute) ${res.map((r) => r.stoveRefusals).join('/')}`);
