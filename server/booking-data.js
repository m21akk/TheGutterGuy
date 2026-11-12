// Loads settings + time off + booked jobs and works out free slots.
import { getSettingsRow, listTimeOff, jobsBetween } from './db.js';
import { mergeSettings } from './catalog.js';
import { computeAvailability, londonToday, addDays } from './availability.js';

export async function loadSettings() {
  return mergeSettings(await getSettingsRow());
}

export async function loadAvailability(now = new Date()) {
  const settings = await loadSettings();
  const today = londonToday(now);
  const to = addDays(today, Math.max(1, settings.max_days_ahead ?? 60));
  const [timeOff, jobs] = await Promise.all([listTimeOff(today), jobsBetween(today, to)]);
  return { settings, availability: computeAvailability(settings, timeOff, jobs, now) };
}
