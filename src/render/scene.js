import * as THREE from 'three';
import { COLS, ROWS, LAYOUT, ROOMS, roomAt, OBJECTS, DOOR_EDGES, edgeKey } from '../sim/map.js';
import { isSolid } from '../sim/path.js';
import { sunAt, hourOfTime, litRooms } from '../sim/daylight.js';
import { ROOM_BY_ID } from '../sim/map.js';
import { despair } from '../sim/satisfaction.js';
import { effectiveClean, waterLook, mopLook } from '../sim/mopping.js';

const ROOM_BY_CHAR = ROOMS;
const GRIME = new THREE.Color(0x5a4a32);
const WALL_LOW = 0.7;
const WALL_TALL = 3.4;
const WALL_GROW = 2.6; // extra height at rock-bottom satisfaction

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const box = (w, h, d, m) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.castShadow = true; g.receiveShadow = true; return g; };
const cyl = (rt, rb, h, m, seg = 16) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); g.castShadow = true; g.receiveShadow = true; return g; };
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

const M = {
  wall: mat(0xf2ede4), wallTop: mat(0xd9d2c5), white: mat(0xf4f4f2), steel: mat(0xc9ccd1, { metalness: 0.4, roughness: 0.4 }),
  dark: mat(0x2b2b2e), wood: mat(0x9a6b45), woodDark: mat(0x6e4a2f), counterTop: mat(0x8d8478), fabric: mat(0x5d7a8c),
  fabric2: mat(0x8c5d6a), screen: mat(0x1d2b3a, { emissive: 0x16304a, emissiveIntensity: 0.6 }), bowl: mat(0xb64a3a),
  kibble: mat(0x8a5a2b), water: mat(0x5aa7e0, { transparent: true, opacity: 0.85 }), leaf: mat(0x3f7d3a), trunk: mat(0x6b4a2b),
  car: mat(0xa83232, { metalness: 0.3, roughness: 0.5 }), glass: mat(0x99b6c9, { metalness: 0.2, roughness: 0.2 }),
  pillow: mat(0xfafafa), blanketP: mat(0x3f6fb5), blanketN: mat(0xd08a3a), fence: mat(0xc9b08a), ball: mat(0xd8e03a),
  puddle: new THREE.MeshStandardMaterial({ color: 0xd9c23a, transparent: true, opacity: 0.6, roughness: 0.2 }),
  debris: mat(0x7a5530), dish: mat(0xffffff, { roughness: 0.4 }), dishDirty: mat(0xd8cfb0, { roughness: 0.6 }),
};

const HIT = new THREE.MeshBasicMaterial({ visible: false });
const hitbox = (w, h, d, y = h / 2) => at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), HIT), 0, y, 0);

const ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

