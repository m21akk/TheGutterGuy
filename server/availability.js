// Works out which mornings/afternoons still have space, taking into account
// Roy's working days, time off, and jobs already booked (or being paid for right now).

export function londonToday(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekday(iso) {
  return new Date(iso + 'T12:00:00Z').getUTCDay();
}

// Jobs that take up a slot.
export function holdsSlot(job, now = new Date()) {
  if (!job.scheduled_date) return false;
  if (['quoted', 'paid', 'completed'].includes(job.status)) return true;
  if (job.status === 'pending') return job.hold_expires_at && new Date(job.hold_expires_at) > now;
  return false;
}

/**
 * Returns { 'YYYY-MM-DD': { am: freeCount, pm: freeCount } } for bookable days only.
 */
export function computeAvailability(settings, timeOff, jobs, now = new Date()) {
  const today = londonToday(now);
  const first = addDays(today, Math.max(0, settings.min_notice_days ?? 1));
  const last = addDays(today, Math.max(1, settings.max_days_ahead ?? 60));
  const slots = ['am', 'pm'].filter((s) => settings.slots?.[s]);
  const cap = Math.max(1, settings.capacity_per_slot || 1);

  const used = {};
  for (const j of jobs) {
    if (!holdsSlot(j, now)) continue;
    const key = j.scheduled_date;
    used[key] ||= { am: 0, pm: 0 };
    if (j.scheduled_slot === 'pm') used[key].pm++;
    else used[key].am++; // 'am' and 'any'
  }

  const days = {};
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (!settings.working_days.includes(weekday(d))) continue;
    const off = timeOff.filter((t) => t.start_date <= d && d <= t.end_date);
    if (off.some((t) => !t.slot || t.slot === 'all')) continue;
    const day = {};
    for (const s of slots) {
      if (off.some((t) => t.slot === s)) continue;
      const free = cap - (used[d]?.[s] || 0);
      if (free > 0) day[s] = free;
    }
    if (Object.keys(day).length) days[d] = day;
  }
  return { first, last, days };
}

export function slotIsFree(availability, date, slot) {
  return (availability.days[date]?.[slot] || 0) > 0;
}
