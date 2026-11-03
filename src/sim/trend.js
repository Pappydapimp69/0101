// Rate of change for a set of values, measured in GAME time so it reads the same at any speed
// (phone ×4, sleep ×8). Rates are points per game hour.
export function createTrend({ window = 120, every = 10 } = {}) {
  let hist = []; // [gameTime, {k: v}]
  return {
    push(t, values) {
      if (hist.length && t < hist[hist.length - 1][0]) hist = []; // time went backwards (new game)
      if (hist.length && t - hist[hist.length - 1][0] < every) return;
      hist.push([t, { ...values }]);
      while (hist.length > 2 && t - hist[1][0] >= window) hist.shift();
    },
    rate(k) {
      if (hist.length < 2) return 0;
      const [t0, a] = hist[0];
      const [t1, b] = hist[hist.length - 1];
      const dt = t1 - t0;
      return dt > 0 ? ((b[k] - a[k]) * 3600) / dt : 0;
    },
  };
}

// Direction for display: 'up', 'down' or '' (steady, or pinned at 0/100).
export function direction(rate, value) {
  if (rate > 1 && value < 99.5) return 'up';
  if (rate < -1 && value > 0.5) return 'down';
  return '';
}

// "empty in 3h 10m" / "full in 25m" for a value moving at `rate` points per game hour.
// With `hour` and `sleepFactor`, a falling need is projected through the night (23:00-7:00) at the
// slower asleep rate instead of assuming today's awake rate holds all night.
export function eta(rate, value, hour = null, sleepFactor = null) {
  const d = direction(rate, value);
  if (!d) return '';
  let hours = d === 'up' ? (100 - value) / rate : value / -rate;
  if (d === 'down' && hour !== null && sleepFactor) {
    const asleep = (h) => { const x = ((h % 24) + 24) % 24; return x >= 23 || x < 7; };
    // the measured rate is an awake rate if it's daytime now, an asleep rate if it's night now
    const awakeRate = asleep(hour) ? -rate / sleepFactor : -rate;
    let v = value;
    let t = 0;
    const step = 1 / 6;
    while (v > 0 && t < 48) { v -= awakeRate * (asleep(hour + t) ? sleepFactor : 1) * step; t += step; }
    hours = v > 0 ? Infinity : t;
  }
  if (!Number.isFinite(hours) || hours > 48) return '';
  const m = Math.max(1, Math.round(hours * 60));
  const txt = m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
  return d === 'up' ? `full in ${txt}` : `empty in ${txt}`;
}
