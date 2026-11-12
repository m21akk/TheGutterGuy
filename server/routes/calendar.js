// GET /api/calendar?token=... – a calendar feed Roy can subscribe to on his
// phone (iPhone, Google Calendar, Outlook) so booked jobs appear automatically.
import { env } from '../util.js';
import { safeEqual } from '../crypto.js';
import { scheduledJobs } from '../db.js';

const SLOT_LABEL = { am: 'AM', pm: 'PM' };

function esc(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line) {
  const out = [];
  while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); }
  out.push(line);
  return out.join('\r\n');
}

export function buildCalendar(jobs, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Gutter Guy//Jobs//EN', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:Gutter Guy jobs', 'X-PUBLISHED-TTL:PT1H'];
  for (const j of jobs) {
    const day = j.scheduled_date.replace(/-/g, '');
    const next = new Date(j.scheduled_date + 'T12:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    const end = next.toISOString().slice(0, 10).replace(/-/g, '');
    const paid = j.status === 'paid' || j.status === 'completed' ? 'PAID' : 'NOT PAID';
    const slot = SLOT_LABEL[j.scheduled_slot] ? `${SLOT_LABEL[j.scheduled_slot]} · ` : '';
    const price = j.price_pence ? ` £${(j.price_pence / 100).toFixed(2)}` : '';
    lines.push('BEGIN:VEVENT',
      `UID:${j.id}@the-gutterguy.co.uk`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${end}`,
      fold(`SUMMARY:${esc(`${slot}${j.name} – ${j.postcode} (${paid}${price})`)}`),
      fold(`LOCATION:${esc([j.address, j.town, j.postcode].filter(Boolean).join(', '))}`),
      fold(`DESCRIPTION:${esc([`Phone: ${j.phone}`, `Services: ${(j.services || []).join(', ')}`, j.notes, j.admin_notes].filter(Boolean).join('\n'))}`),
      `STATUS:${j.status === 'completed' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!(await safeEqual(token, env('CALENDAR_TOKEN')))) return new Response('Not found', { status: 404 });
  const body = buildCalendar(await scheduledJobs());
  return new Response(body, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
