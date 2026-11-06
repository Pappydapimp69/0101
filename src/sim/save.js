// Save / load. The whole sim state is plain data except the agents' running tasks (closures), so a
// save drops what can't be written down (tasks, paths, the chat in progress, slot claims) and the AI
// and player simply pick up again on load. Everything that matters is kept: time, needs, mood, bond,
// grudge, money, bills, rooms, tools, promises, hints already shown, and the RNG's full state
// (Brain seven#E48: save the generator's state words, never a seed and a roll count).
import { createState } from './sim.js?v=185d140';
import { clutterByRoom } from './clutter.js?v=185d140';

export const SAVE_VERSION = 1;

export function serialize(st) {
  const data = JSON.parse(JSON.stringify(st, (k, v) => (typeof v === 'function' ? undefined : v)));
  for (const a of Object.values(data.agents)) {
    a.task = null;
    a.path = [];
    a.drawAt = null;
    a.pose = 'stand';
    a.asleep = false; // a sleeper with no sleep task would never wake; the AI or player lies down again
  }
  data.conv = null;
  data.bubbles = [];
  data.claims = {};
  return JSON.stringify({ v: SAVE_VERSION, at: Date.now(), state: data });
}

// Returns a live state, or null if the text isn't a usable save.
export function deserialize(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (!parsed || parsed.v !== SAVE_VERSION || !parsed.state || !parsed.state.agents) return null;
  const saved = parsed.state;
  const st = createState(saved.seed || 1); // fresh structure; then the saved data on top
  for (const [k, v] of Object.entries(saved)) {
    if (k === 'agents') continue;
    st[k] = v;
  }
  for (const [id, a] of Object.entries(saved.agents)) {
    if (st.agents[id]) Object.assign(st.agents[id], a);
  }
  st.clutter = clutterByRoom(st);
  return st;
}

// Browser storage, namespaced: every GitHub Pages project of one account shares ONE origin, so a bare
// key would collide with the owner's other games (Brain seven#E5). Every access is wrapped: storage can
// throw in private windows and embedded views (Brain collective#E9).
export const SAVE_KEY = '0101:save:v1';
export function writeSave(storage, st) {
  try { storage.setItem(SAVE_KEY, serialize(st)); return true; } catch { return false; }
}
export function readSave(storage) {
  try { const t = storage.getItem(SAVE_KEY); return t ? deserialize(t) : null; } catch { return null; }
}
export function clearSave(storage) {
  try { storage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
}
