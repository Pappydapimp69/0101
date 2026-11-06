// Fixed-step simulation: one step = one game second. Rendering only reads state.
import { OBJ, OBJECTS, ROOM_BY_ID, roomAt as roomAtTile } from './map.js?v=185d140';
import { canMove } from './path.js?v=185d140';
import {
  TUNING, HOUR, MIN, createState as createBase, clamp, roomOf, log, bump, addMess, isNight,
} from './state.js?v=185d140';
import { runTask, cancelTask, T, T_social, CLEANING, dropCarried, wouldCutOff } from './tasks.js?v=185d140';
import { npcThink, dogThink } from './ai.js?v=185d140';
import { initEconomy, meter, billing, overdueBills, pay, unpaid, ECON } from './economy.js?v=185d140';
import { initBond, bondTick } from './bond.js?v=185d140';
import { chatTick, chooseTopic, promiseTick } from './chat.js?v=185d140';
import { clutterByRoom, settle, CLUTTER } from './clutter.js?v=185d140';
import { initSatisfaction, satisfactionTick } from './satisfaction.js?v=185d140';
import { hintTick } from './hints.js?v=185d140';
import { choresTick } from './chores.js?v=185d140';
import { initLaundry, laundryTick, laundryText, washerReady, dryerReady, LAUNDRY } from './laundry.js?v=185d140';
import { initGroceries, groceryTick, orderGroceries, fridgeCount, onTheWay, hasFood, GROCERY } from './groceries.js?v=185d140';
import { alertTick } from './alerts.js?v=185d140';
import { initMopping, moppingTick, effectiveClean, cantMop, bucketStatus, mopStatus, dirtText, buyDetergent, MOP } from './mopping.js?v=185d140';

export { wouldCutOff };
export function createState(seed = 1) {
  const st = createBase(seed);
  initEconomy(st);
  initBond(st.agents.npc);
  for (const t of Object.values(st.tools)) settle(st, t); // the mop starts in its bucket
  st.clutter = clutterByRoom(st);
  initMopping(st);
  initSatisfaction(st);
  initGroceries(st);
  initLaundry(st);
  return st;
}

const NEED_LABEL = { hunger: 'hungry', thirst: 'thirsty', bladder: 'about to burst', social: 'lonely', energy: 'exhausted' };

function decayNeeds(st, a, dt) {
  if (a.away) {
    // Out of the house: needs drain as usual, but lunch, drinks and work bathrooms keep them off the
    // floor, and coworkers count for a little social. Sam still comes home ready for dinner.
    const r = TUNING.human.awake;
    const AWAY_FLOOR = { hunger: 35, thirst: 50, bladder: 60 };
    for (const k of ['hunger', 'thirst', 'bladder', 'energy']) {
      a.needs[k] = Math.max(Math.min(a.needs[k], AWAY_FLOOR[k] ?? 0), clamp(a.needs[k] - (r[k] * dt) / HOUR));
    }
    a.needs.social = clamp(a.needs.social + (2 * dt) / HOUR);
    return;
  }
  const rates = TUNING[a.kind][a.asleep ? 'asleep' : 'awake'];
  for (const k in rates) a.needs[k] = clamp(a.needs[k] - ((rates[k] < 0 ? 1 : TUNING.needScale ?? 1) * rates[k] * dt) / HOUR);
}

function moodTarget(st, a) {
  const vals = Object.values(a.needs);
  let score = vals.reduce((s, v) => s + v, 0) / vals.length;
  for (const v of vals) score -= Math.max(0, 30 - v) * 0.8;
  const room = roomOf(a);
  const env = a.away ? 75 : st.rooms[room] ? effectiveClean(st, room) : 85;
  let target = 0.6 * clamp(score) + 0.4 * env;
  if (env < 30) target -= 10; // a filthy room is miserable to be in
  for (const b of a.bumps) target += b.amount;
  if (a.id === 'player' && st.bills && overdueBills(st).length) target += ECON.lateMood; // overdue bills weigh on you
  if (a.kind === 'human' && !a.away && st.clutter && st.clutter[room]) target += st.clutter[room].units * CLUTTER.moodPerUnit; // tools left lying around
  return clamp(target);
}

