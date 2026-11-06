// Groceries: the fridge holds dated portions, eaten oldest first (Brain 0101#E21); food keeps 7 days.
// Brain 0101#E51 priced groceries in this game: money barely binds (the player has ~4x headroom), so
// what shapes the week is LEAD TIME and SHELF LIFE, not price. So food is ordered online at the
// computer and arrives the next morning; forget to order and the fridge runs dry. Sam restocks when
// it's nearly empty, and minds if they're the one always buying.
import { HOUR, DAY, log } from './state.js?v=e1e5bd1';
import { addBond } from './bond.js?v=e1e5bd1';

export const GROCERY = {
  shelfDays: 7,
  price: 4, // $ per portion
  fee: 8, // delivery
  order: 16, // portions per order: a week for one person at ~2.2 a day, plus a margin
  start: 16,
  arriveHour: 10, // delivered the next morning at 10:00
  // Sam reorders at a high quantile of what the house eats before a delivery can land (Brain 0101#E5):
  // ~5.3 portions a day x up to 34 h of lead time x 1.3. Measured: a reorder point of 2 left the
  // fridge empty 73-77% of hungry minutes and Sam's hunger at 0.
  samBelow: 10, // counting what's already on the way
  samOrder: 16,
  portions: { snack: 1, cook: 2 },
};

export function initGroceries(st) {
  st.fridge = Array.from({ length: GROCERY.start }, (_, i) => st.time + GROCERY.shelfDays * DAY - i * HOUR);
  st.fridge.sort((a, b) => a - b);
  st.deliveries = [];
  st.samBuysInARow = 0;
}

export const fridgeCount = (st) => (st.fridge ? st.fridge.length : 0);
export const hasFood = (st, kind) => fridgeCount(st) >= GROCERY.portions[kind];
export const onTheWay = (st) => (st.deliveries || []).reduce((n, d) => n + d.n, 0);

// Take portions, oldest first. False if there isn't enough.
export function takeFood(st, kind) {
  const n = GROCERY.portions[kind];
  if (fridgeCount(st) < n) return false;
  st.fridge.splice(0, n);
  return true;
}

const nextMorning = (st) => (Math.floor(st.time / DAY) + 1) * DAY + GROCERY.arriveHour * HOUR;

export function orderGroceries(st, who = 'player', n = GROCERY.order) {
  const cost = n * GROCERY.price + GROCERY.fee;
  if (who === 'player') {
    if (st.money < cost) return `not enough money ($${cost})`;
    st.money = Math.round((st.money - cost) * 100) / 100;
    st.samBuysInARow = 0;
  }
  st.deliveries.push({ at: nextMorning(st), n, who });
  log(st, who === 'player' ? `🛒 Ordered ${n} portions of groceries ($${cost}). They arrive tomorrow at ${GROCERY.arriveHour}:00.` : `🛒 Sam ordered groceries; they arrive tomorrow at ${GROCERY.arriveHour}:00.`, who === 'player' ? 'player' : 'npc');
  return null;
}

// Once a game minute: deliveries arrive, old food goes off, Sam restocks if it's nearly empty.
export function groceryTick(st) {
  if (!st.fridge) return;
  for (const d of [...st.deliveries]) {
    if (st.time >= d.at) {
      for (let i = 0; i < d.n; i++) st.fridge.push(st.time + GROCERY.shelfDays * DAY);
      st.fridge.sort((a, b) => a - b);
      st.deliveries.splice(st.deliveries.indexOf(d), 1);
      log(st, `🛒 Groceries arrived: ${d.n} portions in the fridge.`, d.who === 'player' ? 'player' : 'npc');
    }
  }
  const before = st.fridge.length;
  st.fridge = st.fridge.filter((exp) => exp > st.time);
  const off = before - st.fridge.length;
  if (off) {
    st.spoiled = (st.spoiled || 0) + off;
    log(st, `Some food went off in the fridge (${off} portion${off > 1 ? 's' : ''}).`);
  }
  const npc = st.agents.npc;
  if (fridgeCount(st) + onTheWay(st) <= GROCERY.samBelow && !npc.away && !npc.asleep) {
    orderGroceries(st, 'npc', GROCERY.samOrder);
    st.samBuysInARow = (st.samBuysInARow || 0) + 1;
    if (st.samBuysInARow >= 3) addBond(st, -3, 'always buying the groceries');
    if (st.samBuysInARow === 3) log(st, 'Sam: "I keep buying all the food, you know."', 'npc');
  }
}
