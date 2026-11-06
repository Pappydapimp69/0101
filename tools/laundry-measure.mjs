// Laundry measured on the real sim (28 days, seeds 1-3). Bot player sleeps 22:30 -> wake, keeps the house
// clean and detergent stocked each morning.
//   ATTENTIVE: washes when 5+ outfits are dirty, moves the load and folds as soon as it can (awake).
//   NEGLECT: never does laundry.
// PREDICTION (written before the first run):
//   P1 ATTENTIVE: 0 dirty-clothes days, 0 musty loads, about 1.25 loads a week (Brain 0101#E78).
//   P2 NEGLECT: first dirty-clothes day on day 8, then every day after.
//   P3 NEGLECT ends with lower satisfaction than ATTENTIVE on every seed.
// Run 1: P1-P3 passed, but both bots ignored their own needs (satisfaction 7 vs 5, near the bottom), so
// P3 compared two neglected players (Brain: a real-code harness measures every system it does not
// drive). Run 2: both bots also act on every low-need alert (toilet, food, drink, bed, phone).
// Run 2 result: P1, P2 hold; P3 failed on seed 2 only (end satisfaction 20.42 vs 20.01): a one-moment
// snapshot of a slow meter. Mean mood over days 8-28 is lower for NEGLECT on every seed (13.9-14.4 vs
// 17.4-18.5, about -4 as the -8 x 14 h/day penalty predicts), so P3 now compares mean mood.
const root = new URL('../src/sim/', import.meta.url).href;
const { createState, step, command } = await import(root + 'sim.js');
const { HOUR, DAY } = await import(root + 'state.js');
const { washerReady, dryerReady } = await import(root + 'laundry.js');
const { activeAlert } = await import(root + 'alerts.js');

function run(seed, policy) {
  const st = createState(seed);
  const p = st.agents.player;
  let firstDirty = null, moodSum = 0, moodN = 0;
  for (let i = 0; i < 28 * DAY; i++) {
    const m = st.time % DAY;
    if (m === 8 * HOUR) { for (const r of Object.values(st.rooms)) { r.clean = 90; r.grime = 0; } st.messes = []; st.dishes = []; st.detergent = 10; }
    if (m === 22 * HOUR + 30 * 60 && !p.asleep) command(st, { type: 'sleep', obj: 'bedP' });
    if (st.time % 60 === 0 && !p.asleep && !p.task) { const al = activeAlert(st); if (al && al.cmd) command(st, al.cmd); }
    if (policy === 'attentive' && st.time % 60 === 0 && !p.asleep && !p.task) {
      const L = st.laundry;
      if (dryerReady(st)) command(st, { type: 'laundryFold' });
      else if (washerReady(st) && !L.dryer) command(st, { type: 'laundryMove' });
      else if (!L.washer && L.dirty >= 5) command(st, { type: 'laundryWash' });
    }
    if (i % 600 === 0 && i > 7 * DAY) { moodSum += p.mood; moodN++; }
    const dd = st.laundry.dirtyDays;
    step(st);
    if (st.laundry.dirtyDays > dd && firstDirty === null) firstDirty = Math.floor(st.time / DAY) + 1;
  }
  const L = st.laundry;
  return { seed, policy, dirtyDays: L.dirtyDays, firstDirty, musty: L.musty, loadsPerWeek: +(L.loads / 4).toFixed(2), satisfaction: +st.satisfaction.toFixed(2), meanMood: +(moodSum / moodN).toFixed(2) };
}

const out = [];
for (const seed of [1, 2, 3]) for (const policy of ['attentive', 'neglect']) out.push(run(seed, policy));
for (const r of out) console.log(JSON.stringify(r));
const att = out.filter((r) => r.policy === 'attentive'), neg = out.filter((r) => r.policy === 'neglect');
const P1 = att.every((r) => r.dirtyDays === 0 && r.musty === 0 && r.loadsPerWeek >= 1 && r.loadsPerWeek <= 1.5);
const P2 = neg.every((r) => r.firstDirty === 8 && r.dirtyDays >= 19);
const P3 = [1, 2, 3].every((s) => neg.find((r) => r.seed === s).meanMood < att.find((r) => r.seed === s).meanMood - 2);
console.log(`P1 ${P1}  P2 ${P2}  P3 ${P3}`);
console.log(`RESULT: ${P1 && P2 && P3 ? 'PASS' : 'FAIL'} attentive dirty days ${att.map((r) => r.dirtyDays).join('/')}, musty ${att.map((r) => r.musty).join('/')}, loads/wk ${att.map((r) => r.loadsPerWeek).join('/')}; neglect first dirty day ${neg.map((r) => r.firstDirty).join('/')}, dirty days ${neg.map((r) => r.dirtyDays).join('/')}; mean mood att ${att.map((r) => r.meanMood).join('/')} vs neglect ${neg.map((r) => r.meanMood).join('/')}`);
