// Day and night. The sun rises at 6 and sets at 18; light ramps through dawn and dusk.
// Indoor lights are on in any room where someone is awake while it's dark out.
import { DAY, HOUR, roomOf } from './state.js?v=6cc01f2';

export function sunAt(hour) {
  const elev = Math.sin(((hour - 6) / 12) * Math.PI); // 0 at 6:00, 1 at noon, 0 at 18:00, -1 at midnight
  const light = Math.max(0, Math.min(1, (elev + 0.15) / 0.55)); // twilight ramp around the horizon
  return { elev, light };
}

export const hourOfTime = (t) => (t % DAY) / HOUR;
export const daylight = (st) => sunAt(hourOfTime(st.time)).light;
export const isDark = (st) => daylight(st) < 0.45;

export function litRooms(st) {
  const lit = new Set();
  if (!isDark(st)) return lit;
  for (const a of [st.agents.player, st.agents.npc]) {
    if (a.away || a.asleep) continue;
    const r = roomOf(a);
    if (st.rooms[r]) lit.add(r);
  }
  return lit;
}
