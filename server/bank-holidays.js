// England & Wales bank holidays, worked out for any year (no internet needed).
// One-off extra holidays (e.g. a coronation) can be added by Roy in Time off.

function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function dow(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function easterSunday(y) {
  // Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
function shift(date, days) {
  const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
function firstMonday(y, m) {
  for (let d = 1; ; d++) if (dow(y, m, d) === 1) return iso(y, m, d);
}
function lastMonday(y, m) {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = last; ; d--) if (dow(y, m, d) === 1) return iso(y, m, d);
}

export function bankHolidays(y) {
  const out = new Set();
  // New Year's Day – moves to Monday if it falls at the weekend
  let nyd = 1;
  while ([0, 6].includes(dow(y, 1, nyd))) nyd++;
  out.add(iso(y, 1, nyd));
  // Easter
  const easter = easterSunday(y);
  out.add(shift(easter, -2)); // Good Friday
  out.add(shift(easter, 1));  // Easter Monday
  // May and August
  out.add(y === 2020 ? '2020-05-08' : firstMonday(y, 5)); // early May
  out.add(y === 2022 ? '2022-06-02' : y === 2012 ? '2012-06-04' : lastMonday(y, 5)); // spring
  if (y === 2022) out.add('2022-06-03');
  out.add(lastMonday(y, 8)); // summer
  // Christmas and Boxing Day – weekend ones move to the next free weekday
  for (const d of [25, 26]) {
    let day = d;
    while ([0, 6].includes(dow(y, 12, day)) || out.has(iso(y, 12, day))) day++;
    out.add(iso(y, 12, day));
  }
  return out;
}

const cache = {};
export function isBankHoliday(isoDate) {
  const y = Number(isoDate.slice(0, 4));
  return (cache[y] ||= bankHolidays(y)).has(isoDate);
}
