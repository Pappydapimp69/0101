// Satisfaction: the slow, hidden score of how your player's life is going.
//
// Mood moves in minutes; satisfaction follows mood over days. It is never shown as a number.
// It is expressed: as it falls, the colour drains from the world toward greyscale and the walls
// grow taller around you. There is no game-over screen. The player fails when it gets too hard
// and they give up.
//
// Climbing back is faster than sinking (small wins count for more when you're low), so giving up
// stays a choice and the house visibly recovers as you do.
import { HOUR, clamp } from './state.js?v=4365653';

export const SAT = {
  start: 70,
  fallHours: 36, // time constant while sinking: a bad hour does nothing, a bad week shows
  riseHours: 20, // time constant while climbing back
  fullAt: 60, // at or above: full colour, normal walls
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
