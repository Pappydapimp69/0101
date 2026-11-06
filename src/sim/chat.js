// Conversations with Sam: a fixed length, speech bubbles, and a row of topics.
//
// Sam's needs stay hidden. Whether a topic lands depends on what's going on with Sam right now
// (hungry, just home from work, tired, lonely...), so picking well is how you show you've been
// reading their tells. A topic that misses costs a little, and two misses and Sam wraps the chat
// up early. Deeper topics unlock with the bond.
//
// Each topic DOES something of its own (see TOPIC_EFFECTS below):
//   Small talk  learn what's on Sam's mind (their most pressing hidden need, in words)
//   Their day   fits: Sam vents and feels lighter · otherwise: Sam tells you about tomorrow
//   Food        fits: Sam asks you to cook — a promise; cook within 2 h and Sam eats with you
//   Biscuit     fits: cheers Sam up, and Sam goes to play with the dog afterwards
//   Jokes       fits: you both laugh (mood for both) · misses: it lands badly
//   Work        fits: Sam vents, and if bills are waiting Sam chips in (once a week)
//   Feelings    fits: Sam opens up: a big bond step, and any grudge is gone
//   Plans       fits: a TV night at 8 — a promise; be on the couch together to keep it
import { MIN, HOUR, DAY, log, bump, mulberry, dayOf, addNeed, clamp } from './state.js?v=c409fe6';
import { addBond, stageOf, dominantTell } from './bond.js?v=c409fe6';
import { shiftFor } from './schedule.js?v=c409fe6';
import { unpaid } from './economy.js?v=c409fe6';

// Chat pacing is set for reading in real time: at 1x one real second is 3 game minutes, so these
// are 3x what they were when it was one game minute (a bubble stays up ~2.5 real s).
export const CHAT = {
  minutes: 60, // every chat lasts this long unless someone stops it (~20 real s at 1x)
  topicGap: 9 * MIN, // a topic, then Sam's answer, before the next pick
  replyDelay: 150, // game seconds between your line and Sam's reply (neutral)
  replyFast: 80, // a yes comes fast...
  replySlow: 330, // ...a no comes late (typing dots in between)
  repeatHours: 4, // the same topic again within this is a repeat
  bubbleLife: 7.5 * MIN,
  fillerEvery: 6 * MIN,
  wrapUp: 6 * MIN, // after two misses Sam wraps it up within this
  socialPerHour: 20, // so a full chat still gives +20 social
};

// The eight topics, with what each one is for (shown on the chip).
export const TOPICS = [
  { id: 'small', icon: '👋', name: 'Small talk', stage: 1, what: "find out what's on Sam's mind" },
  { id: 'day', icon: '📅', name: 'Their day', stage: 1, what: 'let Sam vent, or hear about tomorrow' },
  { id: 'food', icon: '🍔', name: 'Food', stage: 1, what: 'offer to cook if Sam is hungry' },
  { id: 'dog', icon: '🐶', name: 'Biscuit', stage: 1, what: 'cheer Sam up when they’re down' },
  { id: 'jokes', icon: '😂', name: 'Jokes', stage: 2, what: 'laugh together, if Sam is in the mood' },
  { id: 'work', icon: '💼', name: 'Work', stage: 3, what: 'let Sam vent; they may help with bills' },
  { id: 'feelings', icon: '💭', name: 'Feelings', stage: 4, what: 'mend things when Sam is low' },
  { id: 'plans', icon: '🗓️', name: 'Plans', stage: 6, what: 'plan a TV night together' },
];
export const PROMISE = { cookHours: 2, tvAt: 20, tvHours: 2, keptCook: 10, keptTv: 12, broken: -5, chipIn: 40 };

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

