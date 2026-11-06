// First-time hints: a passive tracker over the real game (Brain opticon#E48). Each row is the
// hint's text and the condition that shows it, in one table, so they can't drift apart. Each
// shows once, as a 💡 toast, the first time its condition holds. Nothing is gated or paused.
//
// The fading colour and rising walls are the invisible fail state by design, so their hint stays
// in the fiction (a feeling), never a meter.
import { log } from './state.js';
import { MOP, isHard } from './mopping.js';
import { despair } from './satisfaction.js';

const holding = (st, kind) => {
  const c = st.agents.player.carrying;
  return !!(c && c.kind === 'tool' && st.tools[c.id].kind === kind);
};

export const HINTS = [
  {
    id: 'mop',
    when: (st) => holding(st, 'mop') || holding(st, 'bucket'),
    text: 'The mop needs its bucket in the same room, filled at a sink (water + detergent). Click the bucket with the mop in hand to rinse it.',
  },
  {
    id: 'grime',
    when: (st) => Object.entries(st.rooms).some(([id, r]) => isHard(id) && (r.grime || 0) >= 20),
    text: 'Hard floors gather grime as well as dust. The broom only lifts dust; grime needs the mop. The Cleanliness panel shows both.',
  },
  {
    id: 'dirtyMop',
    when: (st) => st.tools.mop && st.tools.mop.dirt >= MOP.dirtyMopAt,
    text: 'A dirty mop just pushes grime around. Rinse it in the bucket; each rinse costs the water 10% of its freshness.',
  },
  {
    id: 'staleWater',
    when: (st) => st.tools.bucket && st.tools.bucket.water && st.tools.bucket.fresh < MOP.staleBelow,
    text: 'The mop water is going stale. Floors mopped with it smell, and Sam notices. Dump and refill it at a sink.',
  },
  {
    id: 'laundry',
    when: (st) => st.laundry && st.laundry.clean <= 2,
    text: 'You’re running low on clean clothes. Wash a load in the laundry room (washer, then dryer, then fold). A wet load left in the washer overnight-and-then-some goes musty.',
  },
  {
    id: 'chat',
    when: (st) => !!(st.conv && (st.conv.a === 'player' || st.conv.b === 'player')),
    text: 'Pick topics that fit what Sam is going through. A quick, short answer means it landed; a slow one with excuses means it didn’t.',
  },
  {
    id: 'promise',
    when: (st) => !!st.promise,
    text: 'You made Sam a promise. It sits above the action bar with the time left. Sam remembers kept ones, and broken ones.',
  },
  {
    id: 'flat',
    when: (st) => despair(st) > 0.15,
    text: 'You’ve been feeling flat lately. A few good days, looking after yourself, would help.',
  },
];

// Called every 10 game seconds.
export function hintTick(st) {
  if (!st.hintsShown) st.hintsShown = {};
  for (const h of HINTS) {
    if (st.hintsShown[h.id] || !h.when(st)) continue;
    st.hintsShown[h.id] = st.time;
    log(st, `💡 ${h.text}`, 'hint');
    return; // one at a time, so they don't pile up in the toast queue
  }
}
