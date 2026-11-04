// House map. 1 tile = 2 ft. Columns run west→east (x), rows north→south (z).
// Built from the owner's layout in the 0101 House Planner artifact (2026-11-03); where two rooms
// overlapped there, the smaller room took the shared floor.

export const ROOMS = {
  Y: { id: 'yard', name: 'Back Yard', floor: 'grass', outdoor: true, color: 0x7fb069 },
  K: { id: 'kitchen', name: 'Kitchen', floor: 'hard', color: 0xe3d5b5 },
  L: { id: 'laundry', name: 'Laundry Room', floor: 'hard', color: 0xc9d4de },
  R: { id: 'living', name: 'Living Room', floor: 'carpet', color: 0xc2ad8f },
  G: { id: 'garage', name: 'Garage', floor: 'hard', color: 0xa3a3a3 },
  3: { id: 'bedroom3', name: 'Bedroom 3', floor: 'carpet', color: 0xcdb7cf },
  H: { id: 'hallway', name: 'Hallway', floor: 'hard', color: 0xd4c39f },
  M: { id: 'masterBath', name: 'Master Bath', floor: 'hard', color: 0xc3e2e8 },
  B: { id: 'masterBed', name: 'Master Bedroom', floor: 'carpet', color: 0xa9bcd0 },
  W: { id: 'bathroom', name: 'Bathroom', floor: 'hard', color: 0xc8e6d9 },
  1: { id: 'bedroom1', name: 'Bedroom 1', floor: 'carpet', color: 0xdcc796 },
};

// prettier-ignore
export const LAYOUT = [
  'YYYYYYYYYYYYYYYYYYYYYY......................................', // 0
  'YYYYYYYYYYYYYYYYYYYYYY......................................', // 1
  'YYYYYYYYYYYYYYYYYYYYYY...........LLLL.......................', // 2
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 3
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 4
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 5
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 6
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 7
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 8
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 9
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 10
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 11
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 12
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 13
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKLLLLGGGGGGGGGGGGGGGGGGGGGGG', // 14
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKKKKKRRRRRRRRRRRRRRRRRRRR...', // 15
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKKKKKRRRRRRRRRRRRRRRRRRRR...', // 16
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKKKKKRRRRRRRRRRRRRRRRRRRR...', // 17
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKKKKKRRRRRRRRRRRRRRRRRRRR...', // 18
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKKKKKRRRRRRRRRRRRRRRRRRRR...', // 19
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKKKKKRRRRRRRRRRRRRRRRRRRR...', // 20
  'YYYYYYYYYYYYYYYYYYYYYYKKKKKKKKKKKKKKKRRRRRRRRRRRRRRRRRRRR...', // 21
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 22
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 23
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 24
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 25
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 26
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 27
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 28
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 29
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 30
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 31
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 32
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 33
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 34
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 35
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 36
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 37
  'YYYYYYYYYYYYYYYYYYYYYY333333333333333RRRRRRRRRRRRRRRRRRRR...', // 38
  'YYYYYYYYYYYYYYYYYYYYYY3333333333333HHHHHHHHHHHHH...MMMMMMMMM', // 39
  'YYYYYYYYYYYYYYYYYYYYYY3333333333333HHHHHHHHHHHHH...MMMMMMMMM', // 40
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111HHHHHHHHHHHHH...MMMMMMMMM', // 41
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111HHHHHHHHHHHHH...MMMMMMMMM', // 42
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111HHHHHHHHHHHHH...MMMMMMMMM', // 43
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111HHHHHHHHHHHHH...MMMMMMMMM', // 44
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111HHHHHHHHHHHHH...MMMMMMMMM', // 45
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 46
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 47
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 48
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 49
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 50
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 51
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 52
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 53
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 54
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 55
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 56
  'YYYYYYYYYYYYYYYYYYYYYY1111111111111WWWWWWWWBBBBBBBBBBBBBBBBB', // 57
  'YYYYYYYYYYYYYYYYYYYYYY......................................', // 58
  'YYYYYYYYYYYYYYYYYYYYYY......................................', // 59
];

export const COLS = LAYOUT[0].length;
export const ROWS = LAYOUT.length;

const BY_CHAR = ROOMS;
export const ROOM_LIST = Object.values(ROOMS);
export const ROOM_BY_ID = Object.fromEntries(ROOM_LIST.map((r) => [r.id, r]));

export function roomAt(c, r) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
  const def = BY_CHAR[LAYOUT[r][c]];
  return def ? def.id : null;
}