// Your lines: 4 per topic, picked with a cooldown so you don't repeat yourself either.
const YOU = {
  small: ['How’s it going?', 'Nice day, huh?', 'What’s new?', 'You good?'],
  day: ['How was your day?', 'Rough day?', 'How’d today go?', 'Anything happen today?'],
  food: ['Hungry?', 'What are you in the mood to eat?', 'Eaten yet?', 'Want food?'],
  dog: ['Biscuit was being so goofy today.', 'Look at Biscuit.', 'Biscuit stole a sock again.', 'Did you see Biscuit nap upside down?'],
  jokes: ['Okay, I heard a good one…', 'Want to hear something dumb?', 'Why did the scarecrow win an award?', 'I have a terrible pun for you.'],
  work: ['How’s work going?', 'Busy at work?', 'Work okay?', 'How’s the job treating you?'],
  feelings: ['How are you doing, really?', 'You seem a bit off.', 'Everything alright?', 'You can tell me, you know.'],
  plans: ['Want to do something this weekend?', 'Got any plans?', 'We should do something.', 'Free tonight?'],
};
// Sam's replies: [miss, neutral, fit], 5 lines each (Brain sandbox: 5 per outcome with a cooldown
// pick stops repeats within 30 real minutes). A yes comes fast and bare; a no comes late, padded,
// with a reason (Brain idea: preference organization), so how Sam answers is itself a tell.
const SAM = {
  small: [
    ['Mm. Fine, I guess. Just… not much to say right now.', 'Oh — uh, nothing really. Sorry, I’m kind of out of it.', 'Eh, you know. Same as always, I suppose.', 'Hm? Oh. Fine. Long day, that’s all.', 'I mean… it’s whatever. Nothing to report.'],
    ['Fine, you?', 'Not bad.', 'Can’t complain.', 'Pretty quiet.', 'All good.'],
    ['Good, actually.', 'Great!', 'Really good.', 'Honestly? Happy.', 'Better now.'],
  ],
  day: [
    ['Uh… it was fine. I just don’t really want to rehash it.', 'It was a day off, so… not much to tell, honestly.', 'Mm, nothing happened. I mostly stayed in.', 'Fine. Can we talk about something else? Sorry.', 'Kind of a blur, honestly. I’d rather not.'],
    ['Same old.', 'It was a day.', 'Nothing special.', 'Normal, I guess.', 'Pretty average.'],
    ['Honestly? Long.', 'Ugh. Okay, so…', 'Exhausting.', 'Brutal. Thanks for asking.', 'So much. Let me vent.'],
  ],
  food: [
    ['Mm, not really — I ate a while ago, so I’m good.', 'Oh, I’m okay. Not hungry at all, honestly.', 'Nah… maybe later? Food sounds like a lot right now.', 'I’m full, actually. Thanks though.', 'Not right now. My stomach’s being weird.'],
    ['Eh, maybe later.', 'Could eat.', 'Not yet.', 'Maybe soon.', 'Hmm. Possibly.'],
    ['Starving.', 'Yes. Please.', 'So hungry.', 'Now that you mention it — yes.', 'Famished.'],
  ],
  dog: [
    ['Mm-hm. Cute. Sorry, I’m just distracted right now.', 'Ha. Yeah. He’s… a dog. Sorry, not in the mood.', 'Sure. I mean — yeah, he’s sweet. Anyway.', 'Uh-huh. I’ll say hi later, maybe.', 'Yeah, yeah. He’s fine. I’m just tired.'],
    ['Ha, yeah.', 'Classic Biscuit.', 'Sounds like him.', 'Typical.', 'Ha. Good boy.'],
    ['Aw. That helps.', 'Okay, that made me smile.', 'I love that dog.', 'Best dog.', 'Aw, I needed that.'],
  ],
  jokes: [
    ['…Heh. Sure. Sorry, I’m not really in a laughing mood.', 'Not now, okay? It’s not you, I’m just wiped.', 'Mm. Maybe tell me tomorrow? My head’s full.', 'Ha… yeah. I don’t really get it, sorry.', 'Okay. Uh. I’m gonna pass on jokes tonight.'],
    ['Ha.', 'Heh, okay.', 'Groan.', 'Cute.', 'Ha, fair.'],
    ['Hahaha, stop.', 'Okay, that’s good.', 'I’m crying.', 'Ha! Another.', 'You’re ridiculous.'],
  ],
  work: [
    ['It’s my day off… so I’d rather not think about work, honestly.', 'Can we not? I’m trying to forget it exists today.', 'Uh — I didn’t work today, so… nothing to tell.', 'Work’s work. I don’t really want to get into it.', 'Mm, off today. Let’s talk about anything else.'],
    ['It’s work.', 'Busy.', 'Fine.', 'Same grind.', 'Ongoing.'],
    ['Don’t get me started. Okay, so…', 'Ugh. Long story.', 'My boss, though.', 'Chaos. Total chaos.', 'Okay, listen to this.'],
  ],
  feelings: [
    ['I’m fine. Why? I mean — really, I’m fine, I promise.', 'Huh? I’m good. Did I seem off? Sorry.', 'I’m okay, honestly. You don’t need to worry.', 'All good here. Just a normal day, I swear.', 'Mm, I’m fine. Nothing to unpack, really.'],
    ['I’m okay.', 'Doing alright.', 'Hanging in.', 'Fine, mostly.', 'Okay, I think.'],
    ['…Not great.', 'Thanks for asking. Honestly? Rough.', 'I didn’t think anyone noticed.', 'Can I be honest? Struggling.', 'Yeah. Not okay.'],
  ],
  plans: [
    ['Too tired to think about it, honestly. Maybe another time?', 'Mm… I don’t know. I just want to sit still for a while.', 'Not this week, I think. I’m running on empty.', 'Ugh, plans. Sorry, I can’t think that far ahead.', 'Maybe? Ask me when I’ve slept.'],
    ['Maybe.', 'Possibly.', 'Could be fun.', 'We’ll see.', 'Hmm, maybe.'],
    ['Yes! Let’s.', 'I’m in.', 'Absolutely.', 'Yes. Please.', 'Let’s do it.'],
  ],
};
// Asking the same topic twice: no pool covers a spammer (Brain sandbox), so Sam reacts to the repeat.
const REPEAT = ['You asked me that already.', 'Didn’t we just do this?', 'Same answer as before.', 'Ha — déjà vu.', 'Are you testing me?'];
const FILLER = ['…', 'mm-hm', 'yeah', 'haha', 'right?', 'totally', 'huh'];
const CLOSERS = ['Talk later.', 'Okay, I’m gonna go.', 'Good talk.', 'Anyway — later!'];

