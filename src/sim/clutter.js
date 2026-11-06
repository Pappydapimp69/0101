// Clutter: cleaning tools left lying around.
//
// Rules (from the owner):
// - A put-down broom or mop lands on the floor in open space, and stands upright against a wall.
// - A broom/mop lying on the floor is clutter. Any broom/mop/bucket a person can see (same room,
//   awake, home) is clutter too.
// - A mop and a bucket count as two items, but a mop standing in its bucket counts as one.
// - A broom in the same room as both a mop and a bucket counts half: it's a cleaning corner.
// Effect: every clutter unit in the room you're in lowers your mood target, and clutter makes the
// room it's in dirty a little faster.
import { roomAt, DOOR_EDGES, edgeKey, COLS, ROWS } from './map.js?v=e1e5bd1';
import { walkable } from './path.js?v=e1e5bd1';
import { roomOf } from './state.js?v=e1e5bd1';

export const CLUTTER = { moodPerUnit: -3, dirtPerUnit: 0.5 };
const LEANS = new Set(['broom', 'mop']); // long-handled tools: lie down or lean up
const COUNTS = new Set(['broom', 'mop', 'bucket']);

// Against a wall: some side of the tile is a wall (another room with no doorway, or outside).
export function againstWall(c, r) {
  const here = roomAt(c, r);
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nc = c + dc;
    const nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) return true;
    const there = roomAt(nc, nr);
    if (there === here) continue;
    if (!DOOR_EDGES.has(edgeKey(c, r, nc, nr))) return true;
  }
  return false;
}

// Where a dropped tool ends up: upright against a wall, otherwise flat on the floor. A mop put
// down on its bucket's tile stands in the bucket.
export function settle(st, tool) {
  tool.inBucket = false;
  if (tool.kind === 'mop') {
    const b = Object.values(st.tools).find((t) => t.kind === 'bucket' && !t.carriedBy && t.c === tool.c && t.r === tool.r);
    if (b) { tool.inBucket = true; tool.upright = true; return; }
  }
  if (tool.kind === 'bucket') {
    const m = Object.values(st.tools).find((t) => t.kind === 'mop' && !t.carriedBy && t.c === tool.c && t.r === tool.r);
    if (m) { m.inBucket = true; m.upright = true; }
  }
  tool.upright = LEANS.has(tool.kind) ? againstWall(tool.c, tool.r) || !walkable(tool.c, tool.r) : true;
}

// Clutter units per room, plus each counted item (for the HUD and tests).
export function clutterByRoom(st) {
  const seen = new Set();
  for (const a of [st.agents.player, st.agents.npc]) if (!a.away && !a.asleep) seen.add(roomOf(a));
  const out = {};
  const items = Object.values(st.tools).filter((t) => !t.carriedBy && COUNTS.has(t.kind));
  const inRoom = (room, kind) => items.some((t) => t.kind === kind && roomAt(t.c, t.r) === room);
  for (const t of items) {
    const room = roomAt(t.c, t.r);
    if (!room) continue;
    if (t.kind === 'mop' && t.inBucket) continue; // mop in its bucket: the bucket counts for both
    const onFloor = LEANS.has(t.kind) && !t.upright;
    if (!onFloor && !seen.has(room)) continue;
    let units = 1;
    if (t.kind === 'broom' && inRoom(room, 'mop') && inRoom(room, 'bucket')) units = 0.5;
    const r = out[room] || (out[room] = { units: 0, items: [] });
    r.units += units;
    r.items.push({ id: t.id, units, onFloor });
  }
  return out;
}
