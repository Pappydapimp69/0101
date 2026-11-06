// NPC decision-making. The human NPC uses utility scoring (needs → response curve, multiplied by
// distance and availability so any zero vetoes the action). The dog uses a short priority list.
import { OBJ, SPOTS } from './map.js';
import { flood, idx, walkable } from './path.js';
import { MIN, HOUR, TUNING, isNight, rand, pick, roomOf } from './state.js';
import { T, T_social, task, freeSlots, startConversation, ROOM_TILES, cancelTask } from './tasks.js';
import { blockAt, shiftTimes } from './schedule.js';
import { stageOf } from './bond.js';
import { hasFood } from './groceries.js';
import { samWouldTidy } from './chores.js';
import { log } from './state.js';

const urg = (v) => { const x = Math.max(0, Math.min(1, (100 - v) / 100)); return x * x; };
const HOUSE_ROOMS = ['kitchen', 'living', 'bedroom3', 'hallway', 'bedroom1', 'masterBed', 'laundry'];

function objDist(st, a, dist, objId) {
  let best = Infinity;
  for (const i of freeSlots(st, objId, a)) {
    const [c, r] = OBJ[objId].slots[i].tile;
    best = Math.min(best, dist[idx(c, r)]);
  }
  return best;
}

export function npcCandidates(st, a) {
  const n = a.needs;
  const { dist } = flood(st, a.kind, a.c, a.r);
  const out = [];
  const block = blockAt(st);
  const add = (name, score, objId, make) => {
    let s = score * ((block.bias && block.bias[name]) || 1);
    if (block.routine && block.routine[0] === name) s = Math.max(s, block.routine[1]);
    if (objId) {
      const d = objDist(st, a, dist, objId);
      if (!Number.isFinite(d)) s = 0; // unreachable or occupied: veto
      else s *= 1 / (1 + d / 60);
    }
    if (s > 0) out.push({ name, score: s, make });
  };
  const night = !!block.sleep;
  const dog = st.agents.dog;
  const player = st.agents.player;

  // Mandatory: head out to the car and leave at the scheduled minute.
  if (block.leave || block.away) {
    add('leave', 3, null, () => task('leave', 'Heading to work', [
      { tiles: [SPOTS.garageExit], dur: 0 },
      {
        pose: 'stand',
        until: (s2) => { const t = shiftTimes(s2); return !t || s2.time >= t.leaveAt; },
        end: (s2, me) => goToWork(s2, me),
      },
    ], { busy: true }));
  }

  if (n.hunger < 30 && hasFood(st, 'snack')) add('snack', urg(n.hunger) * 1.3, 'fridge', T.snack);
  else if (hasFood(st, 'cook')) add('cook', urg(n.hunger) * (night ? 0.6 : 1.2), 'stove', T.cook);
  else if (hasFood(st, 'snack')) add('snack', urg(n.hunger) * 1.3, 'fridge', T.snack);
  add('drinkFridge', urg(n.thirst) * 1.15, 'fridge', T.drinkFridge);
  for (const s of ['sinkK', 'sinkW', 'sinkMB']) add('drinkSink', urg(n.thirst) * 1.1, s, () => T.drinkSink(s));
  if (n.bladder < 50) for (const t of ['toiletW', 'toiletMB']) add('toilet', Math.pow(urg(n.bladder), 0.8) * 1.6, t, () => T.toilet(t));
  // Sleep on schedule; outside bedtime only an exhausted Sam naps.
  // (a parched or starving Sam gets up first instead of lying there)
  const desperate = Math.min(n.thirst, n.hunger) < 15 || n.bladder < 20;
  if (block.sleep) add('sleep', (block.windDown ? 1.2 : 1.5) * (desperate ? 0.3 : 1), 'bedN', () => npcSleep());
  else if (n.energy < 15) add('sleep', 1.2, 'bedN', () => npcSleep());
  add('computer', urg(n.social) * 0.9, 'desk', () => T.computer(60));
  add('phone', urg(n.social) * 0.7, null, () => T.phone(40));
  // Sam only comes looking for you when (1) the chat cooldown has recharged, (2) Sam is actually
  // lonely, and (3) you're free to talk right now. The cooldown restarts only when a chat happens.
  const C = TUNING.npcChat;
  if (block.chat && st.time >= a.chatReadyAt && n.social < C.lonely && a.mood >= C.mood && a.grudge < 20 &&
      !player.task && !player.asleep) {
    add('chat', urg(n.social) * 1.3, null, () => task('chat', 'Coming to chat', [
      {
        follow: 'player', dur: 0,
        begin: (s2, me) => {
          const p = s2.agents.player;
          if (p.task || p.asleep) return false;
          startConversation(s2, me, p);
        },
      },
    ], { low: true }));
  }
  if (!night) add('tv', 0.12, 'couch', () => T.tv(45));
  const tidyRoom = !night ? samWouldTidy(st) : null;
  if (tidyRoom) add('tidy', 0.6, null, () => T.tidy(tidyRoom));
  // what you two talked about
  if (st.plateForSam) add('eatPlate', 2.2, 'table', () => T.eatPlate());
  const pr = st.promise;
  if (pr && pr.kind === 'tv' && st.time >= pr.at - 10 * MIN && st.time < pr.until && !(a.task && a.task.name === 'tv')) add('tvNight', 2.6, 'couch', () => T.tv(120));
  if (a.petAfterChat && !st.conv && (Number.isFinite(dist[idx(dog.c, dog.r)]) || roomOf(dog) !== 'yard')) add('petDog', 2, null, () => { a.petAfterChat = false; return T_social_npcPet(); });
  if (!night) add('sew', 0.1, 'sewing', () => T.sew(40));
  // only if Biscuit can be reached (a dog shut in the yard made Sam fail "Can't reach Biscuit" up to 46x in 2 weeks)
  const dogReachable = Number.isFinite(dist[idx(dog.c, dog.r)]) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => Number.isFinite(dist[idx(dog.c + dc, dog.r + dr)]));
  if (dog.needs.play < 80 && dogReachable) add('petDog', 0.05 + urg(dog.needs.play) * 0.2, null, () => T_social_npcPet());
  if (dog.waitingAtDoor && !st.backDoorOpen) add('letDogOut', 0.8, 'backDoor', () => T.door(true));
  // closed doors block everyone: shut outside, Sam opens the back door from the yard side
  if (roomOf(a) === 'yard' && !st.backDoorOpen) add('letSelfIn', 2.5, 'backDoor', () => T.door(true));
  if (st.backDoorOpen && roomOf(a) !== 'yard' && roomOf(dog) !== 'yard' && !dog.waitingAtDoor && !(dog.task && dog.task.name === 'potty')) {
    add('closeDoor', 0.3, 'backDoor', () => T.door(false));
  }
  add('wander', 0.04, null, () => T.wander(st, a, ROOM_TILES[pick(st, HOUSE_ROOMS)], (5 + rand(st) * 10) * MIN));
  return out;
}

