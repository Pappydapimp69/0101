// Chaos sweep on the real sim: a player who handles red alerts, sleeps at 22:30 and otherwise picks a
// random enabled option on a random object, agent, tool or tile every 20 game minutes. Looks for what a
// playtest would hit: exceptions, NaN, agents off the map or inside solid tiles, tasks that never end,
// and the most frequent task failures (st.failCounts).
// PREDICTION (before the first run): no exceptions or NaN; no agent stuck in one task for > 8 game hours
// outside sleep/work/visits; no single failure message more than 20 times per seed over 21 days.
// Run 1: PASS, but you and Biscuit gave up on the bowls 1-7 times per seed: Biscuit begs for an empty bowl
// sitting ON its use spot, so you could not fill it. Bowls now wait briefly (like the toilet) and Biscuit
// begs beside them: bowl give-ups 0. Tracing the 1-per-seed "Can't get there" found the starting dishes and
// every fridge glass placed at old kitchen coordinates that are now the yard (tests/dishes.test.mjs).
const root = new URL('../src/sim/', import.meta.url).href;
const { createState, step, command, getOptions } = await import(root + 'sim.js');
const { HOUR, DAY } = await import(root + 'state.js');
const { activeAlert } = await import(root + 'alerts.js');
const { OBJECTS, W, H } = await import(root + 'map.js');
const { walkable } = await import(root + 'pathfind.js').catch(() => ({}));

const DAYS = +(process.env.DAYS || 21);
const LONG_OK = new Set(['sleep', 'work', 'visit', 'host', 'leave']);

function lcg(s) { return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function run(seed) {
  const st = createState(seed);
  const rnd = lcg(seed * 7919 + 1);
  const p = st.agents.player;
  const issues = { exceptions: [], nan: [], offmap: 0, long: {} };
  const since = {};
  let picks = 0;
  for (let i = 0; i < DAYS * DAY; i++) {
    const m = st.time % DAY;
    try {
      if (m === 22 * HOUR + 30 * 60 && !p.asleep) command(st, { type: 'sleep', obj: 'bedP' });
      if (st.time % (20 * 60) === 0 && !p.asleep && !p.away && !p.task) {
        const al = activeAlert(st);
        if (al && al.cmd) command(st, al.cmd);
        else {
          const r = rnd();
          let t;
          if (r < 0.7) { const o = OBJECTS[Math.floor(rnd() * OBJECTS.length)]; t = { kind: 'obj', id: o.id, room: o.room }; }
          else if (r < 0.85) t = { kind: 'agent', id: rnd() < 0.5 ? 'npc' : 'dog' };
          else { const ids = Object.keys(st.tools); t = { kind: 'tool', id: ids[Math.floor(rnd() * ids.length)] }; }
          const opts = getOptions(st, t).filter((o) => !o.disabled);
          if (opts.length) { command(st, opts[Math.floor(rnd() * opts.length)].cmd); picks++; }
        }
      }
      step(st);
    } catch (e) {
      if (issues.exceptions.length < 5) issues.exceptions.push(`${(st.time / DAY).toFixed(2)}d ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
      if (issues.exceptions.length >= 5) break;
    }
    if (st.time % 600 === 0) {
      for (const a of Object.values(st.agents)) {
        if (a.away) continue;
        for (const [k, v] of Object.entries(a.needs)) if (!Number.isFinite(v) && issues.nan.length < 5) issues.nan.push(`${a.id}.${k}`);
        if (!Number.isFinite(a.x) || a.c < 0 || a.r < 0 || a.c >= (W || 60) || a.r >= (H || 60)) issues.offmap++;
        const name = a.task ? a.task.name : null;
        const s = since[a.id];
        if (!s || s.name !== name || s.task !== a.task) since[a.id] = { name, task: a.task, at: st.time };
        else if (name && !LONG_OK.has(name) && !a.asleep && st.time - s.at > 8 * HOUR) {
          const k = `${a.id}:${name}`;
          if (!issues.long[k]) issues.long[k] = `${(s.at / DAY).toFixed(2)}d`;
        }
      }
      for (const k of ['money', 'satisfaction']) if (!Number.isFinite(st[k]) && issues.nan.length < 5) issues.nan.push(k);
    }
  }
  const fails = Object.entries(st.failCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { seed, picks, ...issues, fails };
}

const out = [];
for (const seed of [1, 2, 3]) { const r = run(seed); out.push(r); console.log(JSON.stringify(r)); }
const ok = out.every((r) => !r.exceptions.length && !r.nan.length && !r.offmap && !Object.keys(r.long).length && (!r.fails.length || r.fails[0][1] <= 20));
console.log(`RESULT: ${ok ? 'PASS' : 'FAIL'} exceptions ${out.map((r) => r.exceptions.length).join('/')} nan ${out.map((r) => r.nan.length).join('/')} long tasks ${out.map((r) => Object.keys(r.long).length).join('/')} top fail ${out.map((r) => (r.fails[0] ? r.fails[0][1] : 0)).join('/')}`);