function zeroNeedEvents(st, a) {
  const n = a.needs;
  if (a.kind === 'human') {
    if (n.bladder <= 0) {
      cancelTask(st, a);
      addMess(st, 'puddle', a);
      n.bladder = 100;
      bump(st, a, -25, 4, 'had an accident');
      log(st, a.id === 'player' ? 'You had an accident. Gross.' : 'Sam had an accident.', a.id);
      if (a.id === 'player') bump(st, st.agents.npc, -8, 3, 'grossed out');
    }
    if (n.energy <= 0 && !a.asleep) {
      cancelTask(st, a);
      dropCarried(st, a);
      a.task = T.passOut();
      bump(st, a, -10, 4, 'passed out');
      log(st, a.id === 'player' ? 'You passed out on the floor.' : 'Sam passed out.', a.id);
    }
    for (const k of ['hunger', 'thirst', 'social']) {
      if (n[k] <= 0 && a.id === 'player' && (a.warnedAt[k] || -1e9) < st.time - 2 * HOUR) {
        a.warnedAt[k] = st.time;
        log(st, `You are ${NEED_LABEL[k]}!`, a.id);
      }
    }
  } else {
    if (n.potty <= 0) {
      cancelTask(st, a);
      a.waitingAtDoor = false;
      addMess(st, 'puddle', a);
      n.potty = 100;
      log(st, `Biscuit had an accident in the ${ROOM_BY_ID[roomOf(a)].name}.`, a.id);
    }
    if (n.play <= 0 && st.time >= a.chewAt) {
      a.chewAt = st.time + 90 * MIN;
      if (roomOf(a) !== 'yard') {
        addMess(st, 'debris', a);
        log(st, `Biscuit is bored and chewed something up in the ${ROOM_BY_ID[roomOf(a)].name}.`, a.id);
      }
    }
  }
}

function roomDirt(st, dt) {
  const D = TUNING.dirt;
  const rate = {};
  for (const id in st.rooms) rate[id] = D.base;
  for (const a of Object.values(st.agents)) {
    if (a.away) continue;
    const r = roomOf(a);
    if (rate[r] !== undefined) rate[r] += a.kind === 'dog' ? D.dog : D.human;
  }
  for (const d of st.dishes) if (rate[d.room] !== undefined) rate[d.room] += D.dish;
  for (const m of st.messes) if (rate[m.room] !== undefined) rate[m.room] += D[m.type];
  for (const [tid, t] of Object.entries(st.toilets)) rate[OBJ[tid].room] += t.dirt * D.toilet;
  if (st.backDoorOpen) rate.kitchen += D.doorOpen;
  for (const [room, c] of Object.entries(st.clutter || {})) if (rate[room] !== undefined) rate[room] += c.units * CLUTTER.dirtPerUnit;
  for (const id in st.rooms) st.rooms[id].clean = clamp(st.rooms[id].clean - (rate[id] * (TUNING.dirtScale ?? 1) * dt) / HOUR);
}

export function step(st) {
  const dt = 1;
  st.time += dt;
  for (const a of Object.values(st.agents)) {
    decayNeeds(st, a, dt);
    if (a.id === 'npc') npcThink(st, a);
    if (a.id === 'dog') dogThink(st, a);
    if (!a.away) {
      runTask(st, a, dt);
      zeroNeedEvents(st, a);
    }
    a.bumps = a.bumps.filter((b) => b.until > st.time);
    a.mood += (moodTarget(st, a) - a.mood) * (dt / (30 * MIN));
    a.grudge = Math.max(0, a.grudge - (TUNING.grudge.fadePerHour * dt) / HOUR);
  }
  roomDirt(st, dt);
  moppingTick(st, dt);
  satisfactionTick(st, dt);
  if (st.time % 60 === 0) { groceryTick(st); laundryTick(st); choresTick(st); }
  if (st.time % 10 === 0) { st.clutter = clutterByRoom(st); alertTick(st); hintTick(st); } // cheap enough every 10 game s
  bondTick(st, dt);
  chatTick(st);
  promiseTick(st);
  meter(st, dt);
  billing(st);
}

// How many game seconds pass per real second at 1× (before user speed).
export const BASE_RATE = 180; // 1 real s = 3 game min at 1×

export function timeScale(st) {
  const t = st.agents.player.task;
  return (t && t.timeScale) || 1;
}

// ---------------------------------------------------------------- player interface
const toolName = (st, a) => (a.carrying && a.carrying.kind === 'tool' ? st.tools[a.carrying.id] : null);

