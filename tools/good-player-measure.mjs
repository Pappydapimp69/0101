// Does a player who plays WELL stay out of the invisible fail state (satisfaction under 60 greys the
// world)? Measured on the real sim, 14 days, seeds 1-3.
// Bot "good player" (acts whenever idle and awake): toilet / drink / eat when under 50%; chats with Sam
// (or the phone) when social is under 50%; sleeps at 22:30; works at the computer 09:00-13:00 and pays
// bills; orders groceries before the fridge runs out; does the laundry; the house is kept clean each
// morning (idealized, stated).
// PREDICTION (written before the first run): mean mood (days 3-14) >= 60 and satisfaction stays >= 60
// from day 3 on (0% of the time grey) on every seed.
// Run 1 result: FAIL: mean mood 48-54, satisfaction 49-56, grey 100% of the time. Components: needs
// score ~57 (x0.6), room environment ~45 (x0.4; rooms dirty between morning cleans). The grey line
// (60) was a guess never measured against good play. Run 2: line moved to 40 (bottom 10). Prediction:
// good player grey 0% on every seed; an ALERT-LINE player (acts only on red alerts) mean despair >= 0.5.
const root = new URL('../src/sim/', import.meta.url).href;
const { createState, step, command } = await import(root + 'sim.js');
const { HOUR, DAY, roomOf } = await import(root + 'state.js');
const { OBJECTS } = await import(root + 'map.js');
const { washerReady, dryerReady } = await import(root + 'laundry.js');
const { fridgeCount, onTheWay } = await import(root + 'groceries.js');
const { unpaid, overdueBills, ECON } = await import(root + 'economy.js');
const { effectiveClean } = await import(root + 'mopping.js');
const { CLUTTER } = await import(root + 'clutter.js');
const { clamp } = await import(root + 'state.js');
const { despair } = await import(root + 'satisfaction.js');
const { activeAlert } = await import(root + 'alerts.js');

const toilets = OBJECTS.filter((o) => o.type === 'toilet').map((o) => o.id);
const sinks = OBJECTS.filter((o) => o.type === 'sink').map((o) => o.id);

function decide(st) {
  const p = st.agents.player, n = p.needs, npc = st.agents.npc;
  const m = st.time % DAY;
  if (n.bladder < 50) return { type: 'toilet', obj: toilets[0] };
  if (n.thirst < 50) return { type: 'drinkSink', obj: sinks[0] };
  if (n.hunger < 50) return fridgeCount(st) >= 2 ? { type: 'cook' } : fridgeCount(st) ? { type: 'snack' } : null;
  if (m >= 22 * HOUR + 30 * 60 || n.energy < 20) return { type: 'sleep', obj: 'bedP' };
  if (fridgeCount(st) + onTheWay(st) < 6) return { type: 'orderGroceries' };
  if (unpaid(st).length && st.money > 0) return { type: 'payBills' };
  const L = st.laundry;
  if (dryerReady(st)) return { type: 'laundryFold' };
  if (washerReady(st) && !L.dryer) return { type: 'laundryMove' };
  if (!L.washer && L.dirty >= 5) return { type: 'laundryWash' };
  if (n.social < 50) return !npc.away && !npc.asleep ? { type: 'talk' } : { type: 'phone' };
  if (m >= 9 * HOUR && m < 13 * HOUR) return { type: 'work' };
  return null;
}

function run(seed, policy = 'good') {
  const st = createState(seed);
  const p = st.agents.player;
  let moodSum = 0, n = 0, grey = 0, minSat = 100, despairSum = 0;
  const comp = { needs: 0, env: 0, bumps: 0, late: 0, clutter: 0 };
  const bumpWhy = {};
  for (let i = 0; i < 14 * DAY; i++) {
    if (st.time % DAY === 8 * HOUR) { for (const r of Object.values(st.rooms)) { r.clean = 90; r.grime = 0; } st.messes = []; st.dishes = []; st.detergent = 10; }
    if (st.time % 60 === 0 && !p.asleep) {
      const work = p.task && p.task.name === 'work' && (st.time % DAY) >= 13 * HOUR;
      if (work) command(st, { type: 'stop' });
      if (policy === 'alert') { if (!p.task) { const al = activeAlert(st); if (al && al.cmd) command(st, al.cmd); else if ((st.time % DAY) >= 22 * HOUR + 30 * 60) command(st, { type: 'sleep', obj: 'bedP' }); } }
      else if (!p.task || (p.task.low && decide(st) && decide(st).type !== 'work')) { const c = decide(st); if (c) command(st, c); }
      if (p.task && ['phone', 'computer'].includes(p.task.name) && p.needs.social > 90) command(st, { type: 'stop' });
    }
    step(st);
    if (i > 3 * DAY && i % 600 === 0) {
      const vals = Object.values(p.needs); let score = vals.reduce((a, v) => a + v, 0) / vals.length; for (const v of vals) score -= Math.max(0, 30 - v) * 0.8;
      const room = roomOf(p); const env = st.rooms[room] ? effectiveClean(st, room) : 85;
      comp.needs += 0.6 * clamp(score); comp.env += 0.4 * env - (env < 30 ? 10 : 0);
      for (const b of p.bumps) { comp.bumps += b.amount; bumpWhy[b.why] = (bumpWhy[b.why] || 0) + b.amount; }
      if (overdueBills(st).length) comp.late += ECON.lateMood;
      if (st.clutter && st.clutter[room]) comp.clutter += st.clutter[room].units * CLUTTER.moodPerUnit;
      moodSum += p.mood; n++; if (despair(st) > 0) grey++; despairSum += despair(st); minSat = Math.min(minSat, st.satisfaction); }
  }
  for (const k in comp) comp[k] = +(comp[k] / n).toFixed(1);
  for (const k in bumpWhy) bumpWhy[k] = +(bumpWhy[k] / n).toFixed(1);
  return { policy, meanDespair: +(despairSum / n).toFixed(2), comp, bumpWhy, seed, meanMood: +(moodSum / n).toFixed(1), satisfaction: +st.satisfaction.toFixed(1), minSat: +minSat.toFixed(1), greyShare: +(grey / n).toFixed(3), money: Math.round(st.money), needs: Object.fromEntries(Object.entries(p.needs).map(([k, v]) => [k, Math.round(v)])) };
}

const out = [1, 2, 3].map((s) => run(s));
const alertline = [1, 2, 3].map((s) => run(s, 'alert'));
for (const r of [...out, ...alertline]) console.log(JSON.stringify({ policy: r.policy, seed: r.seed, meanMood: r.meanMood, minSat: r.minSat, grey: r.greyShare, meanDespair: r.meanDespair }));
const ok = out.every((r) => r.greyShare === 0) && alertline.every((r) => r.meanDespair >= 0.5);
console.log(`RESULT: ${ok ? 'PASS' : 'FAIL'} good player min satisfaction ${out.map((r) => r.minSat).join('/')}, grey ${out.map((r) => (100 * r.greyShare).toFixed(0) + '%').join('/')}; alert-line player mean despair ${alertline.map((r) => r.meanDespair).join('/')}`);
