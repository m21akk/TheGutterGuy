// Public booking routes:
//   GET  /api/booking-options – services, property types, prices and free slots
//   POST /api/book            – hold a slot and start a Stripe Checkout payment
import { route, json, fail, clean, readJson, siteUrl, niceDate } from '../util.js';
import { PROPERTY_TYPES, QUOTE_ONLY_PROPERTY, STOREYS, SLOT_NAMES, priceFor, activeServices, servicePrice } from '../catalog.js';
import { loadAvailability } from '../booking-data.js';
import { slotIsFree } from '../availability.js';
import { insertJob, updateJob, uploadPhoto } from '../db.js';
import { stripe } from '../stripe.js';
import { base64ToBytes } from '../crypto.js';

const HOLD_MINUTES = 35; // Stripe Checkout gives the customer 30 minutes to pay

export const GET = route(async () => {
  const { settings, availability } = await loadAvailability();
  return json({
    services: activeServices(settings).map((s) => ({ id: s.id, name: s.name, prices: Object.fromEntries(STOREYS.map((n) => [n, servicePrice(s, n)])) })),
    propertyTypes: PROPERTY_TYPES,
    quoteOnlyPropertyTypes: QUOTE_ONLY_PROPERTY,
    storeys: STOREYS,
    slotNames: SLOT_NAMES,
    availability,
  });
});

const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function savePhotos(list) {
  const folder = crypto.randomUUID();
  const paths = [];
  for (const [i, dataUrl] of (Array.isArray(list) ? list.slice(0, 3) : []).entries()) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
    if (!m) continue;
    const bytes = base64ToBytes(m[2]);
    if (bytes.length > 1_500_000) continue;
    paths.push(await uploadPhoto(`${folder}/${i + 1}.${IMAGE_EXT[m[1]]}`, bytes, m[1]));
  }
  return paths;
}

export function customerFields(b) {
  const c = {
    name: clean(b.name, 100),
    email: clean(b.email, 200).toLowerCase(),
    phone: clean(b.phone, 30),
    address: clean(b.address, 200),
    town: clean(b.town, 80),
    postcode: clean(b.postcode, 10).toUpperCase(),
    notes: clean(b.notes, 2000),
  };
  if (!c.name) return [null, 'Please enter your name.'];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) return [null, 'Please enter a valid email address.'];
  if (c.phone.replace(/\D/g, '').length < 10) return [null, 'Please enter a valid phone number.'];
  if (!c.address) return [null, 'Please enter the address of the property.'];
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(c.postcode)) return [null, 'Please enter a valid UK postcode.'];
  return [c, null];
}

export const POST = route(async (request) => {
  const b = await readJson(request);
  if (b.website) return json({ ok: true }); // honeypot

  const property = PROPERTY_TYPES.find((p) => p.id === b.property_type);
  const storeys = STOREYS.includes(String(b.storeys)) ? String(b.storeys) : null;
  if (!property) return fail('Please choose your property type.');
  if (!storeys) return fail('Please choose how many storeys.');
  const [customer, err] = customerFields(b);
  if (err) return fail(err);

  const { settings, availability } = await loadAvailability();
  const services = activeServices(settings);
  const serviceIds = [...new Set(Array.isArray(b.services) ? b.services : [])].filter((id) => services.some((s) => s.id === id));
  if (!serviceIds.length) return fail('Please choose at least one service.');
  const price = priceFor(settings, property.id, storeys, serviceIds);
  if (price === null) return fail('Sorry, that job needs pricing by Roy – please send a booking request instead.');

  const date = String(b.date || '');
  const slot = b.slot === 'pm' ? 'pm' : b.slot === 'am' ? 'am' : null;
  if (!slot || !slotIsFree(availability, date, slot)) {
    return fail('Sorry, that time has just been taken – please pick another slot.', 409);
  }

  const serviceNames = serviceIds.map((id) => services.find((s) => s.id === id).name);
  const job = await insertJob({
    ...customer,
    property_type: property.name,
    storeys,
    services: serviceNames,
    photos: await savePhotos(b.photos),
    status: 'pending',
    booking_type: 'instant',
    price_pence: price,
    scheduled_date: date,
    scheduled_slot: slot,
    hold_expires_at: new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString(),
  });

  const when = `${niceDate(date)}, ${SLOT_NAMES[slot]}`;
  const session = await stripe('/checkout/sessions', {
    mode: 'payment',
    customer_email: customer.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'gbp',
        unit_amount: price,
        product_data: {
          name: `The Gutter Guy – ${when}`,
          description: `${serviceNames.join(', ')} · ${property.name}, ${storeys} storey · ${customer.postcode}`,
        },
      },
    }],
    metadata: { job_id: job.id },
    payment_intent_data: { metadata: { job_id: job.id }, description: `Gutter Guy booking ${when}` },
    success_url: `${siteUrl()}/booked?date=${date}&slot=${slot}`,
    cancel_url: `${siteUrl()}/#book`,
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
  });

  await updateJob(job.id, { stripe_session_id: session.id });
  return json({ url: session.url });
});