// Options for a click target. target: {kind:'obj'|'agent'|'tool'|'dish'|'mess'|'floor', ...}
export function getOptions(st, target) {
  const p = st.agents.player;
  const tool = toolName(st, p);
  const wipes = tool && tool.kind === 'wipes';
  const dishesInHand = p.carrying && p.carrying.kind === 'dishes';
  const opts = [];
  const add = (label, cmd, disabled = null) => opts.push({ label, cmd, disabled });

  if (target.kind === 'obj') {
    const o = OBJ[target.id];
    switch (o.type) {
      case 'stove':
        add(`Cook a meal (${fridgeCount(st)} portions in the fridge)`, { type: 'cook' }, (dishesInHand && 'hands full') || (!hasFood(st, 'cook') && 'not enough food: order groceries at the computer'));
        if (wipes) add('Wipe counters', { type: 'wipeCounters', obj: o.id });
        break;
      case 'fridge':
        add(`Grab a snack (${fridgeCount(st)} portions left${onTheWay(st) ? `, ${onTheWay(st)} on the way` : ''})`, { type: 'snack' }, (dishesInHand && 'hands full') || (!hasFood(st, 'snack') && 'the fridge is empty: order groceries at the computer'));
        add('Grab a drink', { type: 'drinkFridge' }, dishesInHand && 'hands full');
        if (wipes) add('Wipe counters', { type: 'wipeCounters', obj: o.id });
        break;
      case 'counter':
        if (wipes) add('Wipe counters', { type: 'wipeCounters', obj: o.id });
        break;
      case 'sink':
        if (tool && tool.kind === 'bucket') {
          add(`${tool.water ? 'Dump and refill' : 'Fill'} the mop bucket (water + detergent, ${st.detergent} dose${st.detergent === 1 ? '' : 's'})`,
            { type: 'fillBucket', obj: o.id }, st.detergent <= 0 && 'out of detergent: buy more at the computer');
        }
        if (o.kitchen && dishesInHand) add(`Wash dishes (${p.carrying.n})`, { type: 'wash' });
        add('Drink water', { type: 'drinkSink', obj: o.id });
        if (o.kitchen && wipes) add('Wipe counters', { type: 'wipeCounters', obj: o.id });
        break;
      case 'table': {
        const n = st.dishes.filter((d) => d.room === 'kitchen').length;
        if (n) add(`Pick up dishes (${n})`, { type: 'pickDishes', room: 'kitchen' });
        break;
      }
      case 'toilet':
        add('Use toilet', { type: 'toilet', obj: o.id });
        if (wipes) add(`Clean toilet (${Math.round(st.toilets[o.id].dirt)}% dirty)`, { type: 'cleanToilet', obj: o.id });
        break;
      case 'bed':
        if (o.owner === 'player') add('Sleep', { type: 'sleep', obj: o.id });
        else add("Sleep (it's Sam's bed)", { type: 'sleep', obj: o.id }, 'not your bed');
        break;
      case 'couch':
        add('Watch TV', { type: 'tv' });
        add('Nap', { type: 'nap' });
        break;
      case 'tv':
        if (o.id === 'tv') add('Watch TV', { type: 'tv' });
        break;
      case 'sewing':
        add('Sew something (relaxing)', { type: 'sew' }, dishesInHand && 'hands full');
        break;
      case 'desk':
        add(`Work (+$${ECON.wage}/h, time ×4)`, { type: 'work' }, dishesInHand && 'hands full');
        add('Chat online (social, time ×4)', { type: 'computer' }, dishesInHand && 'hands full');
        if (unpaid(st).length) add('Pay bills', { type: 'payBills' });
        add(`Order groceries (${GROCERY.order} portions, $${GROCERY.order * GROCERY.price + GROCERY.fee}; fridge ${fridgeCount(st)}${onTheWay(st) ? `, ${onTheWay(st)} coming` : ''})`, { type: 'orderGroceries' }, st.money < GROCERY.order * GROCERY.price + GROCERY.fee && 'not enough money');
        add(`Buy detergent ($${MOP.detergentPack.price}, ${MOP.detergentPack.doses} doses; have ${st.detergent})`, { type: 'buyDetergent' }, st.money < MOP.detergentPack.price && 'not enough money');
        break;
      case 'foodBowl':
        add(`Fill with kibble (${Math.round(st.bowls.food)}%)`, { type: 'fillBowl', which: 'food' }, dishesInHand && 'hands full');
        break;
      case 'waterBowl':
        add(`Fill with water (${Math.round(st.bowls.water)}%)`, { type: 'fillBowl', which: 'water' }, dishesInHand && 'hands full');
        break;
      case 'door':
        add(st.backDoorOpen ? 'Close back door' : 'Open back door', { type: 'door', open: !st.backDoorOpen });
        break;
      case 'washer': {
        const L = st.laundry;
        if (o.id === 'washer') {
          if (washerReady(st)) add(`Move the clothes to the dryer (${L.washer.n})`, { type: 'laundryMove' }, (dishesInHand && 'hands full') || (L.dryer && 'the dryer is full: fold it first'));
          else if (L.washer) add(`Washing (${Math.ceil((L.washer.doneAt - st.time) / MIN)} min left)`, { type: 'noop' }, 'still washing');
          else add(`Wash clothes (${Math.min(LAUNDRY.capacity, L.dirty)} of ${L.dirty} dirty; 1 detergent dose, ${st.detergent} left)`, { type: 'laundryWash' },
            (dishesInHand && 'hands full') || (!L.dirty && 'nothing dirty to wash') || (st.detergent <= 0 && 'out of detergent: buy more at the computer'));
        } else {
          if (dryerReady(st)) add(`Fold the laundry (${L.dryer.n})`, { type: 'laundryFold' }, dishesInHand && 'hands full');
          else if (L.dryer) add(`Drying (${Math.ceil((L.dryer.doneAt - st.time) / MIN)} min left)`, { type: 'noop' }, 'still drying');
          else add(`Dryer (${laundryText(st)})`, { type: 'noop' }, 'empty');
        }
        break;
      }
      case 'toy':
        add('Play fetch with Biscuit', { type: 'fetch' }, dishesInHand && 'hands full');
        break;
      default:
    }
  } else if (target.kind === 'agent') {
    if (target.id === 'npc') add('Talk to Sam', { type: 'talk' });
    if (target.id === 'dog') {
      add('Pet Biscuit', { type: 'pet' });
      add('Play fetch', { type: 'fetch' }, dishesInHand && 'hands full');
    }
  } else if (target.kind === 'tool') {
    const t = st.tools[target.id];
    if (t.kind === 'bucket' && !t.carriedBy) {
      const mop = st.tools.mop;
      const mopHere = (tool && tool.kind === 'mop') || (mop && mop.inBucket && mop.c === t.c && mop.r === t.r);
      if (mopHere) add(`Rinse the mop (mop ${mopStatus(mop)} · bucket ${bucketStatus(t)})`, { type: 'rinseMop' },
        !t.water ? 'the bucket is empty: fill it at a sink' : t.rinsesLeft <= 0 ? 'no rinses left: refill the bucket at a sink' : null);
    }
    if (!t.carriedBy) add(tool ? `Swap for ${t.name}` : `Pick up ${t.name}`, { type: 'pickTool', id: t.id }, dishesInHand && 'hands full');
  } else if (target.kind === 'dish') {
    const d = st.dishes.find((x) => x.id === target.id);
    if (d) add(`Pick up dishes (${st.dishes.filter((x) => x.room === d.room).length})`, { type: 'pickDishes', room: d.room });
  } else if (target.kind === 'mess') {
    const m = st.messes.find((x) => x.id === target.id);
    if (m) {
      const ok = tool && (tool.kind === 'wipes' || CLEANING[tool.kind].removes.includes(m.type));
      add(`Clean up ${m.type === 'puddle' ? 'puddle' : 'chewed mess'}`, { type: 'cleanMess', id: m.id },
        !ok && (m.type === 'puddle' ? 'need wipes or mop' : 'need wipes, broom or vacuum'));
    }
  }

  if (target.kind === 'floor' || target.kind === 'mess' || target.kind === 'dish') {
    const room = target.room;
    if (tool && CLEANING[tool.kind] && st.rooms[room]) {
      const spec = CLEANING[tool.kind];
      const floor = ROOM_BY_ID[room].floor;
      const ok = spec.floors.includes(floor);
      const mopWhy = tool.kind === 'mop' ? cantMop(st, room) : null;
      add(`${spec.act} the ${ROOM_BY_ID[room].name} (${dirtText(st, room)})`,
        { type: 'cleanRoom', room, kind: tool.kind },
        !ok ? `${tool.name.toLowerCase()} is for ${spec.floors[0]} floors` : mopWhy);
    }
  }
  if (target.kind === 'floor' && p.carrying && p.carrying.kind === 'tool') add(`Put down the ${st.tools[p.carrying.id].name.toLowerCase()} here`, { type: 'putDownAt', c: target.c, r: target.r });
  if (target.c !== undefined) add('Walk here', { type: 'walk', c: target.c, r: target.r });
  return opts;
}

