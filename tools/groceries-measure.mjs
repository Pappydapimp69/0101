// Groceries measured on the real sim (28 days, seeds 1-3).
// Bot player: snacks (or cooks) when hunger < 35, keeps the house clean each morning.
//   NEVER: never orders (Sam has to restock).   WEEKLY: orders 14 portions every Monday 09:00.
// PREDICTION (written before the first run):
//   P1 NEVER: Sam restocks every 2-3 days (9-14 orders in 28 days).
//   P2 NEVER: the player is hungry (< 35) with an empty fridge under 5% of hungry minutes.
//   P3 WEEKLY: under 10% of delivered portions spoil.
//   P4 Sam's lowest hunger is no more than 5 points below the same run without groceries (baseline
//      measured with GROCERIES=off, where the fridge never empties).
// Run 1 note: counting from the log missed events once the 60-line log was full; counts now come from
// the state (new delivery entries, fridge size jumps).
const root = new URL('../src/sim/', import.meta.url).href;
const { createState, step, command } = await import(root + 'sim.js');
const { HOUR, DAY } = await import(root + 'state.js');
const off = process.argv[2] === 'off';

function run(seed, policy) {
  const st = createState(seed);
  const p = st.agents.player, n = st.agents.npc;
  let hungryMin = 0, hungryEmpty = 0, samOrders = 0, delivered = 0, minSamHunger = 100;
  let prevFridge = st.fridge.length;
  for (let i = 0; i < 28 * DAY; i++) {
    if (off && st.fridge) { while (st.fridge.length < 10) st.fridge.push(st.time + 7 * DAY); }
    if (st.time % DAY === 8 * HOUR) { for (const r of Object.values(st.rooms)) { r.clean = 90; r.grime = 0; } st.messes = []; st.dishes = []; }
    if (policy === 'weekly' && st.time % (7 * DAY) === 9 * HOUR) command(st, { type: 'orderGroceries' });
    if (st.time % 60 === 0) {
      if (p.needs.hunger < 35) {
        hungryMin++;
        if (!st.fridge.length) hungryEmpty++;
        if (!p.task) command(st, { type: st.fridge.length >= 2 ? 'cook' : 'snack' });
      }
      minSamHunger = Math.min(minSamHunger, n.needs.hunger);
    }
    const pending = st.deliveries.length;
    step(st);
    if (st.deliveries.length > pending && st.deliveries[st.deliveries.length - 1].who === 'npc') samOrders++;
    if (st.fridge.length > prevFridge && st.deliveries.length < pending) delivered += st.fridge.length - prevFridge;
    prevFridge = st.fridge.length;
  }
  return { seed, policy, samOrders, noFoodShare: hungryMin ? hungryEmpty / hungryMin : 0, spoiled: st.spoiled || 0, delivered, spoilShare: delivered ? (st.spoiled || 0) / delivered : 0, minSamHunger: Math.round(minSamHunger) };
}

const out = [];
for (const seed of [1, 2, 3]) for (const policy of ['never', 'weekly']) out.push(run(seed, policy));
for (const r of out) console.log(JSON.stringify(r));
if (!off) {
  const never = out.filter((r) => r.policy === 'never');
  const weekly = out.filter((r) => r.policy === 'weekly');
  const P1 = never.every((r) => r.samOrders >= 9 && r.samOrders <= 14);
  const P2 = never.every((r) => r.noFoodShare < 0.05);
  const P3 = weekly.every((r) => r.spoilShare < 0.10);
  console.log(`P1 ${P1}  P2 ${P2}  P3 ${P3}  (P4: compare minSamHunger with the 'off' run)`);
  console.log(`RESULT: ${P1 && P2 && P3 ? 'PASS' : 'FAIL'} Sam orders ${never.map((r) => r.samOrders).join('/')}; no-food share ${never.map((r) => (100 * r.noFoodShare).toFixed(1) + '%').join('/')}; weekly spoilage ${weekly.map((r) => (100 * r.spoilShare).toFixed(0) + '%').join('/')}; Sam min hunger ${out.map((r) => r.minSamHunger).join('/')}`);
}
