// How much cleaning does the house need? Real sim, 3 days x 3 seeds with nobody cleaning; per-room loss of
// dust-cleanliness and gain of grime per day, and the cleaning minutes a day it would take to undo it.
// PREDICTION (written before the first run): most rooms lose 20-40 points a day; keeping the rooms people use
// above 70 costs under 60 game minutes of cleaning a day (broom/vacuum lift ~40 in 15 min, mop ~45 grime in 20).
const root = new URL('../src/sim/', import.meta.url).href;
const { createState, step } = await import(root + 'sim.js');
const { DAY } = await import(root + 'state.js');
const { CLEANING } = await import(root + 'tasks.js');
const { MOP, isHard } = await import(root + 'mopping.js');
const agg = {};
for (const seed of [1, 2, 3]) {
  const st = createState(seed);
  for (const r of Object.values(st.rooms)) { r.clean = 100; r.grime = 0; }
  const start = {};
  for (let i = 0; i < 3 * DAY; i++) { step(st); if (i % 3600 === 0) for (const r of Object.values(st.rooms)) { if (r.clean < 1) r.clean = 100; } }
  for (const [id, r] of Object.entries(st.rooms)) {
    (agg[id] ||= { dust: 0, grime: 0 });
    agg[id].dust += (100 - r.clean) / 3 / 3; agg[id].grime += (r.grime || 0) / 3 / 3;
  }
}
let minutes = 0;
for (const [id, a] of Object.entries(agg)) {
  const sweep = isHard(id) ? CLEANING.broom : CLEANING.vacuum;
  const m = (a.dust / sweep.gain) * sweep.minutes + (isHard(id) ? (a.grime / MOP.grimeGain) * 20 : 0);
  minutes += m;
  console.log(`${id.padEnd(10)} dust ${a.dust.toFixed(1).padStart(5)}/day  grime ${a.grime.toFixed(1).padStart(5)}/day  -> ${m.toFixed(0)} min/day to undo`);
}
console.log(`RESULT: ${minutes < 60 ? 'PASS' : 'FAIL'} whole house needs ${minutes.toFixed(0)} cleaning minutes a game day (walking between rooms not counted)`);