// Doorways: pairs of orthogonally adjacent tiles in different rooms.
// From the owner's door layout in the House Planner (2026-11-03). w = width in tiles.
export const DOORS = [
  { a: [36, 18], b: [37, 18], w: 3 }, // kitchen ↔ living
  { a: [41, 38], b: [41, 39], w: 3 }, // living ↔ hallway
  { a: [34, 43], b: [35, 43], w: 3 }, // bedroom 1 ↔ hallway
  { a: [45, 45], b: [45, 46], w: 3 }, // hallway ↔ master bedroom
  { a: [55, 45], b: [55, 46], w: 3 }, // master bath ↔ master bedroom
  { a: [36, 12], b: [37, 12], w: 3 }, // laundry ↔ garage
  { a: [34, 21], b: [34, 22], w: 3 }, // kitchen ↔ bedroom 3
  { a: [35, 38], b: [35, 39], w: 3 }, // bedroom 3 ↔ hallway
  { a: [21, 9], b: [22, 9], w: 3, id: 'backDoor' }, // yard ↔ kitchen (a real door: closed blocks everyone)
  { a: [40, 45], b: [40, 46], w: 3 }, // hallway ↔ bathroom
  { a: [32, 8], b: [33, 8], w: 3 }, // kitchen ↔ laundry (restored so the laundry room and garage connect to the house)
];

export const edgeKey = (c1, r1, c2, r2) =>
  c1 < c2 || (c1 === c2 && r1 < r2) ? `${c1},${r1}|${c2},${r2}` : `${c2},${r2}|${c1},${r1}`;

// Every doorway is DOOR_WIDTH tiles wide (6 ft), centred on its listed edge. Edges whose tiles
// don't belong to the same two rooms (a corner) are left as wall.
export const DOOR_WIDTH = 3;
export const DOOR_EDGES = new Map();
for (const d of DOORS) {
  const [ac, ar] = d.a;
  const [bc, br] = d.b;
  const ra = roomAt(ac, ar);
  const rb = roomAt(bc, br);
  const along = ac !== bc ? [0, 1] : [1, 0]; // a vertical edge runs along rows, a horizontal one along columns
  const w = d.w || DOOR_WIDTH;
  const half = Math.floor(w / 2);
  for (let k = -half; k <= w - 1 - half; k++) {
    const a = [ac + along[0] * k, ar + along[1] * k];
    const b = [bc + along[0] * k, br + along[1] * k];
    if (roomAt(...a) === ra && roomAt(...b) === rb) DOOR_EDGES.set(edgeKey(...a, ...b), d);
  }
}