// ------------------------------------------------------------------ furniture models
function buildObject(o) {
  const [c, r, w, h] = o.rect;
  const face = o.face || 's';
  const side = face === 'e' || face === 'w';
  const W = side ? h : w;
  const D = side ? w : h;
  const g = new THREE.Group();
  g.position.set(c + w / 2, 0, r + h / 2);
  g.rotation.y = ROT[face];
  const parts = new THREE.Group();
  g.add(parts);
  switch (o.type) {
    case 'stove':
      parts.add(at(box(0.95, 0.9, 0.9, M.white), 0, 0.45, 0));
      parts.add(at(box(0.9, 0.03, 0.85, M.dark), 0, 0.915, 0));
      for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) parts.add(at(cyl(0.12, 0.12, 0.02, M.steel), x, 0.94, z));
      parts.add(at(box(0.8, 0.35, 0.02, M.dark), 0, 0.5, 0.46));
      break;
    case 'counter':
      parts.add(at(box(0.98, 0.86, 0.9, M.woodDark), 0, 0.43, 0));
      parts.add(at(box(1, 0.06, 0.95, M.counterTop), 0, 0.89, 0));
      break;
    case 'sink':
      parts.add(at(box(W * 0.98, 0.86, D * 0.9, o.kitchen ? M.woodDark : M.white), 0, 0.43, 0));
      parts.add(at(box(W, 0.06, D * 0.95, M.counterTop), 0, 0.89, 0));
      parts.add(at(box(W * 0.55, 0.05, D * 0.5, M.steel), 0, 0.925, 0.05));
      parts.add(at(cyl(0.03, 0.03, 0.3, M.steel), 0, 1.05, -0.3));
      break;
    case 'fridge':
      parts.add(at(box(0.95, 2.1, 0.9, M.steel), 0, 1.05, 0));
      parts.add(at(box(0.03, 0.6, 0.03, M.dark), 0.35, 1.3, 0.46));
      break;
    case 'table':
      parts.add(at(box(W, 0.07, D * 0.95, M.wood), 0, 0.76, 0));
      for (const [x, z] of [[-W / 2 + 0.1, -0.35], [W / 2 - 0.1, -0.35], [-W / 2 + 0.1, 0.35], [W / 2 - 0.1, 0.35]]) parts.add(at(box(0.07, 0.74, 0.07, M.woodDark), x, 0.37, z));
      // chairs on each side
      parts.add(at(box(0.5, 0.45, 0.5, M.wood), -0.5, 0.23, -0.75));
      parts.add(at(box(0.5, 0.6, 0.08, M.wood), -0.5, 0.75, -1.0));
      parts.add(at(box(0.5, 0.45, 0.5, M.wood), 0.5, 0.23, 0.75));
      parts.add(at(box(0.5, 0.6, 0.08, M.wood), 0.5, 0.75, 1.0));
      break;
    case 'foodBowl':
    case 'waterBowl': {
      parts.add(at(cyl(0.22, 0.18, 0.1, M.bowl), 0, 0.05, 0));
      const fill = at(cyl(0.18, 0.18, 0.02, o.type === 'foodBowl' ? M.kibble : M.water), 0, 0.09, 0);
      fill.name = 'fill';
      parts.add(fill);
      break;
    }
    case 'washer':
      parts.add(at(box(0.92, 1.0, 0.85, M.white), 0, 0.5, 0));
      parts.add(at(cyl(0.28, 0.28, 0.04, M.glass), 0, 0.5, 0.44)).rotation.x = Math.PI / 2;
      break;
    case 'tv':
      parts.add(at(box(W * 0.9, 0.45, D * 0.6, M.woodDark), 0, 0.23, -0.1));
      parts.add(at(box(W * 0.8, 0.9, 0.06, M.dark), 0, 1.0, -0.25));
      parts.add(at(box(W * 0.75, 0.8, 0.02, M.screen), 0, 1.0, -0.21));
      break;
    case 'couch':
      parts.add(at(box(W, 0.42, 0.85, M.fabric), 0, 0.21, 0));
      parts.add(at(box(W, 0.55, 0.22, M.fabric), 0, 0.6, -0.33));
      parts.add(at(box(0.2, 0.6, 0.85, M.fabric), -W / 2 + 0.1, 0.3, 0));
      parts.add(at(box(0.2, 0.6, 0.85, M.fabric), W / 2 - 0.1, 0.3, 0));
      break;
    case 'dogBed':
      parts.add(at(cyl(0.45, 0.48, 0.15, M.fabric2), 0, 0.08, 0));
      parts.add(at(cyl(0.35, 0.35, 0.02, mat(0xe6d6c0)), 0, 0.16, 0));
      break;
    case 'toy': {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), M.ball);
      b.castShadow = true;
      parts.add(at(b, 0, 0.13, 0));
      break;
    }
    case 'car':
      parts.add(at(box(W * 0.9, 0.7, D * 0.95, M.car), 0, 0.5, 0));
      parts.add(at(box(W * 0.8, 0.55, D * 0.5, M.glass), 0, 1.1, -0.1));
      for (const [x, z] of [[-0.85, -1.3], [0.85, -1.3], [-0.85, 1.3], [0.85, 1.3]]) {
        const wh = at(cyl(0.3, 0.3, 0.2, M.dark), x, 0.3, z);
        wh.rotation.z = Math.PI / 2;
        parts.add(wh);
      }
      break;
    case 'bench':
      parts.add(at(box(W, 0.9, D * 0.8, M.wood), 0, 0.45, 0));
      parts.add(at(box(W * 0.3, 0.15, 0.3, M.steel), -0.3, 0.98, 0));
      break;
    case 'desk':
      parts.add(at(box(W, 0.06, D * 0.8, M.wood), 0, 0.76, 0));
      parts.add(at(box(0.06, 0.74, D * 0.7, M.woodDark), -W / 2 + 0.1, 0.37, 0));
      parts.add(at(box(0.06, 0.74, D * 0.7, M.woodDark), W / 2 - 0.1, 0.37, 0));
      parts.add(at(box(0.8, 0.5, 0.05, M.dark), 0, 1.1, -0.2));
      parts.add(at(box(0.74, 0.44, 0.02, M.screen), 0, 1.1, -0.17));
      parts.add(at(box(0.5, 0.45, 0.5, M.fabric2), -0.4, 0.23, 0.75));
      break;
    case 'sewing':
      parts.add(at(box(W, 0.06, D * 0.8, M.wood), 0, 0.76, 0));
      parts.add(at(box(0.06, 0.74, 0.6, M.woodDark), -W / 2 + 0.1, 0.37, 0));
      parts.add(at(box(0.06, 0.74, 0.6, M.woodDark), W / 2 - 0.1, 0.37, 0));
      parts.add(at(box(0.5, 0.3, 0.25, M.white), 0.2, 0.94, 0));
      break;
    case 'toilet': {
      parts.add(at(box(0.5, 0.45, 0.25, M.white), 0, 0.6, -0.3));
      const bowl = at(cyl(0.24, 0.18, 0.42, M.white.clone()), 0, 0.21, 0.05);
      bowl.name = 'bowl';
      parts.add(bowl);
      break;
    }
    case 'bed': {
      parts.add(at(box(W, 0.35, D, M.woodDark), 0, 0.18, 0));
      parts.add(at(box(W * 0.95, 0.2, D * 0.95, M.white), 0, 0.45, 0));
      parts.add(at(box(W * 0.96, 0.12, D * 0.62, o.owner === 'player' ? M.blanketP : M.blanketN), 0, 0.58, D * 0.17));
      parts.add(at(box(W * 0.7, 0.12, 0.4, M.pillow), 0, 0.6, -D / 2 + 0.35));
      parts.add(at(box(W, 0.9, 0.1, M.woodDark), 0, 0.45, -D / 2));
      break;
    }
    case 'tub':
      parts.add(at(box(W, 0.55, D * 0.95, M.white), 0, 0.28, 0));
      parts.add(at(box(W * 0.85, 0.05, D * 0.7, M.water), 0, 0.5, 0));
      break;
    case 'dresser':
      parts.add(at(box(W * 0.95, 1.0, D * 0.7, M.wood), 0, 0.5, -0.1));
      for (const y of [0.3, 0.6, 0.85]) parts.add(at(box(W * 0.85, 0.02, 0.02, M.woodDark), 0, y, 0.26));
      break;
    case 'tree': {
      parts.add(at(cyl(0.18, 0.25, 1.6, M.trunk), 0, 0.8, 0));
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 10), M.leaf);
      leaves.castShadow = true;
      parts.add(at(leaves, 0, 2.4, 0));
      break;
    }
    case 'door': {
      // Hinged on the west wall of its tile (the yard/kitchen wall), spanning the 3-tile doorway
      // centred on the tile.
      g.rotation.y = 0;
      g.position.set(c, 0, r - 1);
      const pivot = new THREE.Group();
      pivot.name = 'pivot';
      pivot.add(at(box(0.08, 2.1, 2.95, M.wood), 0, 1.05, 1.5));
      pivot.add(at(cyl(0.04, 0.04, 0.08, M.steel), 0.06, 1.0, 2.7));
      g.add(pivot);
      g.remove(parts);
      break;
    }
    default:
  }
  g.traverse((m) => { m.userData.pick = { kind: 'obj', id: o.id }; });
  return g;
}