export function command(st, cmd) {
  const p = st.agents.player;
  if (cmd.type === 'putDown') { dropCarried(st, p); return; }
  if (cmd.type === 'stop') { cancelTask(st, p); return; }
  if (cmd.type === 'topic') return chooseTopic(st, cmd.id); // chat wheel; no walking
  if (cmd.type === 'run') { p.running = cmd.on ?? !p.running; return; } // run toggle: no walking
  if (cmd.type === 'payBills') { pay(st, cmd.id ?? null); return; } // online, from anywhere
  if (cmd.type === 'orderGroceries') { const why = orderGroceries(st, 'player'); if (why) log(st, `Can't order groceries: ${why}.`, 'player'); return; }
  if (cmd.type === 'buyDetergent') { const why = buyDetergent(st); if (why) log(st, `Can't buy detergent: ${why}.`, 'player'); return; }
  let t;
  switch (cmd.type) {
    case 'walk': t = T.walk(cmd.c, cmd.r); break;
    case 'cook': t = T.cook(); break;
    case 'snack': t = T.snack(); break;
    case 'drinkFridge': t = T.drinkFridge(); break;
    case 'drinkSink': t = T.drinkSink(cmd.obj); break;
    case 'toilet': t = T.toilet(cmd.obj); break;
    case 'sleep': t = T.sleep(cmd.obj); break;
    case 'nap': t = T.nap(); break;
    case 'tv': t = T.tv(60); break;
    case 'sew': t = T.sew(40); break;
    case 'computer': t = T.computer(); break;
    case 'work': t = T.work(); break;
    case 'phone': t = T.phone(); break;
    case 'fillBowl': t = T.fillBowl(cmd.which); break;
    case 'door': t = T.door(cmd.open); break;
    case 'pickTool': t = T.pickTool(cmd.id); break;
    case 'pickDishes': t = T.pickDishes(cmd.room); break;
    case 'wash': t = T.wash(); break;
    case 'cleanRoom': t = T.cleanRoom(cmd.room, cmd.kind); break;
    case 'laundryWash': t = T.laundryWash(); break;
    case 'laundryMove': t = T.laundryMove(); break;
    case 'laundryFold': t = T.laundryFold(); break;
    case 'rinseMop': t = T.rinseMop(); break;
    case 'fillBucket': t = T.fillBucket(cmd.obj); break;
    case 'putDownAt': t = T.putDownAt(cmd.c, cmd.r); break;
    case 'wipeCounters': t = T.wipeCounters(cmd.obj); break;
    case 'cleanToilet': t = T.cleanToilet(cmd.obj); break;
    case 'cleanMess': t = T.cleanMess(cmd.id); break;
    case 'talk': t = T_social.talk(); break;
    case 'pet': t = T_social.pet(); break;
    case 'fetch': t = T_social.fetch(); break;
    default: return;
  }
  cancelTask(st, p);
  if (t.hands && p.carrying && p.carrying.kind === 'tool') {
    log(st, `You put down the ${st.tools[p.carrying.id].name.toLowerCase()}.`, 'player');
    dropCarried(st, p);
  }
  p.task = t;
}