// Sam's own sleep: wakes when the schedule says (if rested enough), or to use the bathroom.
function npcSleep() {
  return task('sleep', 'Sleeping', [
    {
      obj: 'bedN', pose: 'lie',
      begin: (st, a) => { a.asleep = true; },
      until: (st, a) => a.needs.bladder < 12 || a.needs.thirst < 12 || a.needs.hunger < 12 || blockAt(st).leave || blockAt(st).away || (!blockAt(st).sleep && a.needs.energy >= 60) || (a.needs.energy >= 100 && !blockAt(st).sleep),
      end: (st, a) => { a.asleep = false; },
    },
  ], { busy: true });
}

function goToWork(st, a, rushed = false) {
  if (st.conv) st.conv = null;
  a.away = true;
  a.path = [];
  a.asleep = false;
  log(st, `${rushed ? 'Sam rushed out the door for work' : 'Sam left for work'} — you're home alone with Biscuit.`, 'npc');
}

function returnHome(st, a) {
  a.away = false;
  a.homeAt = st.time; // chat topics read this ('how was your day?')
  Object.assign(a, { c: SPOTS.garageExit[0], r: SPOTS.garageExit[1], x: SPOTS.garageExit[0] + 0.5, z: SPOTS.garageExit[1] + 0.5, path: [], task: null });
  // stage 2+: Sam greets you; before that they just come in
  log(st, stageOf(a.bond || 0) >= 2 ? 'Sam: "Hey, I\'m home."' : 'Sam is home from work.', 'npc');
}

function T_social_npcPet() {
  return task('pet', 'Petting Biscuit', [
    {
      follow: 'dog', dur: 3 * MIN, pose: 'pet',
      tick: (st, a, dt) => { st.agents.dog.needs.play = Math.min(100, st.agents.dog.needs.play + (120 * dt) / HOUR); },
    },
  ], { low: true });
}

export function npcThink(st, a) {
  const block = blockAt(st);
  if (a.away) {
    if (!block.away && !block.leave) returnHome(st, a);
    return;
  }
  // Running late? Past 10 minutes after the shift start Sam drops everything (except the toilet).
  const shift = shiftTimes(st);
  if (shift && st.time >= shift.leaveAt + 10 * MIN && st.time < shift.returnAt && !(a.task && a.task.name === 'toilet')) {
    if (a.task) cancelTask(st, a);
    goToWork(st, a, true);
    return;
  }
  // Mandatory blocks pull Sam off anything that isn't busy (you can't be dragged off the toilet).
  const mustLeave = (block.leave || block.away) && !(a.task && (a.task.name === 'leave' || a.task.busy));
  const mustSleep = block.sleep && !block.windDown && a.task && a.task.low;
  if ((mustLeave || mustSleep) && a.task) cancelTask(st, a);
  const urgent = Math.min(a.needs.hunger, a.needs.thirst, a.needs.bladder) < 25;
  if (a.task && !(a.task.low && urgent)) return;
  if (st.time < a.thinkAt && !a.task) return;
  const cands = npcCandidates(st, a);
  if (!cands.length) return;
  cands.sort((x, y) => y.score - x.score);
  const best = cands[0];
  if (a.task) {
    if (best.score < 0.4) return; // not worth interrupting
    cancelTask(st, a);
  }
  a.task = best.make();
  a.thinkAt = st.time + 30;
}

