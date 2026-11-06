// Sweep the global dirt rate (TUNING.dirtScale) with the chores harness's BUDGET bot (cleans <= 60 min a
// day in the room it is in) and LAZY bot, Sam's sharing on, 14 days x 3 seeds; reports the cleanliness of
// the room each person is in (what mood reads).
// PREDICTION (written before the first run): budget player's experienced cleanliness >= 50 at 0.5x and >= 60
// at 0.35x; a lazy player still under 30 at 0.35x.
// Run 1 result: FAIL: even at 0.25x the budget bot experienced only 34-44: it never washed dishes, let the
// dog out (accidents) or cleaned messes, which all add dirt (Brain: a real-code harness measures every
// system it does not drive). Run 2: the budget bot also washes dishes, lets Biscuit out and back, and
// cleans messes (wipes in hand); scales 1 / 0.5 / 0.35. Same predictions.
const root = new URL('../src/sim/', import.meta.url).href;
const { TUNING } = await import(root + 'state.js');
process.argv[2] = process.argv[2] || '';
const scales = [1, 0.5, 0.35];
const { createState, step, command } = await import(root + 'sim.js');
const { HOUR, DAY, roomOf } = await import(root + 'state.js');
const { effectiveClean, isHard } = await import(root + 'mopping.js');
const { activeAlert } = await import(root + 'alerts.js');
const { ROOM_TILES } = await import(root + 'tasks.js');
function hold(st, id) { const p = st.agents.player; for (const t of Object.values(st.tools)) if (t.carriedBy === 'player') t.carriedBy = null; st.tools[id].carriedBy = 'player'; st.tools[id].inBucket = false; p.carrying = { kind: 'tool', id }; }
function run(seed, policy) {
  const st = createState(seed); const p = st.agents.player;
  let used = 0, day = -1, pEnv = 0, n = 0;
  for (let i = 0; i < 14 * DAY; i++) {
    if (st.time % DAY === 22 * HOUR + 30 * 60 && !p.asleep) command(st, { type: 'sleep', obj: 'bedP' });
    if (Math.floor(st.time / DAY) !== day) { day = Math.floor(st.time / DAY); used = 0; }
    if (st.time % 60 === 0 && !p.asleep && !p.task) {
      const al = activeAlert(st);
      const dog = st.agents.dog;
      if (al && al.cmd) command(st, al.cmd);
      else if (policy === 'budget' && dog.waitingAtDoor && !st.backDoorOpen) command(st, { type: 'door', open: true });
      else if (policy === 'budget' && st.backDoorOpen && roomOf(dog) !== 'yard' && !(dog.task && dog.task.name === 'potty')) command(st, { type: 'door', open: false });
      else if (policy === 'budget' && p.carrying && p.carrying.kind === 'dishes') command(st, { type: 'wash' });
      else if (policy === 'budget' && st.dishes.length) command(st, { type: 'pickDishes', room: st.dishes[0].room });
      else if (policy === 'budget' && st.messes.length) { hold(st, 'wipesK'); command(st, { type: 'cleanMess', id: st.messes[0].id }); }
      else if (policy === 'budget' && used < 60) {
        const room = roomOf(p);
        if (st.rooms[room] && effectiveClean(st, room) < 60) {
          if (isHard(room) && (st.rooms[room].grime || 0) >= 20) { const [c, r] = ROOM_TILES[room][0]; Object.assign(st.tools.bucket, { c, r, carriedBy: null, water: true, fresh: 100, rinsesLeft: 8 }); st.tools.mop.dirt = 0; hold(st, 'mop'); command(st, { type: 'cleanRoom', room, kind: 'mop' }); }
          else { hold(st, isHard(room) ? 'broom' : 'vacuum'); command(st, { type: 'cleanRoom', room, kind: isHard(room) ? 'broom' : 'vacuum' }); }
        }
      }
    }
    const was = p.task && p.task.name === 'clean' && p.task.phase === 'act';
    step(st);
    if (was) used += 1 / 60;
    if (i > 2 * DAY && i % 600 === 0 && !p.asleep && st.rooms[roomOf(p)]) { pEnv += effectiveClean(st, roomOf(p)); n++; }
  }
  return +(pEnv / n).toFixed(1);
}
const res = {};
for (const s of scales) {
  TUNING.dirtScale = s;
  res[s] = { budget: [1, 2, 3].map((seed) => run(seed, 'budget')), lazy: [1, 2, 3].map((seed) => run(seed, 'lazy')) };
  console.log(`dirtScale ${s}: budget player experiences ${res[s].budget.join('/')}, lazy ${res[s].lazy.join('/')}`);
}
const ok = res[0.5].budget.every((v) => v >= 50) && res[0.35].budget.every((v) => v >= 60) && res[0.35].lazy.every((v) => v < 30);
console.log(`RESULT: ${ok ? 'PASS' : 'FAIL'} see above`);