// ---------------------------------------------------------------- direct (gamepad) movement
// Step the player one tile in (dc, dr), queueing at most two tiles so releasing the stick stops
// promptly. A blocked diagonal slides along the wall on whichever axis is open.
export function nudge(st, dc, dr) {
  const p = st.agents.player;
  if (p.task) cancelTask(st, p);
  if (p.path.length >= 2) return true;
  const [c, r] = p.path.length ? p.path[p.path.length - 1] : [p.c, p.r];
  const tries = dc && dr ? [[dc, dr], [dc, 0], [0, dr]] : [[dc, dr]];
  for (const [x, y] of tries) {
    if (canMove(st, 'human', c, r, x, y)) { p.path.push([c + x, r + y]); return true; }
  }
  return false;
}
// Stick movement with a short lookahead. Why nudge alone fails at doorways: the isometric stick
// mostly asks for tile DIAGONALS, and a diagonal step may not cross between rooms (no corner
// cutting through door jambs), so nudge falls back to one axis, x first, and slides along the
// wall past the door; only a straight push lined up with the door got through (measured 21% of
// tries over every door). steer() searches every tile reachable within a few steps and walks
// toward the one that gets furthest along the stick direction, minus sideways drift and detour,
// so a door roughly ahead is threaded on its own. A far-off door does not pull you sideways.
export const STEER = { depth: 6, lateral: 1.0, detour: 0.5, minAlong: 0.5, cone: 1.2 }; // cone: max sideways per step ahead (~50 deg)
export function steer(st, wx, wz) {
  const p = st.agents.player;
  if (p.task) cancelTask(st, p);
  if (p.path.length >= 2) return true;
  const len = Math.hypot(wx, wz);
  if (len < 1e-6) return false;
  const ux = wx / len;
  const uz = wz / len;
  const [c0, r0] = p.path.length ? p.path[p.path.length - 1] : [p.c, p.r];
  const key = (c, r) => r * 1000 + c;
  const seen = new Map([[key(c0, r0), { c: c0, r: r0, cost: 0, steps: 0, first: null }]]);
  let frontier = [seen.get(key(c0, r0))];
  let best = null;
  let bestScore = -Infinity;
  for (let d = 0; d < STEER.depth && frontier.length; d++) {
    const next = [];
    for (const n of frontier) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const c = n.c + dc;
        const r = n.r + dr;
        const k = key(c, r);
        if (seen.has(k) || !canMove(st, 'human', n.c, n.r, dc, dr)) continue;
        const m = { c, r, cost: n.cost + (dc && dr ? Math.SQRT2 : 1), first: n.first || [c, r] };
        seen.set(k, m);
        next.push(m);
        const vx = c - c0;
        const vz = r - r0;
        const along = vx * ux + vz * uz;
        if (along < STEER.minAlong) continue;
        const lat = Math.abs(vx * uz - vz * ux);
        if (lat > STEER.cone * along) continue; // a door off to the side doesn't pull you in
        const score = along - STEER.lateral * lat - STEER.detour * (m.cost - Math.hypot(vx, vz));
        if (score > bestScore + 1e-9) { bestScore = score; best = m; }
      }
    }
    frontier = next;
  }
  if (!best) return false;
  p.path.push(best.first);
  return true;
}