// Furniture. rect = [col, row, w, h]; solid tiles block walking.
// slots = where an agent stands to use it; `at` (optional) = where it is drawn while using it.
// face = direction the front faces (n/s/e/w).
export const OBJECTS = [
  { id: 'car', type: 'car', name: 'Car', rect: [39, 9, 4, 2], face: 'e', solid: true, slots: [] },
  { id: 'bench', type: 'bench', name: 'Workbench', rect: [47, 3, 2, 1], face: 's', solid: true, slots: [] },
  { id: 'tree', type: 'tree', name: 'Tree', rect: [7, 4, 1, 1], solid: true, slots: [] },
  { id: 'washer', type: 'washer', name: 'Washer', rect: [33, 2, 1, 1], face: 's', solid: true, slots: [] },
  { id: 'dryer', type: 'washer', name: 'Dryer', rect: [36, 2, 1, 1], face: 's', solid: true, slots: [] },
  { id: 'stove', type: 'stove', name: 'Stove', rect: [22, 3, 1, 1], face: 's', solid: true, slots: [{tile: [22, 4]}] },
  { id: 'counterK1', type: 'counter', name: 'Counter', rect: [24, 3, 1, 1], face: 's', solid: true, slots: [{tile: [24, 4]}] },
  { id: 'sinkK', type: 'sink', name: 'Kitchen Sink', rect: [26, 3, 1, 1], face: 's', solid: true, kitchen: true, slots: [{tile: [26, 4]}] },
  { id: 'counterK2', type: 'counter', name: 'Counter', rect: [29, 3, 1, 1], face: 's', solid: true, slots: [{tile: [29, 4]}] },
  { id: 'fridge', type: 'fridge', name: 'Fridge', rect: [31, 3, 1, 1], face: 's', solid: true, slots: [{tile: [31, 4]}] },
  { id: 'table', type: 'table', name: 'Dining Table', rect: [26, 12, 2, 1], face: 's', solid: true, slots: [{tile: [26, 11], dish: [26.5, 12.3]}, {tile: [27, 13], dish: [27.5, 12.7]}] },
  { id: 'foodBowl', type: 'foodBowl', name: 'Food Bowl', rect: [22, 20, 1, 1], solid: false, slots: [{tile: [22, 19]}] },
  { id: 'waterBowl', type: 'waterBowl', name: 'Water Bowl', rect: [24, 20, 1, 1], solid: false, slots: [{tile: [24, 19]}] },
  { id: 'backDoor', type: 'door', name: 'Back Door', rect: [22, 9, 1, 1], solid: false, slots: [{tile: [22, 9]}, {tile: [21, 9]}] },
  { id: 'tv', type: 'tv', name: 'TV', rect: [43, 15, 2, 1], face: 's', solid: true, slots: [] },
  { id: 'couch', type: 'couch', name: 'Couch', rect: [40, 21, 4, 1], face: 'n', solid: true, slots: [{tile: [40, 22], at: [40.5, 21.5]}, {tile: [41, 22], at: [41.5, 21.5]}, {tile: [42, 22], at: [42.5, 21.5]}, {tile: [43, 22], at: [43.5, 21.5]}] },
  { id: 'dogBed', type: 'dogBed', name: 'Dog Bed', rect: [50, 30, 1, 1], solid: false, slots: [{tile: [50, 30]}] },
  { id: 'toy', type: 'toy', name: 'Tennis Ball', rect: [39, 30, 1, 1], solid: false, slots: [{tile: [39, 29]}] },
  { id: 'desk', type: 'desk', name: 'Computer', rect: [22, 24, 1, 2], face: 'e', solid: true, slots: [{tile: [23, 24], at: [23.3, 24.5]}] },
  { id: 'sewing', type: 'sewing', name: 'Sewing Table', rect: [34, 29, 2, 1], face: 'n', solid: true, slots: [{tile: [34, 28], at: [34.5, 28.6]}] },
  { id: 'sinkMB', type: 'sink', name: 'Bathroom Sink', rect: [53, 39, 1, 1], face: 's', solid: true, slots: [{tile: [53, 40]}] },
  { id: 'toiletMB', type: 'toilet', name: 'Toilet', rect: [58, 39, 1, 1], face: 's', solid: true, slots: [{tile: [58, 40], at: [58.5, 39.6]}] },
  { id: 'bedN', type: 'bed', name: "Sam's Bed", rect: [22, 48, 2, 3], face: 'n', solid: true, owner: 'npc', slots: [{tile: [24, 49], at: [23, 49.6]}] },
  { id: 'dresser', type: 'dresser', name: 'Dresser', rect: [33, 56, 2, 1], face: 'n', solid: true, slots: [] },
  { id: 'bedP', type: 'bed', name: 'Your Bed', rect: [47, 52, 2, 3], face: 'n', solid: true, owner: 'player', slots: [{tile: [46, 53], at: [48, 53.6]}] },
  { id: 'console', type: 'tv', name: 'Game TV', rect: [52, 48, 1, 2], face: 'w', solid: true, slots: [] },
  { id: 'toiletW', type: 'toilet', name: 'Toilet', rect: [35, 56, 1, 1], face: 'n', solid: true, slots: [{tile: [35, 55], at: [35.5, 56.4]}] },
  { id: 'tub', type: 'tub', name: 'Bathtub', rect: [37, 56, 2, 1], face: 'n', solid: true, slots: [] },
  { id: 'sinkW', type: 'sink', name: 'Bathroom Sink', rect: [38, 56, 1, 1], face: 'n', solid: true, slots: [{tile: [38, 55]}] },
  { id: 'pottySpot', type: 'grass', name: 'Lawn', rect: [8, 14, 1, 1], solid: false, slots: [{tile: [8, 14]}] },
];

for (const o of OBJECTS) {
  o.room = roomAt(o.rect[0], o.rect[1]);
  if (o.solid === undefined) o.solid = true;
}
export const OBJ = Object.fromEntries(OBJECTS.map((o) => [o.id, o]));

// Carryable cleaning tools and where they live.
export const TOOLS = [
  { id: 'broom', kind: 'broom', name: 'Broom', home: [36, 7] },
  { id: 'mop', kind: 'mop', name: 'Mop', home: [36, 10] }, // starts standing in its bucket
  { id: 'bucket', kind: 'bucket', name: 'Mop Bucket', home: [36, 10] },
  { id: 'vacuum', kind: 'vacuum', name: 'Vacuum', home: [39, 13] },
  { id: 'wipesK', kind: 'wipes', name: 'Wipes', home: [24, 3] },
  { id: 'wipesW', kind: 'wipes', name: 'Wipes', home: [38, 56] },
];

export const START = {
  player: [45, 49],
  npc: [28, 49],
  dog: [47, 25],
};

// Named spots the AI walks to (kept here so the map can change without touching the AI).
export const SPOTS = {
  garageExit: [38, 13], // Sam leaves for work from here
  dogDoorWait: [23, 9], // beside the back door, inside (the door tile itself is its use slot)
  dogYardWait: [21, 10], // just outside the back door, off its yard-side use spot
  dogBackInside: [[23, 10], [23, 11]],
};
