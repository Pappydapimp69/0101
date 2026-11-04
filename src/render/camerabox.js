// Camera dead-zone box: the camera stays still while the player moves inside a box around the
// screen centre, and is pushed along only when the player reaches the box edge, so the player
// never leaves it. Pure math (no three.js) so it can be tested at any camera yaw (Brain
// opticon#E42: a camera-relative bug can hide at the default pose).
//
// Ground offsets project to the screen of an orthographic isometric camera as:
//   screen x = offset . right,            right = (cos yaw, -sin yaw)
//   screen y = (offset . fwd) * sin(pitch), fwd  = (-sin yaw, -cos yaw)  (screen up, on the ground)
export const BOX = { x: 0.4, y: 0.35 }; // half-size as a share of the view's half-width / half-height

// target, player: {x, z} on the ground. halfW, halfH: the view's half extents in world units.
// Returns the new camera target (a new object); unchanged if the player is inside the box.
export function clampToBox(target, player, yaw, pitch, halfW, halfH, box = BOX) {
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const dx = player.x - target.x;
  const dz = player.z - target.z;
  const sx = dx * rx + dz * rz;
  const sf = dx * fx + dz * fz; // along the ground "up the screen" direction
  const sy = sf * Math.sin(pitch);
  const bx = box.x * halfW;
  const by = box.y * halfH;
  const ex = Math.abs(sx) > bx ? sx - Math.sign(sx) * bx : 0;
  const eyScreen = Math.abs(sy) > by ? sy - Math.sign(sy) * by : 0;
  const ef = eyScreen / Math.sin(pitch);
  return { x: target.x + ex * rx + ef * fx, z: target.z + ex * rz + ef * fz };
}

// Where the player sits on screen, as a share of the half extents (for tests and checks).
export function screenOffset(target, player, yaw, pitch, halfW, halfH) {
  const dx = player.x - target.x;
  const dz = player.z - target.z;
  const sx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const sy = (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) * Math.sin(pitch);
  return { x: sx / halfW, y: sy / halfH };
}
