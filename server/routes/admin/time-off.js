// /api/admin/time-off – Roy's holidays and days off. These dates are
// automatically removed from the booking calendar.
import { route, json, fail, clean, readJson } from '../../util.js';
import { requireAdmin } from '../../auth.js';
import { listTimeOff, addTimeOff, deleteTimeOff } from '../../db.js';
import { londonToday, addDays } from '../../availability.js';

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export const GET = route(async (request) => {
  await requireAdmin(request);
  return json({ timeOff: await listTimeOff(addDays(londonToday(), -60)) });
});

export const POST = route(async (request) => {
  await requireAdmin(request);
  const b = await readJson(request, 10_000);
  const start = b.start_date;
  const end = b.end_date || b.start_date;
  if (!isDate(start) || !isDate(end)) return fail('Pick the dates.');
  if (end < start) return fail('The end date is before the start date.');
  const row = await addTimeOff({
    start_date: start,
    end_date: end,
    slot: ['am', 'pm'].includes(b.slot) ? b.slot : 'all',
    note: clean(b.note, 200) || null,
  });
  return json({ timeOff: row });
});

export const DELETE = route(async (request) => {
  await requireAdmin(request);
  const id = new URL(request.url).searchParams.get('id');
  await deleteTimeOff(id);
  return json({ ok: true });
});
