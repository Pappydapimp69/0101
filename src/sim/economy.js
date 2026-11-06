// Money and bills. You earn money working at the computer; every Monday morning the week's bills
// arrive (your share of rent, power, water and internet) and are due 3 days later. Late bills pick
// up a fee each day and weigh on your mood until paid. Paying is done online, from anywhere.
import { DAY, HOUR, log, dayOf } from './state.js?v=c2e6ea7';
import { weekdayOf } from './schedule.js?v=c2e6ea7';
import { litRooms } from './daylight.js?v=c2e6ea7';

export const ECON = {
  start: 600,
  wage: 18, // $ per game hour working
  rentShare: 300, // your half of the rent, per week
  internetShare: 10,
  utilShare: 0.5, // you pay half the power and water; Sam pays the rest
  power: { base: 1.5 / 24, light: 0.25, tv: 0.15, computer: 0.2, perMeal: 1.0 }, // $/h, or $ per use
  water: { base: 0.5 / 24, flush: 0.4, drink: 0.1, dish: 0.15, cook: 0.3, mop: 0.5 },
  billDayHour: 9, // Monday 9 AM
  dueDays: 3,
  lateFee: 10, // per overdue bill per day
  lateMood: -8,
};

export function initEconomy(st) {
  st.money = ECON.start;
  st.bills = [];
  st.usage = { power: 0, water: 0 };
  st.lastBillDay = 0;
}

export function usePower(st, dollars) { st.usage.power += dollars; }
export function useWater(st, dollars) { st.usage.water += dollars; }

// Continuous usage, once per sim step (dt seconds).
export function meter(st, dt) {
  const P = ECON.power;
  const h = dt / HOUR;
  let p = P.base * h + litRooms(st).size * P.light * h;
  for (const a of [st.agents.player, st.agents.npc]) {
    if (!a.task || a.away) continue;
    if (a.task.name === 'tv' && a.task.phase === 'act') p += P.tv * h;
    if ((a.task.name === 'computer' || a.task.name === 'work') && a.task.phase === 'act') p += P.computer * h;
  }
  st.usage.power += p;
  st.usage.water += ECON.water.base * h;
}

const round = (x) => Math.round(x * 100) / 100;

// Called every step; issues bills on Monday morning and charges late fees daily.
export function billing(st) {
  const day = dayOf(st);
  const hour = (st.time % DAY) / HOUR;
  if (hour < ECON.billDayHour) return;
  if (st.lastBillDay === day) return;
  st.lastBillDay = day;

  // late fees, once a day at bill hour
  let overdue = 0;
  for (const b of st.bills) {
    if (b.paid || st.time < b.due) continue;
    b.amount = round(b.amount + ECON.lateFee);
    b.late = (b.late || 0) + 1;
    overdue++;
  }
  if (overdue) log(st, `⚠️ ${overdue} bill${overdue > 1 ? 's are' : ' is'} overdue — late fees added.`, 'player');

  if (weekdayOf(day) !== 0) return; // new bills on Mondays
  const due = st.time + ECON.dueDays * DAY;
  const add = (name, icon, amount) => st.bills.push({ id: st.nextId++, name, icon, amount: round(amount), issued: st.time, due, paid: false });
  add('Rent (your share)', '🏠', ECON.rentShare);
  add('Power (your half)', '⚡', st.usage.power * ECON.utilShare);
  add('Water (your half)', '🚿', st.usage.water * ECON.utilShare);
  add('Internet (your half)', '📶', ECON.internetShare);
  st.usage = { power: 0, water: 0 };
  const total = unpaid(st).reduce((s, b) => s + b.amount, 0);
  log(st, `📬 Bills arrived — $${total.toFixed(0)} due ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekdayOf(dayOf({ time: due }))]}.`, 'player');
}

export const unpaid = (st) => st.bills.filter((b) => !b.paid);
export const overdueBills = (st) => unpaid(st).filter((b) => st.time >= b.due);

// Pay one bill (id) or everything you can afford, oldest first. Returns the number paid.
export function pay(st, id = null) {
  let n = 0;
  const list = unpaid(st).filter((b) => id === null || b.id === id).sort((a, b) => a.due - b.due);
  for (const b of list) {
    if (st.money + 1e-9 < b.amount) continue;
    st.money = round(st.money - b.amount);
    b.paid = true;
    b.paidAt = st.time;
    n++;
  }
  if (n) log(st, `Paid ${n} bill${n > 1 ? 's' : ''}. Balance $${st.money.toFixed(0)}.`, 'player');
  else if (list.length) log(st, 'Not enough money to pay that yet.', 'player');
  // keep the list short: drop bills paid more than a week ago
  st.bills = st.bills.filter((b) => !b.paid || st.time - b.paidAt < 7 * DAY);
  return n;
}