const pick = (st, arr) => arr[Math.floor(mulberry(st) * arr.length)];
// Pick a line nobody heard in this list's last (pool - 1) picks (Brain: cooldown pick).
function pickFresh(st, key, arr) {
  if (!st.lineHistory) st.lineHistory = {};
  const recent = st.lineHistory[key] || (st.lineHistory[key] = []);
  const free = arr.map((_, i) => i).filter((i) => !recent.slice(-(arr.length - 1)).includes(i));
  const i = free[Math.floor(mulberry(st) * free.length)];
  recent.push(i);
  if (recent.length > arr.length) recent.shift();
  return arr[i];
}

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
  if (st.time >= c.nextFiller && st.time < c.end - 3 * MIN) {
    c.nextFiller = st.time + CHAT.fillerEvery;
    c.fillerWho = c.fillerWho === 'npc' ? 'player' : 'npc';
    if (!(st.bubbles || []).some((b) => b.from > st.time - 3 * MIN)) say(st, c.fillerWho, pick(st, FILLER));
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
  const repeat = c.picked.includes(id) || (npc.topicAt && npc.topicAt[id] > st.time - CHAT.repeatHours * HOUR);
  c.picked.push(id);
  (npc.topicAt || (npc.topicAt = {}))[id] = st.time;
  say(st, 'player', pickFresh(st, `you:${id}`, YOU[id]));
  if (repeat) {
    // no effect, no bond; it counts toward Sam wrapping up
    say(st, 'npc', pickFresh(st, 'repeat', REPEAT), st.time + CHAT.replyDelay);
    c.misses += 0.5;
    if (c.misses >= 2 && c.end - st.time > CHAT.wrapUp) { c.end = st.time + CHAT.wrapUp; c.wrapUp = true; }
    return null;
  }
  const fit = topicFit(st, npc, id);
  const special = TOPIC_EFFECTS[id] ? TOPIC_EFFECTS[id](st, npc, fit) : null;
  const delay = fit > 0 ? CHAT.replyFast : fit < 0 ? CHAT.replySlow : CHAT.replyDelay;
  say(st, 'npc', special || pickFresh(st, `sam:${id}:${fit}`, SAM[id][fit + 1]), st.time + delay);
  if (fit > 0) { addBond(st, 4, `talked about ${t.name}`); bump(st, npc, 3, 2, 'good talk'); }
  else if (fit === 0) addBond(st, 1, 'small talk');
  else {
    addBond(st, -1, 'awkward topic');
    c.misses += 1;
    if (c.misses >= 2 && c.end - st.time > CHAT.wrapUp) {
      c.end = st.time + CHAT.wrapUp; // Sam wraps it up
      c.wrapUp = true;
    }
  }
  return null;
}