export function stopNudge(st) {
  const p = st.agents.player;
  if (!p.task && p.path.length > 1) p.path.length = 1;
}

// Things the player could interact with right now, nearest first (for gamepad focus).
export function focusTargets(st) {
  const p = st.agents.player;
  const here = roomOf(p);
  const out = [];
  const consider = (t, x, z, room, label) => {
    const d = Math.hypot(x - p.x, z - p.z);
    if (!((room === here && d < 16) || d < 1.8)) return; // 16 tiles: rooms are up to ~30 tiles across
    const opts = getOptions(st, t).filter((o) => o.cmd.type !== 'walk');
    if (!opts.length) return;
    out.push({ ...t, x, z, d, label, key: `${t.kind}:${t.id ?? `${t.c},${t.r}`}` });
  };
  for (const o of OBJECTS) {
    consider({ kind: 'obj', id: o.id, room: o.room }, o.rect[0] + o.rect[2] / 2, o.rect[1] + o.rect[3] / 2, o.room, o.name);
  }
  for (const id of ['npc', 'dog']) {
    const a = st.agents[id];
    if (a.away) continue;
    consider({ kind: 'agent', id, room: roomOf(a) }, a.x, a.z, roomOf(a), a.name);
  }
  for (const t of Object.values(st.tools)) {
    if (t.carriedBy) continue;
    const room = OBJ_ROOM(t.c, t.r);
    consider({ kind: 'tool', id: t.id, c: t.c, r: t.r, room }, t.c + 0.5, t.r + 0.5, room, t.name);
  }
  const dishRooms = new Set();
  for (const d of st.dishes) {
    if (dishRooms.has(d.room)) continue;
    dishRooms.add(d.room);
    consider({ kind: 'dish', id: d.id, c: Math.floor(d.x), r: Math.floor(d.z), room: d.room }, d.x, d.z, d.room, 'Dirty dishes');
  }
  for (const m of st.messes) {
    consider({ kind: 'mess', id: m.id, c: Math.floor(m.x), r: Math.floor(m.z), room: m.room }, m.x, m.z, m.room, m.type === 'puddle' ? 'Puddle' : 'Chewed mess');
  }
  const tool = p.carrying && p.carrying.kind === 'tool' ? st.tools[p.carrying.id] : null;
  if (tool && CLEANING[tool.kind] && st.rooms[here]) {
    out.push({ kind: 'floor', c: p.c, r: p.r, room: here, x: p.x, z: p.z, d: 0.6, label: `${ROOM_BY_ID[here].name} floor`, key: `floor:${here}` });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}
const OBJ_ROOM = (c, r) => roomAtTile(c, r);

export { isNight };
