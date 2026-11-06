// Low-need alerts for the player. Brain 0101#E35: size an alert by its REAL-time window. Bladder
// from 20 to 0 is 2 game hours = 40 real s at 1x, 10 s at 4x, 2.5 s at 4x on the phone, so a toast
// alone gets missed. So: a toast when a need first drops under 20, a sticky alert (tap to fix) for
// as long as it stays low, fast-forward stops (the phone / computer goes down and main.js drops the
// game speed to 1x), and sleep is interrupted (see T.sleep).
import { OBJ, OBJECTS } from './map.js?v=185d140';
import { log, dist } from './state.js?v=185d140';
import { cancelTask } from './tasks.js?v=185d140';

export const ALERT = { at: 20, clear: 30 }; // hysteresis: alert under 20, cleared above 30
// How to act on the alert, per input. main.js binds the same thing (gamepad Y, alert first), so the
// prompt and the button can't drift apart (Brain the-game-wrong-sky#E6).
export const ALERT_KEY = { touch: 'Tap', mouse: 'Click', pad: 'Press Ⓨ' };

export const NEED_ALERT = {
  bladder: { icon: '🚽', say: 'You need the toilet!', act: 'to go' },
  hunger: { icon: '🍔', say: 'You’re starving.', act: 'to grab a snack' },
  thirst: { icon: '💧', say: 'You’re really thirsty.', act: 'for a drink' },
  energy: { icon: '⚡', say: 'You’re exhausted.', act: 'to go to bed' },
  social: { icon: '💬', say: 'You’re lonely.', act: 'to call someone' },
};

const nearest = (st, ids) => ids.map((id) => OBJ[id]).sort((a, b) => dist(st.agents.player, { x: a.rect[0] + 0.5, z: a.rect[1] + 0.5 }) - dist(st.agents.player, { x: b.rect[0] + 0.5, z: b.rect[1] + 0.5 }))[0].id;

function fixFor(st, k) {
  switch (k) {
    case 'bladder': return { type: 'toilet', obj: nearest(st, OBJECTS.filter((o) => o.type === 'toilet').map((o) => o.id)) };
    case 'hunger': return (st.fridge && st.fridge.length) ? { type: 'snack' } : { type: 'orderGroceries' };
    case 'thirst': return { type: 'drinkSink', obj: nearest(st, OBJECTS.filter((o) => o.type === 'sink').map((o) => o.id)) };
    case 'energy': return { type: 'sleep', obj: OBJECTS.find((o) => o.type === 'bed' && o.owner === 'player').id };
    case 'social': return { type: 'phone' };
    default: return null;
  }
}

// Every 10 game seconds.
export function alertTick(st) {
  const p = st.agents.player;
  if (!st.lowNeeds) st.lowNeeds = {};
  for (const k of Object.keys(NEED_ALERT)) {
    const v = p.needs[k];
    if (!st.lowNeeds[k] && v < ALERT.at) {
      st.lowNeeds[k] = st.time;
      const a = NEED_ALERT[k];
      log(st, `${a.icon} ${a.say}`, 'alert');
      st.alertEvent = (st.alertEvent || 0) + 1; // main.js drops fast-forward to 1x on this
      const t = p.task;
      if (t && t.timeScale > 1 && !t.sleeping) {
        cancelTask(st, p); // put the phone / computer down (time stops racing)
        log(st, 'You put it down. That can’t wait.', 'player');
      }
    } else if (st.lowNeeds[k] && v > ALERT.clear) {
      delete st.lowNeeds[k];
    }
  }
}

// The most pressing low need, for the HUD's sticky alert: { k, icon, text, cmd } or null.
export function activeAlert(st) {
  const p = st.agents.player;
  const low = Object.keys(st.lowNeeds || {}).filter((k) => p.needs[k] < ALERT.clear);
  if (!low.length) return null;
  low.sort((a, b) => p.needs[a] - p.needs[b]);
  const k = low[0];
  const a = NEED_ALERT[k];
  return { k, icon: a.icon, text: a.say, act: a.act, cmd: fixFor(st, k), value: p.needs[k] };
}