// ---------------------------------------------------------------- dog
// Biscuit's sociability: how often the dog seeks people out.
export const DOG = { askEvery: 2 * HOUR, askFor: 3 * MIN, selfPlay: 25, nearPeople: 0.25, keepAway: 4 };

export function dogThink(st, d) {
  if (d.task) return;
  if (st.time < d.thinkAt) return;
  d.thinkAt = st.time + 20;
  const n = d.needs;
  const room = roomOf(d);

  if (room === 'yard' && !st.backDoorOpen && n.potty > 30) {
    d.waitingAtDoor = true;
    d.task = task('waitOut', 'Wants back inside', [{ tiles: [SPOTS.dogYardWait], pose: 'sit', until: (s) => s.backDoorOpen }], { busy: true });
    return;
  }
  if (n.potty < 30) {
    d.task = task('potty', 'Needs to go out', [
      {
        tiles: room === 'yard' ? [OBJ.pottySpot.slots[0].tile] : [SPOTS.dogDoorWait], pose: 'sit', // beside the door, not on its use slot
        begin: (s, me) => { me.waitingAtDoor = room !== 'yard'; },
        until: (s) => s.backDoorOpen || room === 'yard',
        end: (s, me) => { me.waitingAtDoor = false; },
      },
      { obj: 'pottySpot', dur: 2 * MIN, pose: 'sit', end: (s, me) => { me.needs.potty = 100; } },
      { tiles: SPOTS.dogBackInside, dur: 0 },
    ], { onCancel: (s, me) => { me.waitingAtDoor = false; } });
    d.task.onCancel = (s, me) => { me.waitingAtDoor = false; };
    return;
  }
  if (n.thirst < 55 && st.bowls.water >= 20) {
    d.task = task('drink', 'Drinking', [{ obj: 'waterBowl', dur: 2 * MIN, end: (s, me) => { s.bowls.water = Math.max(0, s.bowls.water - 34); me.needs.thirst = Math.min(100, me.needs.thirst + 50); } }]);
    return;
  }
  if (n.hunger < 55 && st.bowls.food >= 20) {
    d.task = task('eat', 'Eating', [{ obj: 'foodBowl', dur: 3 * MIN, end: (s, me) => { s.bowls.food = Math.max(0, s.bowls.food - 40); me.needs.hunger = Math.min(100, me.needs.hunger + 50); } }]);
    return;
  }
  if ((n.hunger < 30 && st.bowls.food < 20) || (n.thirst < 30 && st.bowls.water < 20)) {
    const bowl = n.thirst < n.hunger ? 'waterBowl' : 'foodBowl';
    d.task = task('beg', bowl === 'waterBowl' ? 'Water bowl is empty' : 'Food bowl is empty', [
      { obj: bowl, pose: 'sit', until: (s, me, t) => t.el > 45 * MIN || s.bowls[bowl === 'waterBowl' ? 'water' : 'food'] >= 20 },
    ]);
    return;
  }
  if (n.energy < 25 || (isNight(st) && n.energy < 95)) {
    d.task = task('sleep', 'Sleeping', [{ obj: 'dogBed', pose: 'lie', begin: (s, me) => { me.asleep = true; }, until: (s, me) => me.needs.energy >= 100 && !isNight(s), end: (s, me) => { me.asleep = false; } }], { busy: true });
    return;
  }
  if (n.play < 40) {
    // Ask you to play at most once every 2 hours, briefly; otherwise go bat the ball around alone.
    if (st.time >= (d.askAt || 0) && !st.agents.player.away) {
      d.askAt = st.time + DOG.askEvery;
      d.task = task('attention', 'Wants to play', [{ follow: 'player', dur: DOG.askFor, pose: 'sit' }], { low: true });
      return;
    }
    if (rand(st) < 0.5) {
      d.task = task('selfPlay', 'Playing with the ball', [{ obj: 'toy', dur: 10 * MIN, tick: (s, me, dt) => { me.needs.play = Math.min(100, me.needs.play + (DOG.selfPlay * dt) / (10 * MIN)); } }], { low: true });
      return;
    }
  }
  // Wander: sometimes into a room someone's in, keeping its distance; mostly anywhere.
  const humans = [st.agents.player, st.agents.npc].filter((h) => !h.asleep && !h.away);
  let tiles;
  if (humans.length && rand(st) < DOG.nearPeople) {
    const h = pick(st, humans);
    tiles = (ROOM_TILES[roomOf(h)] || []).filter(([c, r]) => Math.hypot(c - h.c, r - h.r) >= DOG.keepAway);
    if (!tiles.length) tiles = ROOM_TILES[pick(st, HOUSE_ROOMS)];
  } else {
    const rooms = st.backDoorOpen ? [...HOUSE_ROOMS, 'yard'] : HOUSE_ROOMS;
    tiles = ROOM_TILES[pick(st, rooms)];
  }
  if (tiles.length) d.task = T.wander(st, d, tiles, (3 + rand(st) * 8) * MIN);
}
