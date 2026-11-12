// POST /api/request – a customer submits the quote request form.
import { route, json, fail, clean, readJson } from '../util.js';
import { insertJob, uploadPhoto } from '../db.js';
import { requestReceived, newRequestAlert } from '../email.js';
import { base64ToBytes } from '../crypto.js';

export const SERVICES = [
  'Gutters vacuumed / cleared',
  'Fascia & gutter cleaning',
  'Conservatory roof cleaning',
  'Cladding cleaning',
  'Gutter repairs',
  'Not sure – please advise',
];
const PROPERTY_TYPES = ['Terraced', 'Semi-detached', 'Detached', 'Bungalow', 'Flat / apartment', 'Commercial', 'Other'];
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 1_500_000;

export const POST = route(async (request) => {
  const b = await readJson(request);

  // Honeypot: real people never fill this hidden field in.
  if (b.website) return json({ ok: true });

  const job = {
    name: clean(b.name, 100),
    email: clean(b.email, 200).toLowerCase(),
    phone: clean(b.phone, 30),
    address: clean(b.address, 200),
    town: clean(b.town, 80),
    postcode: clean(b.postcode, 10).toUpperCase(),
    property_type: PROPERTY_TYPES.includes(b.property_type) ? b.property_type : null,
    storeys: ['1', '2', '3+'].includes(String(b.storeys)) ? String(b.storeys) : null,
    services: Array.isArray(b.services) ? b.services.filter((s) => SERVICES.includes(s)) : [],
    preferred_date: /^\d{4}-\d{2}-\d{2}$/.test(b.preferred_date || '') ? b.preferred_date : null,
    notes: clean(b.notes, 2000),
    status: 'new',
  };

  if (!job.name) return fail('Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(job.email)) return fail('Please enter a valid email address.');
  if (job.phone.replace(/\D/g, '').length < 10) return fail('Please enter a valid phone number.');
  if (!job.address) return fail('Please enter the address of the property.');
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(job.postcode)) return fail('Please enter a valid UK postcode.');
  if (!job.services.length) return fail('Please choose at least one service.');

  // Photos arrive as data URLs (already shrunk in the browser).
  const photos = Array.isArray(b.photos) ? b.photos.slice(0, MAX_PHOTOS) : [];
  const folder = crypto.randomUUID();
  job.photos = [];
  for (const [i, dataUrl] of photos.entries()) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
    if (!m) continue;
    const bytes = base64ToBytes(m[2]);
    if (bytes.length > MAX_PHOTO_BYTES) continue;
    const path = `${folder}/${i + 1}.${IMAGE_TYPES[m[1]]}`;
    job.photos.push(await uploadPhoto(path, bytes, m[1]));
  }

  const saved = await insertJob(job);
  await Promise.all([requestReceived(saved), newRequestAlert(saved)]);
  return json({ ok: true });
});
