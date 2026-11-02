import { COLS, ROWS, roomAt, OBJECTS, DOOR_EDGES, edgeKey } from './map.js?v=1de2173';

// Static walkability: a tile is walkable if it belongs to a room and no solid furniture sits on it.
const solid = new Uint8Array(COLS * ROWS);
for (const o of OBJECTS) {
  if (!o.solid) continue;
  const [c0, r0, w, h] = o.rect;
  for (let c = c0; c < c0 + w; c++) for (let r = r0; r < r0 + h; r++) solid[r * COLS + c] = 1;
}

export const idx = (c, r) => r * COLS + c;
export function walkable(c, r) {
  return roomAt(c, r) !== null && !solid[idx(c, r)];
}
export const isSolid = (c, r) => !!solid[idx(c, r)];

// Can an agent step from (c1,r1) to the orthogonal neighbour (c2,r2)?
export function canStep(st, kind, c1, r1, c2, r2) {
  if (!walkable(c2, r2)) return false;
  const ra = roomAt(c1, r1);
  const rb = roomAt(c2, r2);
  if (ra === rb) return true;
  const door = DOOR_EDGES.get(edgeKey(c1, r1, c2, r2));
  if (!door) return false;
  // Humans open the back door as they pass; the dog needs it left open.
  if (door.id === 'backDoor' && kind === 'dog' && !st.backDoorOpen) return false;
  return true;
}

// One move of (dc, dr) from (c, r): orthogonal moves may cross doorways; diagonals stay
// inside one room and never cut a corner.
export function canMove(st, kind, c, r, dc, dr) {
  const nc = c + dc;
  const nr = r + dr;
  if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) return false;
  if (dc && dr) {
    const rm = roomAt(c, r);
    if (roomAt(nc, nr) !== rm || roomAt(c + dc, r) !== rm || roomAt(c, r + dr) !== rm) return false;
    return walkable(nc, nr) && walkable(c + dc, r) && walkable(c, r + dr);
  }
  return canStep(st, kind, c, r, nc, nr);
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

// Dijkstra from a start tile over the whole (tiny) grid. Returns { dist, prev }.
export function flood(st, kind, c0, r0) {
  const N = COLS * ROWS;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  dist[idx(c0, r0)] = 0;
  // N is ~650, so an O(N^2) scan is cheaper than a heap here.
  for (;;) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; best = i; }
    if (best < 0) break;
    done[best] = 1;
    const c = best % COLS;
    const r = (best / COLS) | 0;
    for (const [dc, dr, w] of DIRS) {
      if (!canMove(st, kind, c, r, dc, dr)) continue;
      const nc = c + dc;
      const nr = r + dr;
      const ni = idx(nc, nr);
      const nd = bd + w;
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = best; }
    }
  }
  return { dist, prev };
}

function unwind(prev, target) {
  const out = [];
  for (let i = target; i >= 0; i = prev[i]) out.push([i % COLS, (i / COLS) | 0]);
  out.reverse();
  out.shift(); // drop the start tile
  return out;
}

// Tiles from which an agent can reach `tile`: the tile itself if walkable, else its walkable neighbours.
export function approachTiles(c, r) {
  if (walkable(c, r)) return [[c, r]];
  const out = [];
  for (const [dc, dr] of DIRS.slice(0, 4)) if (walkable(c + dc, r + dr)) out.push([c + dc, r + dr]);
  return out;
}

// Path (list of tiles, excluding start) from agent tile to the nearest of `goals`. null if unreachable.
export function pathTo(st, kind, from, goals) {
  const { dist, prev } = flood(st, kind, from[0], from[1]);
  let best = -1;
  let bd = Infinity;
  for (const [c, r] of goals) {
    const i = idx(c, r);
    if (dist[i] < bd) { bd = dist[i]; best = i; }
  }
  if (best < 0) return null;
  return unwind(prev, best);
}
