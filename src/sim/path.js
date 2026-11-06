import { COLS, ROWS, roomAt, OBJECTS, DOOR_EDGES, edgeKey } from './map.js?v=ead633d';

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
  // Nobody walks through a closed door: it has to be opened first (from either side).
  if (door.id === 'backDoor' && !st.backDoorOpen) return false;
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
// Results are cached per (mover graph, start tile): agents re-plan from the same few spots (bed,
// couch, desk) all day, and the graph only changes with the back door. Callers must treat the
// returned arrays as read-only.
const floodCache = new Map();
export function flood(st, kind, c0, r0) {
  const g0 = graphFor(st, kind);
  const key = `${g0.key}:${idx(c0, r0)}`;
  const hit = floodCache.get(key);
  if (hit) return hit;
  const res = floodUncached(st, kind, c0, r0);
  if (floodCache.size > 400) floodCache.delete(floodCache.keys().next().value);
  floodCache.set(key, res);
  return res;
}

function floodUncached(st, kind, c0, r0) {
  const N = COLS * ROWS;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  // Binary min-heap of [distance, index]. The map is ~3600 tiles, so the old O(N^2) scan was
  // ~30x slower than on the first map and stalled the NPC planner; a heap keeps it O(E log N).
  const hd = [];
  const hi = [];
  const push = (d, i) => {
    let k = hd.length;
    hd.push(d); hi.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hd[p] <= hd[k]) break;
      [hd[p], hd[k]] = [hd[k], hd[p]]; [hi[p], hi[k]] = [hi[k], hi[p]];
      k = p;
    }
  };
  const pop = () => {
    const d = hd[0];
    const i = hi[0];
    const ld = hd.pop();
    const li = hi.pop();
    if (hd.length) {
      hd[0] = ld; hi[0] = li;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < hd.length && hd[l] < hd[m]) m = l;
        if (r < hd.length && hd[r] < hd[m]) m = r;
        if (m === k) break;
        [hd[m], hd[k]] = [hd[k], hd[m]]; [hi[m], hi[k]] = [hi[k], hi[m]];
        k = m;
      }
    }
    return [d, i];
  };
  const g = graphFor(st, kind);
  dist[idx(c0, r0)] = 0;
  push(0, idx(c0, r0));
  while (hd.length) {
    const [bd, best] = pop();
    if (done[best]) continue;
    done[best] = 1;
    for (let e = g.start[best]; e < g.start[best + 1]; e++) {
      const ni = g.to[e];
      const nd = bd + g.w[e];
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = best; push(nd, ni); }
    }
  }
  return { dist, prev };
}

// The map and furniture never change, so each tile's moves are fixed per mover. The only live
// input is the back door, so there are four graphs: human/dog x door open/closed.
const graphs = new Map();
function graphFor(st, kind) {
  const key = `${kind}-${st.backDoorOpen ? 'open' : 'shut'}`;
  let g = graphs.get(key);
  if (g) return g;
  const N = COLS * ROWS;
  const probe = { backDoorOpen: !!st.backDoorOpen };
  const start = new Int32Array(N + 1);
  const to = [];
  const w = [];
  for (let i = 0; i < N; i++) {
    start[i] = to.length;
    const c = i % COLS;
    const r = (i / COLS) | 0;
    if (roomAt(c, r) === null) continue;
    for (const [dc, dr, cost] of DIRS) {
      if (!canMove(probe, kind, c, r, dc, dr)) continue;
      to.push(idx(c + dc, r + dr));
      w.push(cost);
    }
  }
  start[N] = to.length;
  g = { key, start, to: Int32Array.from(to), w: Float64Array.from(w) };
  graphs.set(key, g);
  return g;
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
