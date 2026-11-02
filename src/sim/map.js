// House map. 1 tile = 2 ft. Columns run west→east (x), rows north→south (z).
// Traced from the floor-plan screenshot in docs/DESIGN.md; back yard added to the
// west of the kitchen, garage added to the east of the living room.

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
  'YYYYYYYY.......LL...........', // 0
  'YYYYYYYYKKKKKKKLL...........', // 1
  'YYYYYYYYKKKKKKKLL...........', // 2
  'YYYYYYYYKKKKKKKLL...........', // 3
  'YYYYYYYYKKKKKKKLL...........', // 4
  'YYYYYYYYKKKKKKKRRRRRRRGGGGGG', // 5
  'YYYYYYYYKKKKKKKRRRRRRRGGGGGG', // 6
  'YYYYYYYYKKKKKKKRRRRRRRGGGGGG', // 7
  'YYYYYYYYKKKKKKKRRRRRRRGGGGGG', // 8
  'YYYYYYYYKKKKKKKRRRRRRRGGGGGG', // 9
  'YYYYYYYY3333333RRRRRRRGGGGGG', // 10
  'YYYYYYYY3333333RRRRRRRGGGGGG', // 11
  'YYYYYYYY3333333RRRRRRRGGGGGG', // 12
  '........3333333RRRRRRR......', // 13
  '........3333333HHHHMMMMM....', // 14
  '........1111111HHHHMMMMM....', // 15
  '........1111111HHHHBBBBB....', // 16
  '........1111111WWWWBBBBB....', // 17
  '........1111111WWWWBBBBB....', // 18
  '........1111111WWWWBBBBB....', // 19
  '........1111111WWWWBBBBB....', // 20
  '........1111111WWWWBBBBB....', // 21
  '........1111111WWWWBBBBB....', // 22
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
export const DOORS = [
  { a: [7, 5], b: [8, 5], id: 'backDoor' }, // yard ↔ kitchen (a real door; dogs need it open)
  { a: [14, 2], b: [15, 2] }, // kitchen ↔ laundry
  { a: [14, 7], b: [15, 7] }, // kitchen ↔ living
  { a: [12, 9], b: [12, 10] }, // kitchen ↔ bedroom 3
  { a: [16, 13], b: [16, 14] }, // living ↔ hallway
  { a: [21, 8], b: [22, 8] }, // living ↔ garage
  { a: [15, 14], b: [14, 14] }, // hallway ↔ bedroom 3
  { a: [15, 15], b: [14, 15] }, // hallway ↔ bedroom 1
  { a: [16, 16], b: [16, 17] }, // hallway ↔ bathroom
  { a: [18, 14], b: [19, 14] }, // hallway ↔ master bath
  { a: [18, 16], b: [19, 16] }, // hallway ↔ master bedroom
  { a: [21, 15], b: [21, 16] }, // master bath ↔ master bedroom
];

export const edgeKey = (c1, r1, c2, r2) =>
  c1 < c2 || (c1 === c2 && r1 < r2) ? `${c1},${r1}|${c2},${r2}` : `${c2},${r2}|${c1},${r1}`;

export const DOOR_EDGES = new Map(DOORS.map((d) => [edgeKey(...d.a, ...d.b), d]));

