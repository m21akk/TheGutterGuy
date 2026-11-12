// POST /api/request – a booking request for a job that Roy needs to price first
// (commercial/other properties, gutter repairs, or anything without a set price).
import { route, json, fail, readJson } from '../util.js';
import { insertJob } from '../db.js';
import { requestReceived, newRequestAlert } from '../email.js';
import { PROPERTY_TYPES, QUOTE_ONLY_PROPERTY, STOREYS, SLOT_NAMES } from '../catalog.js';
import { loadSettings } from '../booking-data.js';
import { customerFields, savePhotos } from './booking.js';

const NOT_SURE = 'Not sure – please advise';
const ALL_PROPERTY = [...PROPERTY_TYPES, ...QUOTE_ONLY_PROPERTY];

export const POST = route(async (request) => {
  const b = await readJson(request);
  if (b.website) return json({ ok: true }); // honeypot

  const [customer, err] = customerFields(b);
  if (err) return fail(err);

  // Accept ids (booking widget) or names.
  const SERVICES = (await loadSettings()).services;
  const services = (Array.isArray(b.services) ? b.services : [])
    .map((v) => (v === 'unsure' || v === NOT_SURE ? NOT_SURE : SERVICES.find((s) => s.id === v || s.name === v)?.name))
    .filter(Boolean);
  if (!services.length) return fail('Please choose at least one service.');
  const property = ALL_PROPERTY.find((p) => p.id === b.property_type || p.name === b.property_type);
  const slot = SLOT_NAMES[b.slot] ? b.slot : null;
  const preferred = /^\d{4}-\d{2}-\d{2}$/.test(b.date || b.preferred_date || '') ? b.date || b.preferred_date : null;

  const job = await insertJob({
    ...customer,
    notes: [customer.notes, slot && preferred ? `Preferred time: ${SLOT_NAMES[slot]}` : ''].filter(Boolean).join('\n') || null,
    property_type: property?.name || null,
    storeys: STOREYS.includes(String(b.storeys)) ? String(b.storeys) : null,
    services: [...new Set(services)],
    preferred_date: preferred,
    photos: await savePhotos(b.photos),
    status: 'new',
    booking_type: 'quote',
  });
  await Promise.all([requestReceived(job), newRequestAlert(job)]);
  return json({ ok: true });
});

