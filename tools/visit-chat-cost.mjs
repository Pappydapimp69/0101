// T200 on the real sim: how much does a weekly guest visit cost the player's chats with Sam, and does
// joining the visit (time together counts) pay it back? 8 weeks x 3 seeds, three worlds:
//   NONE  no visits (guest removed)
//   AWAY  visits happen; the player keeps to their own business (never joins)
//   JOIN  visits happen; the player sits with Sam and Jo for the evening
// The player bot is the same in all three: handles alerts, sleeps at 22:30, cleans the visit rooms so
// impressions are good (removing that confound), and accepts every chat Sam starts.
// T200 sandbox said: one 3 h visit a week cost Sam's chats with the player 0.55 (guest gives Sam nothing)
// to 1.11 a week (guest fills Sam's social).
// PREDICTION (before the first run): AWAY has 0.3-1.2 fewer chats a week than NONE; JOIN's bond is at
// least NONE's (time together outweighs lost chats); Jo gives Sam no social in this build, so the cost is
// occupation only and should sit near the sandbox's +0/h case (~0.55).
// Run 1: FAIL on P1 only. Chats lost a week to visits when you keep to yourself: -0.75 / 0.38 / 0.5;
// when you join: -1.37 / -0.25 / 0 (no loss); bond none 382/486/501, away 543/467/476, join 665/534/573.
// Seeds 2-3 match the sandbox's occupation-only cost (~0.55). Seed 1 GAINED chats: a good impression
// bumps Sam's mood (+8 for 6 h), and Sam only starts chats in a decent mood (npcChat.mood 50), so a
// visit can raise chats as well as occupy Sam. Joining removes the cost and adds bond: kept as built.
const root = new URL('../src/sim/', import.meta.url).href;
const { createState, step, command } = await import(root + 'sim.js');
const { HOUR, DAY, roomOf } = await import(root + 'state.js');
const { effectiveClean, isHard } = await import(root + 'mopping.js');
const { activeAlert } = await import(root + 'alerts.js');
const { ROOM_TILES } = await import(root + 'tasks.js');
const { VISIT } = await import(root + 'visitors.js');

const WEEKS = 8;
function hold(st, id) { const p = st.agents.player; for (const t of Object.values(st.tools)) if (t.carriedBy === 'player') t.carriedBy = null; st.tools[id].carriedBy = 'player'; st.tools[id].inBucket = false; p.carrying = { kind: 'tool', id }; }

function run(seed, world) {
  const st = createState(seed);
  if (world === 'NONE') delete st.agents.guest;
  const p = st.agents.player, n = st.agents.npc;
  let chats = 0, samChats = 0, chatMin = 0, wasConv = null;
  for (let i = 0; i < WEEKS * 7 * DAY; i++) {
    const m = st.time % DAY;
    if (m === 22 * HOUR + 30 * 60 && !p.asleep) command(st, { type: 'sleep', obj: 'bedP' });
    const v = st.visit;
    if (st.time % 60 === 0 && !p.asleep && !p.task && !st.conv) {
      const al = activeAlert(st);
      if (al && al.cmd) command(st, al.cmd);
      else if (p.carrying && p.carrying.kind === 'dishes') command(st, { type: 'wash' });
      else if (st.dishes.length) command(st, { type: 'pickDishes', room: st.dishes[0].room });
      else if (st.messes.length) { hold(st, 'wipesK'); command(st, { type: 'cleanMess', id: st.messes[0].id }); }
      else {
        const room = ['living', 'kitchen'].find((r) => effectiveClean(st, r) < 70);
        if (room) {
          const mid = ROOM_TILES[room][Math.floor(ROOM_TILES[room].length / 2)];
          if (roomOf(p) !== room) command(st, { type: 'walk', c: mid[0], r: mid[1] });
          else { hold(st, isHard(room) ? 'broom' : 'vacuum'); command(st, { type: 'cleanRoom', room, kind: isHard(room) ? 'broom' : 'vacuum' }); }
        } else if (world === 'JOIN' && v && st.time >= v.at && st.time < v.end && roomOf(p) !== 'living') command(st, { type: 'tv' });
        else if (world !== 'JOIN' && v && st.time >= v.at && st.time < v.end && roomOf(p) === 'living') command(st, { type: 'walk', c: 45, r: 49 }); // keep to yourself
      }
    }
    step(st);
    if (st.conv && st.conv !== wasConv) { chats++; if (st.conv.a === 'npc') samChats++; }
    if (st.conv) chatMin += 1 / 60;
    wasConv = st.conv;
  }
  return { seed, world, chatsPerWeek: +(chats / WEEKS).toFixed(2), samPerWeek: +(samChats / WEEKS).toFixed(2), chatMinPerWeek: Math.round(chatMin / WEEKS), visits: st.visitsDone || 0, bond: Math.round(n.bond) };
}

const out = [];
for (const seed of [1, 2, 3]) for (const world of ['NONE', 'AWAY', 'JOIN']) { const r = run(seed, world); out.push(r); console.log(JSON.stringify(r)); }
const get = (s, w) => out.find((r) => r.seed === s && r.world === w);
const cost = [1, 2, 3].map((s) => +(get(s, 'NONE').chatsPerWeek - get(s, 'AWAY').chatsPerWeek).toFixed(2));
const joinCost = [1, 2, 3].map((s) => +(get(s, 'NONE').chatsPerWeek - get(s, 'JOIN').chatsPerWeek).toFixed(2));
const P1 = cost.every((c) => c >= 0.3 && c <= 1.2);
const P2 = [1, 2, 3].every((s) => get(s, 'JOIN').bond >= get(s, 'NONE').bond);
console.log(`P1 ${P1}  P2 ${P2}`);
console.log(`RESULT: ${P1 && P2 ? 'PASS' : 'FAIL'} chats lost per week to visits: away ${cost.join('/')}, joining ${joinCost.join('/')}; bond none ${[1, 2, 3].map((s) => get(s, 'NONE').bond).join('/')} away ${[1, 2, 3].map((s) => get(s, 'AWAY').bond).join('/')} join ${[1, 2, 3].map((s) => get(s, 'JOIN').bond).join('/')}`);