// Furniture. rect = [col, row, w, h]; solid tiles block walking.
// slots = where an agent stands to use it; `at` (optional) = where it is drawn while using it.
// face = direction the front faces (n/s/e/w).
export const OBJECTS = [
  // Kitchen
  { id: 'stove', type: 'stove', name: 'Stove', rect: [8, 1, 1, 1], face: 's', slots: [{ tile: [8, 2] }] },
  { id: 'counterK1', type: 'counter', name: 'Counter', rect: [9, 1, 1, 1], face: 's', slots: [{ tile: [9, 2] }] },
  { id: 'sinkK', type: 'sink', name: 'Kitchen Sink', rect: [10, 1, 1, 1], face: 's', slots: [{ tile: [10, 2] }], kitchen: true },
  { id: 'counterK2', type: 'counter', name: 'Counter', rect: [11, 1, 1, 1], face: 's', slots: [{ tile: [11, 2] }] },
  { id: 'fridge', type: 'fridge', name: 'Fridge', rect: [12, 1, 1, 1], face: 's', slots: [{ tile: [12, 2] }] },
  { id: 'table', type: 'table', name: 'Dining Table', rect: [10, 5, 2, 1], face: 's', slots: [{ tile: [10, 4], dish: [10.5, 5.3] }, { tile: [11, 6], dish: [11.5, 5.7] }] },
  { id: 'foodBowl', type: 'foodBowl', name: 'Food Bowl', rect: [8, 9, 1, 1], solid: false, slots: [{ tile: [8, 8] }] },
  { id: 'waterBowl', type: 'waterBowl', name: 'Water Bowl', rect: [9, 9, 1, 1], solid: false, slots: [{ tile: [9, 8] }] },
  { id: 'backDoor', type: 'door', name: 'Back Door', rect: [8, 5, 1, 1], solid: false, slots: [{ tile: [8, 5] }] },
  // Laundry
  { id: 'washer', type: 'washer', name: 'Washer', rect: [15, 0, 1, 1], face: 's', slots: [] },
  { id: 'dryer', type: 'washer', name: 'Dryer', rect: [16, 0, 1, 1], face: 's', slots: [] },
  // Living room
  { id: 'tv', type: 'tv', name: 'TV', rect: [18, 5, 2, 1], face: 's', slots: [] },
  {
    id: 'couch', type: 'couch', name: 'Couch', rect: [17, 8, 4, 1], face: 'n',
    slots: [{ tile: [17, 9], at: [17.5, 8.5] }, { tile: [18, 9], at: [18.5, 8.5] }, { tile: [19, 9], at: [19.5, 8.5] }, { tile: [20, 9], at: [20.5, 8.5] }],
  },
  { id: 'dogBed', type: 'dogBed', name: 'Dog Bed', rect: [21, 12, 1, 1], solid: false, slots: [{ tile: [21, 12] }] },
  { id: 'toy', type: 'toy', name: 'Tennis Ball', rect: [16, 12, 1, 1], solid: false, slots: [{ tile: [16, 11] }] },
  // Garage
  { id: 'car', type: 'car', name: 'Car', rect: [24, 6, 2, 4], face: 's', slots: [] },
  { id: 'bench', type: 'bench', name: 'Workbench', rect: [27, 10, 1, 2], face: 'w', slots: [] },
  // Bedroom 3 (sewing room)
  { id: 'desk', type: 'desk', name: 'Computer', rect: [8, 11, 1, 2], face: 'e', slots: [{ tile: [9, 11], at: [9.3, 11.5] }] },
  { id: 'sewing', type: 'sewing', name: 'Sewing Table', rect: [13, 13, 2, 1], face: 'n', slots: [] },
  // Master bath
  { id: 'sinkMB', type: 'sink', name: 'Bathroom Sink', rect: [20, 14, 1, 1], face: 's', slots: [{ tile: [20, 15] }] },
  { id: 'toiletMB', type: 'toilet', name: 'Toilet', rect: [23, 14, 1, 1], face: 's', slots: [{ tile: [23, 15], at: [23.5, 14.6] }] },
  // Master bedroom (player)
  { id: 'bedP', type: 'bed', name: 'Your Bed', rect: [21, 19, 2, 3], face: 'n', owner: 'player', slots: [{ tile: [20, 20], at: [22, 20.6] }] },
  { id: 'console', type: 'tv', name: 'Game TV', rect: [23, 17, 1, 2], face: 'w', slots: [] },
  // Bathroom
  { id: 'toiletW', type: 'toilet', name: 'Toilet', rect: [15, 22, 1, 1], face: 'n', slots: [{ tile: [15, 21], at: [15.5, 22.4] }] },
  { id: 'tub', type: 'tub', name: 'Bathtub', rect: [16, 22, 2, 1], face: 'n', slots: [] },
  { id: 'sinkW', type: 'sink', name: 'Bathroom Sink', rect: [18, 22, 1, 1], face: 'n', slots: [{ tile: [18, 21] }] },
  // Bedroom 1 (roommate)
  { id: 'bedN', type: 'bed', name: "Sam's Bed", rect: [8, 19, 2, 3], face: 'n', owner: 'npc', slots: [{ tile: [10, 20], at: [9, 20.6] }] },
  { id: 'dresser', type: 'dresser', name: 'Dresser', rect: [13, 22, 2, 1], face: 'n', slots: [] },
  // Yard
  { id: 'tree', type: 'tree', name: 'Tree', rect: [2, 2, 1, 1], slots: [] },
  { id: 'pottySpot', type: 'grass', name: 'Lawn', rect: [3, 8, 1, 1], solid: false, slots: [{ tile: [3, 8] }] },
];

for (const o of OBJECTS) {
  o.room = roomAt(o.rect[0], o.rect[1]);
  if (o.solid === undefined) o.solid = true;
}
export const OBJ = Object.fromEntries(OBJECTS.map((o) => [o.id, o]));

// Carryable cleaning tools and where they live.
export const TOOLS = [
  { id: 'broom', kind: 'broom', name: 'Broom', home: [16, 2] },
  { id: 'mop', kind: 'mop', name: 'Mop Bucket', home: [16, 4] },
  { id: 'vacuum', kind: 'vacuum', name: 'Vacuum', home: [23, 11] },
  { id: 'wipesK', kind: 'wipes', name: 'Wipes', home: [9, 1] },
  { id: 'wipesW', kind: 'wipes', name: 'Wipes', home: [18, 22] },
];

export const START = {
  player: [20, 18],
  npc: [11, 18],
  dog: [19, 11],
};