export function endChat(st, conv) {
  say(st, 'npc', conv.wrapUp ? 'Anyway, I should get going.' : pick(st, CLOSERS));
  if (conv.wrapUp) log(st, 'Sam wrapped up the chat early.', 'npc');
}

// ---------------------------------------------------------------- what each topic does
const MIND = {
  hungry: ['Kinda hungry, honestly.', 'Sam seems hungry.'],
  thirsty: ['I could use a drink.', 'Sam seems thirsty.'],
  tired: ['I’m wiped.', 'Sam is tired.'],
  bladder: ['Hold that thought — bathroom.', 'Sam needs the bathroom.'],
  lonely: ['It’s been quiet. Nice to talk.', 'Sam has been lonely.'],
  low: ['Eh. Could be better.', 'Sam is feeling low.'],
  grossed: ['This place could use a clean.', 'The mess is getting to Sam.'],
};
const fmt = (t) => { const h = Math.floor((t % DAY) / HOUR); const m = Math.floor((t % HOUR) / MIN); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

// Each returns Sam's reply (or null for the stock line) and applies its effect.
const TOPIC_EFFECTS = {
  small: (st, npc) => {
    const k = dominantTell(st, npc);
    if (stageOf(npc.bond) < 2 || !k) return null; // a stranger keeps it to "fine"
    log(st, `💡 ${MIND[k][1]}`, 'npc');
    return MIND[k][0];
  },
  day: (st, npc, fit) => {
    if (fit > 0) { bump(st, npc, 6, 4, 'vented about their day'); log(st, 'Sam vented about their day. They seem lighter.', 'npc'); return null; }
    const tomorrow = shiftFor(st.seed, dayOf(st) + 1);
    if (!tomorrow) { log(st, '💡 Sam is off tomorrow.', 'npc'); return 'Day off tomorrow, finally.'; }
    const leave = (dayOf(st)) * DAY + tomorrow.leave * HOUR;
    log(st, `💡 Sam works tomorrow, out around ${fmt(leave)}.`, 'npc');
    return `Back at it tomorrow. Out by ${fmt(leave)}.`;
  },
  food: (st, npc, fit) => {
    if (fit <= 0 || st.promise) return null;
    st.promise = { kind: 'cook', until: st.time + PROMISE.cookHours * HOUR, text: 'Cook a meal for Sam' };
    log(st, `📌 You offered to cook. Make a meal by ${fmt(st.promise.until)} and Sam will eat with you.`, 'player');
    return 'Starving. Would you cook something?';
  },
  dog: (st, npc, fit) => {
    if (fit <= 0) return null;
    bump(st, npc, 6, 3, 'talked about Biscuit');
    npc.petAfterChat = true;
    log(st, 'Talking about Biscuit cheered Sam up. They want to go see the dog.', 'npc');
    return null;
  },
  jokes: (st, npc, fit) => {
    if (fit > 0) { bump(st, npc, 6, 3, 'laughed together'); bump(st, st.agents.player, 6, 3, 'laughed together'); log(st, 'You two cracked each other up.', 'player'); }
    if (fit < 0) bump(st, npc, -4, 2, 'joke fell flat');
    return null;
  },
  work: (st, npc, fit) => {
    if (fit <= 0) return null;
    const week = Math.floor((dayOf(st) - 1) / 7);
    const owed = unpaid(st).reduce((x, b) => x + b.amount, 0);
    if (owed > 0 && npc.chippedWeek !== week) {
      npc.chippedWeek = week;
      const amt = Math.min(PROMISE.chipIn, Math.round(owed));
      st.money = Math.round((st.money + amt) * 100) / 100;
      log(st, `💵 Sam chipped in $${amt} toward the bills.`, 'npc');
      return 'Ugh, work. Hey — let me put something toward the bills.';
    }
    bump(st, npc, 4, 3, 'vented about work');
    return null;
  },
  feelings: (st, npc, fit) => {
    if (fit > 0) {
      addBond(st, 4, 'opened up'); // on top of the usual fit bonus
      npc.grudge = 0;
      addNeed(npc, 'social', 15);
      bump(st, npc, 6, 6, 'felt heard');
      log(st, 'Sam opened up to you. Whatever was between you is gone.', 'npc');
    } else if (fit < 0) bump(st, npc, -3, 2, 'pried');
    return null;
  },
  plans: (st, npc, fit) => {
    if (fit <= 0 || st.promise) return null;
    const d0 = Math.floor(st.time / DAY) * DAY;
    let at = d0 + PROMISE.tvAt * HOUR;
    if (st.time > at - HOUR) at += DAY; // too late for tonight: tomorrow
    st.promise = { kind: 'tv', at, until: at + PROMISE.tvHours * HOUR, text: 'TV night with Sam' };
    log(st, `📌 TV night with Sam at ${fmt(at)}${at - d0 >= DAY ? ' tomorrow' : ''}. Be on the couch together.`, 'player');
    return `TV night? ${fmt(at).replace(':00', '')}${at - d0 >= DAY ? ' tomorrow' : ''}. Don’t flake.`;
  },
};

// ---------------------------------------------------------------- promises
// The on-screen pill: what you promised and how long is left (Brain od76#E23: keep a pending
// thing visible with a countdown). Deadlines are fixed clock times, so the countdown is exact.
const left = (sec) => { const m = Math.max(0, Math.ceil(sec / MIN)); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
export function promisePill(st) {
  const p = st.promise;
  if (!p) return null;
  if (p.kind === 'cook') return { text: `Cook for Sam`, time: `${left(p.until - st.time)} left`, urgent: p.until - st.time < 30 * MIN };
  if (st.time < p.at) return { text: `TV night with Sam ${fmt(p.at)}`, time: `in ${left(p.at - st.time)}`, urgent: false };
  return { text: 'TV night — couch, now', time: `${left(p.until - st.time)} left`, urgent: true };
}

export function promiseText(st) {
  const p = st.promise;
  if (!p) return '';
  return p.kind === 'cook' ? `${p.text} by ${fmt(p.until)}` : `${p.text}, ${fmt(p.at)}–${fmt(p.until)}`;
}

function keep(st, bond, msg) {
  const npc = st.agents.npc;
  addBond(st, bond, 'kept a promise');
  bump(st, npc, 8, 6, 'you kept your word');
  log(st, msg, 'npc');
  st.promise = null;
}

// The player cooked: a promised meal is shared (Sam gets a plate).
export function cookedMeal(st, a) {
  if (a.id !== 'player' || !st.promise || st.promise.kind !== 'cook') return;
  st.plateForSam = true;
  keep(st, PROMISE.keptCook, '💛 You cooked for Sam like you said. There’s a plate waiting for them.');
}

// Once a step: TV night kept when you're both watching; any promise past its time is broken.
export function promiseTick(st) {
  const p = st.promise;
  if (!p) return;
  const you = st.agents.player;
  const npc = st.agents.npc;
  if (p.kind === 'tv' && st.time >= p.at && st.time < p.until &&
      you.task && you.task.name === 'tv' && npc.task && npc.task.name === 'tv' && you.task.phase === 'act' && npc.task.phase === 'act') {
    bump(st, you, 8, 6, 'TV night with Sam');
    keep(st, PROMISE.keptTv, '💛 TV night with Sam, like you planned.');
    return;
  }
  if (st.time >= p.until) {
    st.promise = null;
    addBond(st, PROMISE.broken, 'broke a promise');
    bump(st, npc, -5, 6, 'you flaked');
    log(st, p.kind === 'cook' ? 'Sam waited for that meal. It never came.' : 'Sam sat through TV night alone.', 'npc');
  }
}
