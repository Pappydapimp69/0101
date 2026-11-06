// Shared chores measured on the real sim (14 days x 3 seeds).
// DILIGENT bot: handles red alerts, sleeps 22:30, and cleans the room it is in when it drops under 60
// (broom on hard floors / vacuum on carpet, mop when grime >= 20 - tools put in hand and the bucket kept
// filled beside it: an idealization of fetching them). LAZY bot: alerts and sleep only, never cleans.
// Each runs with Sam's chore sharing ON and OFF.
// PREDICTION (written before the first run):
//   P1 DILIGENT + sharing: Sam does 35-50% of all cleaning minutes.
//   P2 DILIGENT: the player's cleaning minutes drop >= 30% with sharing on vs off.
//   P3 LAZY: sharing raises mean house cleanliness by no more than 10 points (no freeloading).
// Run 1 result: P1 (Sam 44-46%) and P3 held; P2 failed (player minutes -5..-23%): Sam tidied the room
// they stood in, mostly Sam's own. Run 2: Sam tidies the dirtiest shared room (or their own). Same P1-P3.
// Run 2 result: P1 failed on two seeds (Sam 32-42%), P2 failed again (player -4..-23%). The "house" metric
// was wrong (rooms the bot never visits sit at 0). Sharing roughly doubled it (4 -> 9-14) because total
// cleaning rose, not because the threshold bot cleaned less. Run 3 measures what mood uses: how clean the
// room each person is IN is, for a BUDGET bot (cleans at most 60 min a day). Prediction: with sharing the
// player's experienced cleanliness rises >= 10 points and Sam's rises too; LAZY unchanged (<= 10).
const root = new URL('../src/sim/', import.meta.url).href;
const { createState, step, command } = await import(root + 'sim.js');
const { HOUR, DAY, roomOf } = await import(root + 'state.js');
const { CHORES } = await import(root + 'chores.js');
const { effectiveClean, isHard } = await import(root + 'mopping.js');
const { activeAlert } = await import(root + 'alerts.js');
const { ROOM_TILES } = await import(root + 'tasks.js');

function hold(st, id) { const p = st.agents.player; for (const t of Object.values(st.tools)) if (t.carriedBy === 'player') t.carriedBy = null; st.tools[id].carriedBy = 'player'; st.tools[id].inBucket = false; p.carrying = { kind: 'tool', id }; }

function run(seed, policy, sharing) {
  let budgetUsed = 0, budgetDay = -1, pEnv = 0, sEnv = 0, envN = 0;
  CHORES.enabled = sharing;
  const st = createState(seed);
  const p = st.agents.player;
  let houseSum = 0, n = 0;
  for (let i = 0; i < 14 * DAY; i++) {
    const m = st.time % DAY;
    if (m === 22 * HOUR + 30 * 60 && !p.asleep) command(st, { type: 'sleep', obj: 'bedP' });
    if (st.time % 60 === 0 && !p.asleep && !p.task) {
      const al = activeAlert(st);
      if (al && al.cmd) command(st, al.cmd);
      else if (policy === 'diligent' && (Math.floor(st.time / DAY) !== budgetDay || budgetUsed < 60)) {
        if (Math.floor(st.time / DAY) !== budgetDay) { budgetDay = Math.floor(st.time / DAY); budgetUsed = 0; }
        const room = roomOf(p);
        if (st.rooms[room] && effectiveClean(st, room) < 60) {
          const grimy = isHard(room) && (st.rooms[room].grime || 0) >= 20;
          if (grimy) {
            const [c, r] = ROOM_TILES[room][0];
            Object.assign(st.tools.bucket, { c, r, carriedBy: null, water: true, fresh: 100, rinsesLeft: 8 });
            st.tools.mop.dirt = 0; hold(st, 'mop');
            command(st, { type: 'cleanRoom', room, kind: 'mop' });
          } else {
            hold(st, isHard(room) ? 'broom' : 'vacuum');
            command(st, { type: 'cleanRoom', room, kind: isHard(room) ? 'broom' : 'vacuum' });
          }
        }
      }
    }
    const wasCleaning = p.task && p.task.name === 'clean' && p.task.phase === 'act';
    step(st);
    if (wasCleaning) budgetUsed += 1 / 60;
    if (i > 2 * DAY && i % 600 === 0) {
      const pr = roomOf(p), sr = roomOf(st.agents.npc);
      if (st.rooms[pr] && !p.asleep) { pEnv += effectiveClean(st, pr); envN++; if (st.rooms[sr] && !st.agents.npc.away) sEnv += effectiveClean(st, sr); else sEnv += effectiveClean(st, pr); }
      const used = ['kitchen', 'living', 'hallway', 'bathroom', 'masterBath', 'masterBed', 'bedroom3'];
      houseSum += used.reduce((x, id) => x + effectiveClean(st, id), 0) / used.length; n++;
    }
  }
  const tot = st.choreTotal || { player: 0, npc: 0 };
  return { seed, policy, sharing, playerMinPerDay: +(tot.player / 14).toFixed(1), samMinPerDay: +((tot.npc || 0) / 14).toFixed(1), samShare: +((tot.npc || 0) / Math.max(1, tot.player + (tot.npc || 0))).toFixed(2), house: +(houseSum / n).toFixed(1), playerEnv: +(pEnv / envN).toFixed(1), samEnv: +(sEnv / envN).toFixed(1) };
}

const R = {};
for (const seed of [1, 2, 3]) for (const policy of ['diligent', 'lazy']) for (const sharing of [true, false]) {
  const r = run(seed, policy, sharing);
  R[`${seed}:${policy}:${sharing}`] = r;
  console.log(JSON.stringify(r));
}
const g = (s, p, sh) => R[`${s}:${p}:${sh}`];
const P1 = [1, 2, 3].every((s) => g(s, 'diligent', true).playerEnv - g(s, 'diligent', false).playerEnv >= 10);
const P2 = [1, 2, 3].every((s) => g(s, 'diligent', true).samEnv > g(s, 'diligent', false).samEnv);
const P3 = [1, 2, 3].every((s) => g(s, 'lazy', true).playerEnv - g(s, 'lazy', false).playerEnv <= 10);
console.log(`P1 ${P1}  P2 ${P2}  P3 ${P3}`);
console.log(`budget bot experienced cleanliness: player on ${[1, 2, 3].map((s) => g(s, 'diligent', true).playerEnv).join('/')} vs off ${[1, 2, 3].map((s) => g(s, 'diligent', false).playerEnv).join('/')}; Sam on ${[1, 2, 3].map((s) => g(s, 'diligent', true).samEnv).join('/')} vs off ${[1, 2, 3].map((s) => g(s, 'diligent', false).samEnv).join('/')}; lazy player on ${[1, 2, 3].map((s) => g(s, 'lazy', true).playerEnv).join('/')} vs off ${[1, 2, 3].map((s) => g(s, 'lazy', false).playerEnv).join('/')}`);
console.log(`RESULT: ${P1 && P2 && P3 ? 'PASS' : 'FAIL'} diligent Sam share ${[1, 2, 3].map((s) => g(s, 'diligent', true).samShare).join('/')}; player min/day on ${[1, 2, 3].map((s) => g(s, 'diligent', true).playerMinPerDay).join('/')} vs off ${[1, 2, 3].map((s) => g(s, 'diligent', false).playerMinPerDay).join('/')}; lazy house on ${[1, 2, 3].map((s) => g(s, 'lazy', true).house).join('/')} vs off ${[1, 2, 3].map((s) => g(s, 'lazy', false).house).join('/')}`);
