// Conversations with Sam: a fixed length, speech bubbles, and a wheel of topics.
//
// Sam's needs stay hidden. Whether a topic lands depends on what's going on with Sam right now
// (hungry, just home from work, tired, lonely...), so picking well is how you show you've been
// reading their tells. A topic that fits lifts the bond and Sam's mood; one that misses costs a
// little, and two misses and Sam wraps the chat up early. Deeper topics unlock with the bond.
import { MIN, HOUR, log, bump, mulberry, dayOf } from './state.js?v=f56e121';
import { addBond, stageOf, dominantTell } from './bond.js?v=f56e121';
import { shiftFor } from './schedule.js?v=f56e121';

export const CHAT = {
  minutes: 20, // every chat lasts this long unless someone stops it
  topicGap: 3 * MIN, // a topic, then Sam's answer, before the next pick
  replyDelay: 50, // game seconds between your line and Sam's reply
  bubbleLife: 2.5 * MIN,
  fillerEvery: 2 * MIN,
};

// Eight fixed wheel slots (clockwise from the top).
export const TOPICS = [
  { id: 'small', icon: '👋', name: 'Small talk', stage: 1 },
  { id: 'day', icon: '📅', name: 'Their day', stage: 1 },
  { id: 'food', icon: '🍔', name: 'Food', stage: 1 },
  { id: 'dog', icon: '🐶', name: 'Biscuit', stage: 1 },
  { id: 'jokes', icon: '😂', name: 'Jokes', stage: 2 },
  { id: 'work', icon: '💼', name: 'Work', stage: 3 },
  { id: 'feelings', icon: '💭', name: 'Feelings', stage: 4 },
  { id: 'plans', icon: '🗓️', name: 'Plans', stage: 6 },
];

// +1 the topic fits what's going on with Sam, 0 neutral, -1 it misses.
export function topicFit(st, npc, id) {
  const n = npc.needs;
  const tell = dominantTell(st, npc);
  const justHome = npc.homeAt && st.time - npc.homeAt < 2 * HOUR;
  const workedToday = !!shiftFor(st.seed, dayOf(st));
  switch (id) {
    case 'small': return 0;
    case 'day': return justHome || tell === 'tired' ? 1 : 0;
    case 'food': return tell === 'hungry' || n.hunger < 45 ? 1 : 0;
    case 'dog': return tell === 'low' || tell === 'lonely' ? 1 : 0;
    case 'jokes': return npc.mood < 40 || tell === 'tired' ? -1 : npc.mood >= 60 ? 1 : 0;
    case 'work': return workedToday ? (justHome ? 1 : 0) : -1;
    case 'feelings': return tell === 'low' || tell === 'lonely' ? 1 : npc.mood >= 65 ? -1 : 0;
    case 'plans': return n.energy >= 50 && npc.mood >= 55 ? 1 : tell === 'tired' ? -1 : 0;
    default: return 0;
  }
}

const YOU = {
  small: ['How’s it going?', 'Nice day, huh?'], day: ['How was your day?', 'Rough day?'],
  food: ['Hungry?', 'What are you in the mood to eat?'], dog: ['Biscuit was being so goofy today.', 'Look at Biscuit.'],
  jokes: ['Okay, I heard a good one…', 'Want to hear something dumb?'], work: ['How’s work going?', 'Busy at work?'],
  feelings: ['How are you doing, really?', 'You seem a bit off.'], plans: ['Want to do something this weekend?', 'Got any plans?'],
};
// Sam's replies: [miss, neutral, fit]. At low bond Sam stays guarded, so fits read shorter.
const SAM = {
  small: [['Mm.'], ['Fine, you?', 'Not bad.'], ['Good, actually.']],
  day: [['It was fine.'], ['Same old.', 'It was a day.'], ['Honestly? Long.', 'Ugh, don’t ask. Okay, ask.']],
  food: [['Not hungry.'], ['Eh, maybe later.'], ['Starving, actually.', 'Now that you mention it…']],
  dog: [['Mm-hm.'], ['Ha, yeah.'], ['Aw. That helps.', 'Okay that made me smile.']],
  jokes: [['…Not now.', 'Heh. Sure.'], ['Ha.'], ['Hahaha, stop.', 'Okay, that’s good.']],
  work: [['It’s my day off…', 'Can we not?'], ['It’s work.'], ['Don’t get me started. Okay, so…']],
  feelings: [['I’m fine. Why?'], ['I’m okay.'], ['…Thanks for asking. Not great.', 'I didn’t think anyone noticed.']],
  plans: [['Too tired to think about it.'], ['Maybe.'], ['Yes! Let’s do something.']],
};
const FILLER = ['…', 'mm-hm', 'yeah', 'haha', 'right?', 'totally', 'huh'];
const CLOSERS = ['Talk later.', 'Okay, I’m gonna go.', 'Good talk.', 'Anyway — later!'];

