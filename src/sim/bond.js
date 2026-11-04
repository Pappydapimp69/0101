// Bond with Sam, and Sam's tells.
//
// Sam's needs are hidden. What you can see is behaviour (tells): yawns, slow walking, staring into
// the fridge, hanging around the room you're in, sighing at mess. Bond grows when you read those
// right — talking when Sam is open to it, keeping them company, cleaning the room they're in — and
// each of its 10 stages lets the two of you communicate a little more, until Sam tells you plainly
// what they need and asks about you.
import { HOUR, MIN, log, roomOf, mulberry } from './state.js?v=95b4a34';
import { effectiveClean } from './mopping.js?v=95b4a34';

export const BOND_MAX = 1000;
export const STAGES = [
  { name: 'Stranger', unlock: 'Sam keeps to themself. You only have their body language to go on.' },
  { name: 'Housemate', unlock: 'Sam says hello when they get home.' },
  { name: 'Acquaintance', unlock: 'When Sam turns you down, they say why.' },
  { name: 'Familiar', unlock: 'Sam tells you their work days for the week.' },
  { name: 'Friendly', unlock: "You can tell Sam's mood at a glance." },
  { name: 'Friend', unlock: 'Sam tells you when something is wrong ("I\'m starving").' },
  { name: 'Close friend', unlock: 'Sam is patient with you even on a bad day.' },
  { name: 'Trusted', unlock: 'Sam notices what you need and says so. You can see their whole day.' },
  { name: 'Confidant', unlock: 'Sam makes time for you: they seek you out sooner.' },
  { name: 'Family', unlock: 'No more guessing. You know what Sam needs, and they know what you need.' },
];
export const stageOf = (bond) => Math.min(STAGES.length, 1 + Math.floor(Math.max(0, bond) / 100));
export const stageProgress = (bond) => (Math.min(bond, BOND_MAX - 1e-9) % 100) / 100;

export const BOND = {
  chat: 12, // a conversation Sam was open to
  samStartedChat: 6, // extra when Sam came to you
  cutoff: -2, // reading Sam wrong costs a little — it is still exposure, never a spiral
  company: 2, // per game hour in the same room, both awake, Sam not at work
  cleanForSam: 6, // cleaning a room Sam is in while it's dirty
  fadePerHour: 0.5, // slow fade; never below the start of a stage you've held for a day (see floor)
};

export function initBond(npc) {
  npc.bond = 0;
  npc.bondFloor = 0;
  npc.stageSince = 0;
  npc.tell = null;
  npc.tellAt = 0;
}

export function addBond(st, delta, why) {
  const npc = st.agents.npc;
  const before = stageOf(npc.bond);
  npc.bond = Math.max(npc.bondFloor, Math.min(BOND_MAX, npc.bond + delta));
  const after = stageOf(npc.bond);
  if (after > before) {
    npc.stageSince = st.time;
    log(st, `💛 You and Sam are closer — ${STAGES[after - 1].name}. ${STAGES[after - 1].unlock}`, 'npc');
  } else if (after < before) {
    log(st, `You and Sam have drifted a little — ${STAGES[after - 1].name}.`, 'npc');
  }
  if (why) npc.lastBondWhy = why;
}

// Once per sim step.
export function bondTick(st, dt) {
  const npc = st.agents.npc;
  const p = st.agents.player;
  const stage = stageOf(npc.bond);
  // A stage held for a full game day becomes a floor (bond can fade within it, not below it).
  if (st.time - npc.stageSince > 24 * HOUR) npc.bondFloor = Math.max(npc.bondFloor, (stage - 1) * 100);
  let d = -BOND.fadePerHour * (dt / HOUR);
  if (!npc.away && !npc.asleep && !p.asleep && roomOf(npc) === roomOf(p)) d += BOND.company * (dt / HOUR);
  if (d) {
    const was = stageOf(npc.bond);
    npc.bond = Math.max(npc.bondFloor, Math.min(BOND_MAX, npc.bond + d));
    if (stageOf(npc.bond) !== was) addBond(st, 0); // announce crossings
  }
  tellTick(st, npc);
}

