// Gamepad input (standard mapping). Pure helpers are exported for tests; the reader polls
// navigator.getGamepads() every frame (Chrome hides a pad from events until a button press).

export const BTN = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

export const DEAD = 0.35;

// Stick → one of 8 tile directions, relative to the CAMERA (stick up = up the screen), so it
// stays right after Q/E rotation. Camera sits at +(sin yaw, cos yaw) from its target.
export function stickToDir(sx, sy, yaw, dead = DEAD) {
  if (Math.hypot(sx, sy) < dead) return null;
  const up = -sy;
  const wx = sx * Math.cos(yaw) - up * Math.sin(yaw);
  const wz = -sx * Math.sin(yaw) - up * Math.cos(yaw);
  const k = Math.round(Math.atan2(wz, wx) / (Math.PI / 4));
  const a = (k * Math.PI) / 4;
  return [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
}

// Menu navigation from a stick/d-pad axis value with a latch: a direction already held when the
// menu opened (or since the last step) does nothing until the input returns to neutral.
export function createNavLatch({ press = 0.6, neutral = 0.3 } = {}) {
  let latched = true;
  return {
    reset() { latched = true; },
    step(v) {
      if (Math.abs(v) < neutral) { latched = false; return 0; }
      if (latched || Math.abs(v) < press) return 0;
      latched = true;
      return Math.sign(v);
    },
  };
}

export function createPadReader() {
  let prev = [];
  let index = null;
  return {
    poll() {
      const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
      let pad = index !== null ? pads[index] : null;
      if (!pad || !pad.connected) {
        pad = null;
        for (const p of pads) if (p && p.connected) { pad = p; index = p.index; break; }
      }
      if (!pad) { prev = []; return null; }
      const now = pad.buttons.map((b) => b.pressed || b.value > 0.5);
      const value = pad.buttons.map((b) => b.value);
      const was = prev;
      prev = now;
      const ax = pad.axes;
      const active = now.some(Boolean) || ax.some((v) => Math.abs(v) > DEAD);
      return {
        id: pad.id,
        active,
        held: (i) => !!now[i],
        pressed: (i) => !!now[i] && !was[i],
        value: (i) => value[i] || 0,
        lx: ax[0] || 0, ly: ax[1] || 0, rx: ax[2] || 0, ry: ax[3] || 0,
      };
    },
  };
}
