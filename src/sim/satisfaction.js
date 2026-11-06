// Satisfaction: the slow, hidden score of how your player's life is going.
//
// Mood moves in minutes; satisfaction follows mood over days. It is never shown as a number.
// It is expressed: as it falls, the colour drains from the world toward greyscale and the walls
// grow taller around you. There is no game-over screen. The player fails when it gets too hard
// and they give up.
//
// Climbing back is faster than sinking (small wins count for more when you're low), so giving up
// stays a choice and the house visibly recovers as you do.
import { HOUR, clamp } from './state.js?v=e2f1385';

export const SAT = {
  start: 70,
  fallHours: 36, // time constant while sinking: a bad hour does nothing, a bad week shows
  riseHours: 20, // time constant while climbing back
  // Measured (tools/good-player-measure.mjs): a player who keeps needs at 50-80, the house clean and
  // bills paid sits at mood 48-54 / satisfaction 49-56; one who only reacts at the 20% alert line sits
  // at 14-20. The first guess (60) greyed good play 100% of the time, so the line sits between them.
  fullAt: 40, // at or above: full colour, normal walls
  bottomAt: 10, // at or below: greyscale, walls at their tallest
};

export function initSatisfaction(st) {
  st.satisfaction = SAT.start;
}

export function satisfactionTick(st, dt) {
  const mood = st.agents.player.mood;
  const tau = (mood > st.satisfaction ? SAT.riseHours : SAT.fallHours) * HOUR;
  st.satisfaction = clamp(st.satisfaction + (mood - st.satisfaction) * (dt / tau));
}

// 0 = fine, 1 = rock bottom. The renderer reads this.
export function despair(st) {
  const s = st.satisfaction ?? SAT.start;
  return Math.max(0, Math.min(1, (SAT.fullAt - s) / (SAT.fullAt - SAT.bottomAt)));
}
