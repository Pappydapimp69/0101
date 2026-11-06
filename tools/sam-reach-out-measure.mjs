// Sam reaching out: how often does Sam start a chat with a busy player? 2 weeks x 3 seeds, no visits.
// The player bot handles alerts, sleeps at 22:30 and keeps the house (dishes, messes, living room and
// kitchen above 70), so it nearly always has a task. Counts the minutes Sam's chat gate is open
// (lonely, mood, cooldown, schedule) and the share of them the player is busy, and Sam-started chats.
// Baseline (gate required you to have no task at all): Sam-started chats 1 / 3 / 4 a week; the player was
// busy for 86% / 79% / 77% of the minutes Sam wanted to talk (clean, phone, snack, wash).
// Change: Sam comes over anyway and waits up to 15 game min for you to finish (never interrupts).
// Worlds: NONE = the bot ignores Sam (lower bound); LISTEN = when Sam says "Got a sec?" the bot starts no
// new chore until Sam has talked (what a player who notices does).
// PREDICTION (before the run): Sam-started chats at least double on every seed (>= 2 / 6 / 8) and Sam's
// lowest social is no lower than the baseline's.
// Run 1 (Sam waits, no give-up cooldown, deaf bot only): 3.5 / 4.5 / 4; Sam's lowest social fell to 18 on
// seed 2 (waiting instead of phoning). Run 2: after giving up Sam waits an hour before trying again.
// Run 2: deaf 3 / 3.5 / 4, listening 4.5 / 5 / 5 (from 1 / 3 / 4); Sam's lowest social 33-42 (baseline
// 33-42). FAIL on "double" for seeds 2-3 only: there the cap is Sam's own loneliness, not your being busy
// (social drains ~2/h awake, so Sam is lonely about once a day: ~5-7 a week minus work). Kept.
const root = new URL('../src/sim/', import.meta.url).href;
const { createState, step, command } = await import(root + 'sim.js');
const { HOUR, DAY, roomOf } = await import(root + 'state.js');
const { effectiveClean, isHard } = await import(root + 'mopping.js');
const { activeAlert } = await import(root + 'alerts.js');
const { ROOM_TILES } = await import(root + 'tasks.js');
const { VISIT } = await import(root + 'visitors.js');

const WEEKS = 2;
const { TUNING } = await import(root + 'state.js');
const { blockAt } = await import(root + 'schedule.js');
function hold(st, id) { const p = st.agents.player; for (const t of Object.values(st.tools)) if (t.carriedBy === 'player') t.carriedBy = null; st.tools[id].carriedBy = 'player'; st.tools[id].inBucket = false; p.carrying = { kind: 'tool', id }; }

function run(seed, world) {
  const st = createState(seed);
  if (world === 'NONE') delete st.agents.guest;
  const p = st.agents.player, n = st.agents.npc;
  let minSocial = 100, gate = 0, busy = 0; const bt = {}; let chats = 0, samChats = 0, chatMin = 0, wasConv = null;
  for (let i = 0; i < WEEKS * 7 * DAY; i++) {
    const m = st.time % DAY;
    if (m === 22 * HOUR + 30 * 60 && !p.asleep) command(st, { type: 'sleep', obj: 'bedP' });
    const v = st.visit;
    const samWaiting = n.task && n.task.label === 'Waiting to chat';
    if (st.time % 60 === 0 && !p.asleep && !p.task && !st.conv && !(world === 'LISTEN' && samWaiting)) {
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
    if (!n.away) minSocial = Math.min(minSocial, n.needs.social);
    if (st.time % 60 === 0 && !n.away && !n.asleep && !st.conv) { const C = TUNING.npcChat; const b = blockAt(st);
      if (b.chat && st.time >= n.chatReadyAt && n.needs.social < C.lonely && n.mood >= C.mood && n.grudge < 20 && !p.asleep) { gate++; if (p.task) { busy++; bt[p.task.name] = (bt[p.task.name] || 0) + 1; } } }
    step(st);
    if (st.conv && st.conv !== wasConv) { chats++; if (st.conv.a === 'npc') samChats++; }
    if (st.conv) chatMin += 1 / 60;
    wasConv = st.conv;
  }
  return { minSocial: Math.round(minSocial), gateMin: gate, busyShare: +(busy / Math.max(1, gate)).toFixed(2), busyBy: Object.entries(bt).sort((a, b) => b[1] - a[1]).slice(0, 5), seed, world, chatsPerWeek: +(chats / WEEKS).toFixed(2), samPerWeek: +(samChats / WEEKS).toFixed(2), chatMinPerWeek: Math.round(chatMin / WEEKS), visits: st.visitsDone || 0, bond: Math.round(n.bond) };
}

const out = [];
for (const seed of [1, 2, 3]) for (const world of ['NONE', 'LISTEN']) { const r = run(seed, world); out.push(r); console.log(JSON.stringify(r)); }

const base = { 1: 1, 2: 3, 3: 4 };
const ok = out.filter((r) => r.world === 'LISTEN').every((r) => r.samPerWeek >= 2 * base[r.seed]);
console.log(`RESULT: ${ok ? 'PASS' : 'FAIL'} Sam-started chats a week, deaf ${out.filter((r) => r.world === 'NONE').map((r) => r.samPerWeek).join('/')} listening ${out.filter((r) => r.world === 'LISTEN').map((r) => r.samPerWeek).join('/')} (baseline 1/3/4); busy share ${out.map((r) => r.busyShare).join('/')}; Sam lowest social ${out.map((r) => r.minSocial).join('/')}`);