// --------------------------------------------------------------------------- tells
// What Sam's hidden needs look like from the outside. One tell at a time, shown for a short while.
const TELLS = {
  tired: { text: ['*yawns*', '*rubs eyes*', '*stretches*'], pose: 'yawn' },
  hungry: { text: ['*stomach growls*', '*peers into the fridge*', '*checks the time*'] },
  thirsty: { text: ['*clears throat*', '*licks lips*'] },
  lonely: { text: ['*glances over at you*', '*hovers nearby*', '*hums to themself*'] },
  bladder: { text: ['*fidgets*', '*shifts from foot to foot*'] },
  grossed: { text: ['*sighs at the mess*', '*wrinkles nose*'] },
  low: { text: ['*quiet*', '*stares at nothing*', '*long breath out*'] },
};

// The most pressing hidden state, as Sam's body shows it.
export function dominantTell(st, npc) {
  const n = npc.needs;
  const env = st.rooms[roomOf(npc)] ? effectiveClean(st, roomOf(npc)) : 80;
  const c = [
    ['bladder', n.bladder < 25 ? 30 - n.bladder : 0],
    ['tired', n.energy < 35 ? 40 - n.energy : 0],
    ['hungry', n.hunger < 40 ? 45 - n.hunger : 0],
    ['thirsty', n.thirst < 35 ? 38 - n.thirst : 0],
    ['grossed', env < 35 ? 38 - env : 0],
    ['lonely', n.social < 50 ? 52 - n.social : 0],
    ['low', npc.mood < 35 ? 38 - npc.mood : 0],
  ].sort((a, b) => b[1] - a[1]);
  return c[0][1] > 0 ? c[0][0] : null;
}

function tellTick(st, npc) {
  if (npc.away || npc.asleep) { npc.tell = null; return; }
  if (npc.tell && st.time > npc.tell.until) npc.tell = null;
  if (st.time < npc.tellAt) return;
  npc.tellAt = st.time + (25 + mulberry(st) * 30) * MIN; // a tell every 25-55 game minutes
  const kind = dominantTell(st, npc);
  if (!kind) return;
  const p = st.agents.player;
  const stage = stageOf(npc.bond);
  if (roomOf(p) === roomOf(npc) && !p.asleep) {
    const notice = stage >= 8 && mulberry(st) < 0.35 ? samNotices(st) : null;
    const say = !notice && stage >= 6 && mulberry(st) < 0.5 ? samSays(st, npc) : null;
    if (notice || say) log(st, notice || say, 'npc');
  }
  const t = TELLS[kind];
  npc.tell = { kind, text: t.text[Math.floor(mulberry(st) * t.text.length)], pose: t.pose || null, until: st.time + 6 * MIN };
}

// The reason Sam gives for "not now" once you're close enough to be told (stage 3+).
const REASONS = {
  tired: "I'm wiped.", hungry: "I haven't eaten.", thirsty: 'I need a drink first.', bladder: 'Hang on, bathroom.',
  grossed: "This place is getting to me.", lonely: "Sorry, it's been a long day.", low: "I'm just not in a good place.",
};
export function refusalLine(st, npc) {
  const stage = stageOf(npc.bond);
  if (stage < 3) return null;
  const kind = dominantTell(st, npc) || 'low';
  return `Sam: "Not now — ${REASONS[kind]}"`;
}

// Stage 6+: Sam says it outright, now and then.
const SAYS = {
  tired: "I'm so tired.", hungry: "I'm starving — want to cook?", thirsty: "I'm parched.", lonely: 'Hey — got a minute to talk?',
  grossed: 'Can we clean up a bit?', low: "Rough day. Can you just hang out?", bladder: null,
};
export function samSays(st, npc) {
  const kind = dominantTell(st, npc);
  return kind && SAYS[kind] ? `Sam: "${SAYS[kind]}"` : null;
}

// Stage 8+: Sam notices your most pressing need.
const NOTICES = {
  hunger: 'You look hungry — eat something?', thirst: 'Drink some water, you look parched.',
  energy: 'You look exhausted. Get some sleep.', social: "You've been on your own a lot. Want to talk?",
  bladder: null,
};
export function samNotices(st) {
  const p = st.agents.player;
  let worst = null;
  for (const k of ['hunger', 'thirst', 'energy', 'social']) if (p.needs[k] < 30 && (!worst || p.needs[k] < p.needs[worst])) worst = k;
  return worst && NOTICES[worst] ? `Sam: "${NOTICES[worst]}"` : null;
}