const pick = (st, arr) => arr[Math.floor(mulberry(st) * arr.length)];

export function say(st, who, text, from = st.time) {
  if (!st.bubbles) st.bubbles = [];
  st.bubbles = st.bubbles.filter((b) => b.who !== who || b.from > from); // one bubble per speaker
  st.bubbles.push({ who, text, from, until: from + CHAT.bubbleLife });
}

export function startChat(st, conv) {
  conv.start = st.time;
  conv.end = st.time + CHAT.minutes * MIN;
  conv.nextTopicAt = st.time;
  conv.nextFiller = st.time + CHAT.fillerEvery;
  conv.misses = 0;
  conv.picked = [];
  say(st, conv.a, conv.a === 'npc' ? 'Hey, got a sec?' : 'Hey!');
}

export function chatTick(st) {
  const c = st.conv;
  if (st.bubbles) st.bubbles = st.bubbles.filter((b) => b.until > st.time);
  if (!c) return;
  // filler chatter between topics, alternating speakers
  if (st.time >= c.nextFiller && st.time < c.end - MIN) {
    c.nextFiller = st.time + CHAT.fillerEvery;
    c.fillerWho = c.fillerWho === 'npc' ? 'player' : 'npc';
    if (!(st.bubbles || []).some((b) => b.from > st.time - MIN)) say(st, c.fillerWho, pick(st, FILLER));
  }
}

export function topicUnlocked(npc, t) { return stageOf(npc.bond) >= t.stage; }

// Player picks a topic from the wheel. Returns a short reason when it can't be picked.
export function chooseTopic(st, id) {
  const c = st.conv;
  const npc = st.agents.npc;
  const t = TOPICS.find((x) => x.id === id);
  if (!c || !t) return 'not chatting';
  if (!topicUnlocked(npc, t)) return 'locked';
  if (st.time < c.nextTopicAt) return 'wait';
  c.nextTopicAt = st.time + CHAT.topicGap;
  c.picked.push(id);
  const fit = topicFit(st, npc, id);
  say(st, 'player', pick(st, YOU[id]));
  say(st, 'npc', pick(st, SAM[id][fit + 1]), st.time + CHAT.replyDelay);
  if (fit > 0) { addBond(st, 4, `talked about ${t.name}`); bump(st, npc, 3, 2, 'good talk'); }
  else if (fit === 0) addBond(st, 1, 'small talk');
  else {
    addBond(st, -1, 'awkward topic');
    c.misses += 1;
    if (c.misses >= 2 && c.end - st.time > 2 * MIN) {
      c.end = st.time + 2 * MIN; // Sam wraps it up
      c.wrapUp = true;
    }
  }
  return null;
}

export function endChat(st, conv) {
  say(st, 'npc', conv.wrapUp ? 'Anyway, I should get going.' : pick(st, CLOSERS));
  if (conv.wrapUp) log(st, 'Sam wrapped up the chat early.', 'npc');
}