// Height of the surface at a tile (for items placed on furniture).
const SURFACE = { counter: 0.92, sink: 0.92, stove: 0.93, table: 0.8, desk: 0.8, sewing: 0.8, bench: 0.92, dresser: 1.0, tub: 0.56 };
function surfaceAt(x, z) {
  const c = Math.floor(x);
  const r = Math.floor(z);
  if (!isSolid(c, r)) return 0.01;
  for (const o of OBJECTS) {
    const [oc, or, w, h] = o.rect;
    if (c >= oc && c < oc + w && r >= or && r < or + h) return SURFACE[o.type] ?? 0.9;
  }
  return 0.01;
}

// ------------------------------------------------------------------ tools / people
const MOP_HEAD = { clean: 0xeeeeee, used: 0xc9c0a8, dirty: 0x7d6e52 };
const BUCKET_WATER = { stale: 0x8f9a5c, stagnant: 0x5a5a32 };
const toolLook = (t) => (t.kind === 'bucket' ? waterLook(t) : t.kind === 'mop' ? mopLook(t) : '');
function toolModel(kind, look) {
  const g = new THREE.Group();
  if (kind === 'broom') {
    g.add(at(cyl(0.025, 0.025, 1.4, M.wood), 0, 0.75, 0));
    g.add(at(box(0.35, 0.15, 0.08, mat(0xc9a24a)), 0, 0.08, 0));
  } else if (kind === 'mop') {
    g.add(at(cyl(0.025, 0.025, 1.3, M.steel), 0, 0.75, 0));
    g.add(at(box(0.25, 0.1, 0.25, mat(MOP_HEAD[look] || 0xeeeeee)), 0, 0.08, 0));
  } else if (kind === 'bucket') {
    g.add(at(cyl(0.22, 0.18, 0.35, mat(0xe0c53a)), 0, 0.18, 0));
    if (look !== 'empty') g.add(at(cyl(0.2, 0.2, 0.02, look && look !== 'fresh' ? mat(BUCKET_WATER[look]) : M.water), 0, 0.3, 0));
  } else if (kind === 'vacuum') {
    g.add(at(box(0.35, 0.3, 0.45, mat(0x7a3fb0)), 0, 0.15, 0));
    g.add(at(cyl(0.025, 0.025, 1.0, M.dark), 0, 0.75, -0.15));
  } else if (kind === 'wipes') {
    g.add(at(box(0.25, 0.1, 0.15, mat(0x3a8fd8)), 0, 0.05, 0));
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

function humanModel(shirt, pants, skin = 0xe0b089, hair = 0x3b2a1e) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  g.add(body);
  const S = mat(shirt);
  const P = mat(pants);
  const K = mat(skin);
  const legL = new THREE.Group(); legL.position.set(-0.13, 0.95, 0); legL.add(at(box(0.18, 0.95, 0.2, P), 0, -0.47, 0)); legL.name = 'legL';
  const legR = new THREE.Group(); legR.position.set(0.13, 0.95, 0); legR.add(at(box(0.18, 0.95, 0.2, P), 0, -0.47, 0)); legR.name = 'legR';
  body.add(legL, legR);
  body.add(at(box(0.52, 0.75, 0.3, S), 0, 1.33, 0));
  const armL = new THREE.Group(); armL.position.set(-0.33, 1.65, 0); armL.add(at(box(0.13, 0.7, 0.15, S), 0, -0.33, 0)); armL.name = 'armL';
  const armR = new THREE.Group(); armR.position.set(0.33, 1.65, 0); armR.add(at(box(0.13, 0.7, 0.15, S), 0, -0.33, 0)); armR.name = 'armR';
  body.add(armL, armR);
  const head = new THREE.Group(); head.position.set(0, 1.95, 0); head.name = 'head';
  head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), K), 0, 0.05, 0));
  head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(hair)), 0, 0.08, -0.01));
  body.add(head);
  const hand = new THREE.Group(); hand.name = 'hand'; hand.position.set(0, -0.65, 0.05); armR.add(hand);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

