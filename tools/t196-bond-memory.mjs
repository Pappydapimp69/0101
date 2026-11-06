// T196 measured on the REAL 0101 sim: does per-sign memory (bond: 0.5/h fade + a floor at any stage
// held a full day; grudge: separate 8/h fade) keep positive memory without saturating, survive a week
// apart, and let a grudge fade?
//
// Script (30 days, seed 1..5): every evening at 19:00, if Sam is home and awake, the player walks over
// and talks (a real chat, Sam's real reply logic). Day 10 evening: a pestering episode (Sam set low,
// the player tries to talk 5 times; Sam cuts them off). Days 20-26: no contact (player kept in another
// room, Sam's chat initiative off).
//
// Run 1 note: the harness player never cleaned, so Sam's mood sank to ~20 by day 3 and nearly every
// evening was a cut-off or a busy Sam (0-8 chats in 30 evenings). That measures neglect, not memory.
// Run 2: the house is kept clean each morning (an attentive player's chores, idealized) and the player
// tries at 19:00, 20:00 and 21:00 until one chat happens. Predictions unchanged.
// Run 2 result: memory holds (week apart lost 0-84, floor never broken; grudge 0 by morning every seed)
// but the bond STALLS: day-30 bond 107/251/8/231/150, seed 3 went backwards (fade 12/day = one chat).
// Run 3 (fade only after 24 h with no contact): P1 revised to 300 <= day-30 bond < 1000 (progress
// without saturating); P2-P4 unchanged.
// Run 3 result: progress fixed (day-30 bond rose in every seed, P2-P4 hold) but seeds 1 and 3 ended at
// 236 / 226 (< 300): those had 8-11 chats and the harness never picked topics, so it missed the fit
// bonus a reading player earns. Run 4: during each chat pick the best-fitting unlocked topic whenever
// the row is ready (as an attentive player would). Predictions unchanged.
// PREDICTION (written before the first run):
//  P1 positive memory, no saturation: bond on day 30 between 100 and 400 for every seed (net ~+5/day:
//     a chat +12, some company, minus 12/day fade), far from the 1000 cap.
//  P2 a week apart costs less than one stage: bond on day 27 >= bond on day 20 - 99, and never below
//     the floor.
//  P3 the grudge fades: grudge from the day-10 pestering is 0 by 08:00 on day 11 (8/h from <= 60).
//  P4 nothing survives badly: bond on day 30 > bond on day 9 (the pestering does not erase the bond).
const root = new URL('../src/sim/', import.meta.url).href;
const { createState, step, command } = await import(root + 'sim.js');
const { HOUR, DAY, roomOf } = await import(root + 'state.js');
const { walkable } = await import(root + 'path.js');
const { roomAt } = await import(root + 'map.js');
const { TOPICS, topicFit, topicUnlocked } = await import(root + 'chat.js');

function besideSam(st) {
  const n = st.agents.npc;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    const c = n.c + dc, r = n.r + dr;
    if (walkable(c, r) && roomAt(c, r) === roomAt(n.c, n.r)) return { c, r, x: c + 0.5, z: r + 0.5 };
  }
  return null;
}

const results = [];
for (const seed of [1, 2, 3, 4, 5]) {
  const st = createState(seed);
  const p = st.agents.player, n = st.agents.npc;
  const at8 = {}; let grudgeD11 = null; let minAboveFloor = Infinity; let chats = 0, cutoffs = 0;
  for (let i = 0; i < 30 * DAY; i++) {
    const day = Math.floor(st.time / DAY) + 1, h = (st.time % DAY) / HOUR;
    const quiet = day >= 20 && day <= 26;
    if (quiet) { n.chatReadyAt = st.time + HOUR; if (roomOf(p) === roomOf(n)) { Object.assign(p, { c: 47, r: 51, x: 47.5, z: 51.5, path: [], task: null }); } }
    if (st.time % DAY === 8 * HOUR) { for (const r of Object.values(st.rooms)) { r.clean = 90; r.grime = 0; } st.messes = []; st.dishes = []; }
    const evening = [19, 20, 21].includes(h) && st.time % HOUR === 0;
    if (!quiet && evening && !n.away && !n.asleep && (st.chattedDay !== day || day === 10)) {
      if (day === 10) { n.needs.social = 30; n.mood = 30; }
      const tries = day === 10 ? 5 : 1;
      for (let k = 0; k < tries; k++) {
        const spot = besideSam(st);
        if (!spot) break;
        Object.assign(p, spot, { path: [], task: null });
        const before = st.log.length;
        command(st, { type: 'talk' });
        for (let s = 0; s < 120; s++) step(st);
        const msgs = st.log.slice(before).map((e) => e.msg).join(' ');
        if (!st.conv) { if (/sighs|looks away|cut|not now/i.test(msgs)) cutoffs++; continue; }
        chats++; st.chattedDay = day;
        for (let s = 0; s < 3600 && st.conv; s++) {
          if (st.conv && st.time >= st.conv.nextTopicAt) {
            const opts = TOPICS.filter((t) => topicUnlocked(n, t) && !st.conv.picked.includes(t.id)).sort((a, b) => topicFit(st, n, b.id) - topicFit(st, n, a.id));
            if (opts.length && topicFit(st, n, opts[0].id) >= 0) command(st, { type: 'topic', id: opts[0].id });
          }
          step(st);
        }
      }
    }
    step(st);
    if (st.time % DAY === 8 * HOUR) at8[day] = n.bond;
    if (st.time === 10 * DAY + 8 * HOUR) grudgeD11 = n.grudge;
    minAboveFloor = Math.min(minAboveFloor, n.bond - n.bondFloor);
  }
  results.push({ seed, b9: at8[9], b20: at8[20], b27: at8[27], b30: at8[30] ?? n.bond, grudgeD11, minAboveFloor, chats, cutoffs, floor: n.bondFloor });
}
for (const r of results) console.log(JSON.stringify(r));
const P1 = results.every((r) => r.b30 >= 300 && r.b30 < 1000);
const P2 = results.every((r) => r.b27 >= r.b20 - 99 && r.minAboveFloor >= 0);
const P3 = results.every((r) => r.grudgeD11 === 0);
const P4 = results.every((r) => r.b30 > r.b9);
console.log(`P1 no saturation ${P1}  P2 week apart < 1 stage ${P2}  P3 grudge gone by morning ${P3}  P4 bond survives pestering ${P4}`);
console.log(`RESULT: ${P1 && P2 && P3 && P4 ? 'PASS' : 'FAIL'} day-30 bond ${results.map((r) => Math.round(r.b30)).join('/')}; week apart ${results.map((r) => Math.round(r.b20 - r.b27)).join('/')} lost; grudge at 08:00 day 11 ${results.map((r) => Math.round(r.grudgeD11 ?? -1)).join('/')}`);