function dogModel() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  g.add(body);
  const fur = mat(0xb07a3e);
  const dark = mat(0x5e3b1c);
  body.add(at(box(0.36, 0.34, 0.8, fur), 0, 0.5, 0));
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.72, 0.45);
  head.add(at(box(0.3, 0.28, 0.3, fur), 0, 0, 0));
  head.add(at(box(0.18, 0.14, 0.18, fur), 0, -0.05, 0.2));
  head.add(at(box(0.07, 0.06, 0.04, M.dark), 0, -0.01, 0.3));
  head.add(at(box(0.08, 0.18, 0.06, dark), -0.15, 0.05, -0.02));
  head.add(at(box(0.08, 0.18, 0.06, dark), 0.15, 0.05, -0.02));
  body.add(head);
  const legs = [];
  for (const [x, z] of [[-0.12, 0.28], [0.12, 0.28], [-0.12, -0.28], [0.12, -0.28]]) {
    const l = new THREE.Group(); l.position.set(x, 0.35, z); l.add(at(box(0.1, 0.35, 0.1, fur), 0, -0.17, 0));
    body.add(l); legs.push(l);
  }
  const tail = new THREE.Group(); tail.name = 'tail'; tail.position.set(0, 0.62, -0.4);
  tail.add(at(box(0.06, 0.06, 0.3, fur), 0, 0.08, -0.12));
  tail.rotation.x = 0.6;
  body.add(tail);
  g.userData.legs = legs;
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// ------------------------------------------------------------------ scene
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2f3a2c);

  const world = new THREE.Group();
  world.position.set(-COLS / 2, 0, -ROWS / 2);
  scene.add(world);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x556655, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
  scene.add(sun.target);
  sun.position.set(-12, 30, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // cover the whole map (it's ~60 tiles across) so shadows don't cut off at the edges
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 120 });
  scene.add(sun);

  // Ground
  const groundMat = mat(0x4d6b3c);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);

  // Floors (one material per room so cleanliness can tint it)
  const floorMats = {};
  const floorBase = {};
  for (const def of Object.values(ROOM_BY_CHAR)) {
    floorBase[def.id] = new THREE.Color(def.color);
    floorMats[def.id] = mat(def.color, { roughness: def.floor === 'hard' ? 0.5 : 0.95 });
  }
  const tileGeo = new THREE.BoxGeometry(1, 0.1, 1);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const def = ROOM_BY_CHAR[LAYOUT[r][c]];
      if (!def) continue;
      const t = new THREE.Mesh(tileGeo, floorMats[def.id]);
      t.position.set(c + 0.5, -0.05, r + 0.5);
      t.receiveShadow = true;
      world.add(t);
    }
  }

  // Ceiling lights: one warm point light per indoor room, switched on by the sim at night.
  const roomLights = {};
  {
    const ext = {};
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const id = roomAt(c, r);
      if (!id || ROOM_BY_ID[id].outdoor) continue;
      const e = ext[id] || (ext[id] = { c0: c, c1: c, r0: r, r1: r });
      e.c0 = Math.min(e.c0, c); e.c1 = Math.max(e.c1, c); e.r0 = Math.min(e.r0, r); e.r1 = Math.max(e.r1, r);
    }
    for (const [id, e] of Object.entries(ext)) {
      const L = new THREE.PointLight(0xffd6a0, 0, Math.hypot(e.c1 - e.c0 + 1, e.r1 - e.r0 + 1) * 0.9 + 3, 1.2);
      L.position.set((e.c0 + e.c1 + 1) / 2, 2.8, (e.r0 + e.r1 + 1) / 2);
      world.add(L);
      roomLights[id] = L;
    }
  }

  // Walls & fence along every edge between different rooms that is not a doorway.
  const walls = new THREE.Group();
  const fence = new THREE.Group();
  world.add(walls, fence);
  const T = 0.14;
  function edge(c1, r1, c2, r2) {
    const a = roomAt(c1, r1);
    const b = roomAt(c2, r2);
    if (a === b) return;
    if (DOOR_EDGES.has(edgeKey(c1, r1, c2, r2))) return;
    const vertical = c1 !== c2; // edge runs along z
    const x = vertical ? Math.max(c1, c2) : c1 + 0.5;
    const z = vertical ? r1 + 0.5 : Math.max(r1, r2);
    const yardOnly = (a === 'yard' && b === null) || (b === 'yard' && a === null);
    if (yardOnly) {
      const f = box(vertical ? 0.06 : 1, 0.8, vertical ? 1 : 0.06, M.fence);
      f.position.set(x, 0.4, z);
      f.userData.through = true;
      fence.add(f);
      return;
    }
    const w = box(vertical ? T : 1 + T, 1, vertical ? 1 + T : T, M.wall);
    w.position.set(x, 0.5, z);
    w.userData.through = true;
    walls.add(w);
  }
  for (let r = -1; r <= ROWS; r++) {
    for (let c = -1; c <= COLS; c++) {
      edge(c, r, c + 1, r);
      edge(c, r, c, r + 1);
    }
  }
  let tallWalls = false;
  let wallGrow = 0; // eased toward despair: walls rise as your player's life gets harder
  let wallH = -1;
  const applyWalls = () => {
    const h = (tallWalls ? WALL_TALL : WALL_LOW) + wallGrow * WALL_GROW;
    if (Math.abs(h - wallH) < 0.002) return;
    wallH = h;
    walls.children.forEach((w) => { w.scale.y = h; w.position.y = h / 2; });
  };
  const setWalls = (tall) => { tallWalls = tall; applyWalls(); };
  setWalls(false);

  // Furniture
  const objMeshes = {};
  for (const o of OBJECTS) {
    const g = buildObject(o);
    objMeshes[o.id] = g;
    world.add(g);
  }

  // Agents
  const agentMeshes = {
    player: humanModel(0x3f6fb5, 0x2d3540),
    npc: humanModel(0xd9822b, 0x4a4036, 0xc68e64, 0x1a1a1a),
    dog: dogModel(),
  };
  agentMeshes.dog.add(hitbox(0.7, 1.0, 1.1));
  agentMeshes.npc.add(hitbox(0.8, 2.3, 0.8));
  for (const [id, m] of Object.entries(agentMeshes)) {
    m.traverse((x) => { x.userData.pick = { kind: 'agent', id }; });
    world.add(m);
  }
  const selRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), new THREE.MeshBasicMaterial({ color: 0x7cff6b, transparent: true, opacity: 0.8 }));
  selRing.rotation.x = -Math.PI / 2;
  selRing.position.y = 0.03;
  world.add(selRing);

  const focusRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, depthTest: false }));
  focusRing.rotation.x = -Math.PI / 2;
  focusRing.position.y = 0.05;
  focusRing.renderOrder = 10;
  focusRing.visible = false;
  world.add(focusRing);

  // Dynamic things: tools, dishes, messes, carried items
  const dyn = { tool: new Map(), dish: new Map(), mess: new Map() };
  const carried = { player: null, npc: null };

  // Camera (orthographic isometric)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const cam = { yaw: Math.PI / 4, yawTarget: Math.PI / 4, zoom: 13, target: new THREE.Vector3(6, 0, 6), follow: true };
  const PITCH = Math.atan(1 / Math.SQRT2);
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    const a = w / h;
    // zoom = half the view along the SHORTER side, so a portrait phone isn't cropped to a sliver
    const hx = a >= 1 ? cam.zoom * a : cam.zoom;
    const hy = a >= 1 ? cam.zoom : cam.zoom / a;
    camera.left = -hx; camera.right = hx; camera.top = hy; camera.bottom = -hy;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  function placeCamera() {
    const d = 60;
    camera.position.set(
      cam.target.x + Math.sin(cam.yaw) * Math.cos(PITCH) * d,
      cam.target.y + Math.sin(PITCH) * d,
      cam.target.z + Math.cos(cam.yaw) * Math.cos(PITCH) * d,
    );
    camera.lookAt(cam.target);
  }

  // Picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(world.children, true);
    for (const h of hits) {
      let hidden = false;
      for (let q = h.object; q; q = q.parent) if (!q.visible) hidden = true;
      if (hidden) continue; // the raycaster still hits hidden meshes (Sam at work, the car)
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (!o) {
        if (h.object.userData.through) continue; // low walls never block a click
        break; // floor or ground: fall through to the floor tile under the cursor
      }
      const p = { ...o.userData.pick };
      if (p.kind === 'agent' && p.id === 'player') continue;
      const pt = h.point.clone().sub(world.position);
      if (p.kind !== 'obj' && p.kind !== 'agent') { p.c = Math.floor(pt.x); p.r = Math.floor(pt.z); }
      p.room = roomAt(Math.floor(pt.x), Math.floor(pt.z));
      return p;
    }
    const pt = new THREE.Vector3();
    if (!ray.ray.intersectPlane(groundPlane, pt)) return null;
    pt.sub(world.position);
    const c = Math.floor(pt.x);
    const r = Math.floor(pt.z);
    const room = roomAt(c, r);
    if (!room) return null;
    return { kind: 'floor', c, r, room };
  }

  function worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).add(world.position).project(camera);
    return [(v.x * 0.5 + 0.5) * canvas.clientWidth, (-v.y * 0.5 + 0.5) * canvas.clientHeight, v.z];
  }

  let clock = 0;
  function poseHuman(m, a, t) {
    const body = m.getObjectByName('body');
    const L = m.getObjectByName('legL');
    const R = m.getObjectByName('legR');
    const AL = m.getObjectByName('armL');
    const AR = m.getObjectByName('armR');
    const head = m.getObjectByName('head');
    body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
    L.rotation.x = R.rotation.x = AL.rotation.x = AR.rotation.x = 0; AR.rotation.z = AL.rotation.z = 0; head.rotation.set(0, 0, 0);
    switch (a.pose) {
      case 'walk': { const s = Math.sin(t * 10) * 0.6; L.rotation.x = s; R.rotation.x = -s; AL.rotation.x = -s * 0.7; AR.rotation.x = s * 0.7; break; }
      case 'sit': L.rotation.x = R.rotation.x = -Math.PI / 2; body.position.y = -0.45; break;
      case 'lie': body.rotation.x = -Math.PI / 2; body.position.set(0, 0.75, -0.95); break;
      case 'clean': AR.rotation.x = -0.8 + Math.sin(t * 6) * 0.5; AL.rotation.x = -0.6 + Math.sin(t * 6) * 0.4; body.rotation.x = 0.2; break;
      case 'use': AR.rotation.x = -1.0 + Math.sin(t * 4) * 0.25; AL.rotation.x = -0.9; break;
      case 'phone': AR.rotation.x = -2.3; AR.rotation.z = -0.4; head.rotation.y = -0.3; break;
      case 'talk': AR.rotation.x = -0.5 + Math.sin(t * 3) * 0.4; head.rotation.x = Math.sin(t * 4) * 0.1; break;
      case 'pet': body.rotation.x = 0.6; AR.rotation.x = -1.3 + Math.sin(t * 5) * 0.3; L.rotation.x = R.rotation.x = -0.4; body.position.y = -0.25; break;
      case 'yawn': AL.rotation.x = AR.rotation.x = -2.9 + Math.sin(t * 2) * 0.1; head.rotation.x = -0.35; break;
      case 'throw': AR.rotation.x = -2.6 + Math.max(0, Math.sin(t * 2)) * 2; break;
      default:
    }
    if (a.pose === 'sit' && a.task && a.task.name === 'computer') AR.rotation.x = AL.rotation.x = -1.2;
  }
  function poseDog(m, a, t) {
    const body = m.getObjectByName('body');
    const tail = m.getObjectByName('tail');
    const head = m.getObjectByName('head');
    body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
    const legs = m.userData.legs;
    legs.forEach((l) => { l.rotation.x = 0; });
    tail.rotation.y = Math.sin(t * (a.pose === 'happy' || a.pose === 'play' ? 18 : 4)) * 0.6;
    switch (a.pose) {
      case 'walk': legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 14 + (i % 2 ? 0 : Math.PI)) * 0.6; }); break;
      case 'sit': body.rotation.x = -0.45; body.position.y = -0.12; break;
      case 'lie': body.position.y = -0.3; legs.forEach((l) => { l.rotation.x = Math.PI / 2; }); head.rotation.x = 0.3; break;
      case 'play': body.position.y = Math.abs(Math.sin(t * 8)) * 0.3; body.rotation.y = Math.sin(t * 2) * 1.2; break;
      case 'happy': body.position.y = Math.abs(Math.sin(t * 9)) * 0.08; break;
      case 'use': head.rotation.x = 0.6; body.rotation.x = 0.2; break;
      default:
    }
  }

  function setCarried(id, st, a, m) {
    const tool = a.carrying && a.carrying.kind === 'tool' ? st.tools[a.carrying.id] : null;
    const want = a.carrying ? (tool ? `${tool.kind}:${toolLook(tool)}` : a.carrying.kind) : null;
    const cur = carried[id];
    if ((cur && cur.userData.kind) === want) return;
    const hand = m.getObjectByName('hand');
    if (cur) hand.remove(cur);
    carried[id] = null;
    if (!want) return;
    let g;
    if (want === 'dishes' || want === 'meal') {
      g = new THREE.Group();
      const n = want === 'meal' ? 1 : Math.min(6, a.carrying.n);
      for (let i = 0; i < n; i++) g.add(at(cyl(0.16, 0.13, 0.04, want === 'meal' ? M.dish : M.dishDirty), 0, i * 0.045, 0.1));
      if (want === 'meal') g.add(at(cyl(0.1, 0.1, 0.06, M.kibble), 0, 0.05, 0.1));
      g.rotation.x = Math.PI / 2;
    } else {
      g = toolModel(tool.kind, toolLook(tool));
      g.scale.setScalar(0.8);
      g.position.set(0, -0.2, 0.1);
    }
    g.userData.kind = want;
    hand.add(g);
    carried[id] = g;
  }

  const SKY_DAY = new THREE.Color(0x2f3a2c);
  const SKY_NIGHT = new THREE.Color(0x0a0f1c);
  const SKY_DUSK = new THREE.Color(0x4a3328);
  const GROUND_DAY = new THREE.Color(0x4d6b3c);
  const GROUND_NIGHT = new THREE.Color(0x1a2433);
  const SUN_NOON = new THREE.Color(0xfff2dd);
  const SUN_LOW = new THREE.Color(0xffa060);
  const MOON = new THREE.Color(0x8fa8ff);
  const HEMI_DAY = new THREE.Color(0xffffff);
  const HEMI_NIGHT = new THREE.Color(0x5a6a9a);
  function daylightSync(st, dtReal) {
    const h = hourOfTime(st.time);
    const { elev, light } = sunAt(h);
    // the sun arcs east → west; at night a dim bluish moon takes over the same light
    const ang = ((h - 6) / 12) * Math.PI;
    const up = Math.max(0.25, Math.abs(Math.sin(ang)));
    sun.position.set(Math.cos(ang) * -26, 30 * up, -10);
    const low = 1 - Math.min(1, Math.max(0, elev) * 2.5);
    if (light > 0) {
      sun.color.copy(SUN_NOON).lerp(SUN_LOW, low);
      sun.intensity = 0.25 + 1.45 * light;
    } else {
      sun.color.copy(MOON);
      sun.intensity = 0.28;
    }
    hemi.color.copy(HEMI_NIGHT).lerp(HEMI_DAY, light);
    hemi.intensity = 0.42 + 0.8 * light;
    const dusk = light > 0 && light < 1 ? Math.sin(light * Math.PI) * 0.6 : 0;
    scene.background.copy(SKY_NIGHT).lerp(SKY_DAY, light).lerp(SKY_DUSK, dusk);
    groundMat.color.copy(GROUND_NIGHT).lerp(GROUND_DAY, light);
    // lights fade on/off rather than snapping
    const lit = litRooms(st);
    for (const [id, L] of Object.entries(roomLights)) {
      const want = lit.has(id) ? 3.2 : 0;
      L.intensity += (want - L.intensity) * Math.min(1, dtReal * 6);
    }
  }

  function sync(st, dtReal) {
    clock += dtReal;
    daylightSync(st, dtReal);
    wallGrow += (despair(st) - wallGrow) * Math.min(1, dtReal * 0.5);
    applyWalls();
    // floors tinted by cleanliness
    for (const [id, r] of Object.entries(st.rooms)) {
      floorMats[id].color.copy(floorBase[id]).lerp(GRIME, (1 - effectiveClean(st, id) / 100) * 0.6);
    }
    // back door
    const pivot = objMeshes.backDoor.getObjectByName('pivot');
    const want = st.backDoorOpen ? -Math.PI / 2 : 0;
    pivot.rotation.y += (want - pivot.rotation.y) * Math.min(1, dtReal * 8);
    // bowls
    for (const [id, k] of [['foodBowl', 'food'], ['waterBowl', 'water']]) {
      const f = objMeshes[id].getObjectByName('fill');
      f.visible = st.bowls[k] > 1;
      f.position.y = 0.04 + 0.05 * (st.bowls[k] / 100);
    }
    // toilets
    for (const id of ['toiletMB', 'toiletW']) {
      objMeshes[id].getObjectByName('bowl').material.color.setHex(0xf4f4f2).lerp(new THREE.Color(0x8a7340), st.toilets[id].dirt / 140);
    }
    // agents
    // Sam takes the car to work.
    objMeshes.car.visible = !st.agents.npc.away;
    for (const [id, a] of Object.entries(st.agents)) {
      const m = agentMeshes[id];
      m.visible = !a.away;
      const [x, z] = a.drawAt || [a.x, a.z];
      m.position.x += (x - m.position.x) * Math.min(1, dtReal * 20);
      m.position.z += (z - m.position.z) * Math.min(1, dtReal * 20);
      m.position.y = a.pose === 'lie' && a.drawAt ? 0.25 : 0;
      let dr = a.facing - m.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      m.rotation.y += dr * Math.min(1, dtReal * 12);
      if (a.kind === 'dog') poseDog(m, a, clock);
      else {
        // Sam's tired tell: a yawn while standing or sitting idle
        const yawn = a.tell && a.tell.pose === 'yawn' && (a.pose === 'stand' || a.pose === 'sit' || a.pose === 'use');
        poseHuman(m, yawn ? { ...a, pose: 'yawn' } : a, clock);
        setCarried(id, st, a, m);
      }
    }
    const p = agentMeshes.player.position;
    selRing.position.x = p.x; selRing.position.z = p.z;
    // tools on the ground / counters
    syncSet(dyn.tool, Object.values(st.tools).filter((t) => !t.carriedBy), (t) => `${t.id}:${t.c},${t.r}:${t.upright ? 'u' : 'f'}${t.inBucket ? 'b' : ''}:${toolLook(t)}`, (t) => {
      const g = toolModel(t.kind, toolLook(t));
      g.add(hitbox(0.7, 1.2, 0.7));
      g.position.set(t.c + 0.5, surfaceAt(t.c + 0.5, t.r + 0.5), t.r + 0.5);
      if (t.kind === 'broom' || t.kind === 'mop') {
        if (t.inBucket) { g.position.y += 0.12; g.rotation.z = 0.12; } // standing in its bucket
        else if (t.upright) g.rotation.z = 0.25; // leaning on the wall
        else { g.rotation.z = Math.PI / 2; g.position.y += 0.04; } // lying on the floor
      }
      g.traverse((m) => { m.userData.pick = { kind: 'tool', id: t.id }; });
      return g;
    });
    syncSet(dyn.dish, st.dishes, (d) => d.id, (d) => {
      const g = at(cyl(0.16, 0.12, 0.04, M.dishDirty), d.x, surfaceAt(d.x, d.z) + 0.02 + d.stack * 0.045, d.z);
      g.add(hitbox(0.45, 0.3, 0.45, 0.1));
      g.traverse((x) => { x.userData.pick = { kind: 'dish', id: d.id }; });
      return g;
    });
    syncSet(dyn.mess, st.messes, (m) => m.id, (m) => {
      let g;
      if (m.type === 'puddle') {
        g = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), M.puddle);
        g.rotation.x = -Math.PI / 2;
        g.position.set(m.x, 0.02, m.z);
        g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.2), HIT), 0, 0, 0.1));
      } else {
        g = new THREE.Group();
        for (let i = 0; i < 6; i++) g.add(at(box(0.12, 0.05, 0.08, M.debris), Math.sin(i * 2.1) * 0.3, 0.03, Math.cos(i * 1.7) * 0.3));
        g.add(hitbox(0.8, 0.3, 0.8));
        g.position.set(m.x, 0, m.z);
      }
      g.traverse((x) => { x.userData.pick = { kind: 'mess', id: m.id }; });
      return g;
    });
    // camera
    if (cam.follow) {
      const tx = p.x + world.position.x;
      const tz = p.z + world.position.z;
      cam.target.x += (tx - cam.target.x) * Math.min(1, dtReal * 3);
      cam.target.z += (tz - cam.target.z) * Math.min(1, dtReal * 3);
    }
    let dy = cam.yawTarget - cam.yaw;
    cam.yaw += dy * Math.min(1, dtReal * 8);
    placeCamera();
    renderer.render(scene, camera);
  }

  function syncSet(map, items, keyOf, make) {
    const seen = new Set();
    for (const it of items) {
      const k = keyOf(it);
      seen.add(k);
      if (!map.has(k)) { const g = make(it); world.add(g); map.set(k, g); }
    }
    for (const [k, g] of map) if (!seen.has(k)) { world.remove(g); map.delete(k); }
  }

  return {
    sync, pick, worldToScreen, cam, resize,
    rotate: (dir) => { cam.yawTarget += (dir * Math.PI) / 2; },
    zoomBy: (f) => { cam.zoom = Math.max(5, Math.min(30, cam.zoom * f)); resize(); },
    pan: (right, fwd) => {
      cam.follow = false;
      const cs = Math.cos(cam.yaw);
      const sn = Math.sin(cam.yaw);
      cam.target.x += right * cs - fwd * sn;
      cam.target.z += -right * sn - fwd * cs;
    },
    toggleWalls: () => setWalls(!tallWalls),
    setFocus: (p) => {
      focusRing.visible = !!p;
      if (p) {
        focusRing.position.x = p[0];
        focusRing.position.z = p[1];
        focusRing.scale.setScalar(1 + Math.sin(clock * 5) * 0.08);
      }
    },
    agentHead: (id) => {
      const m = agentMeshes[id];
      const p = m.position;
      return worldToScreen(p.x, id === 'dog' ? 1.2 : 2.7, p.z);
    },
  };
}
