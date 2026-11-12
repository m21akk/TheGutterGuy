// End-to-end test of the API with Stripe, Supabase and Resend faked out.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

Object.assign(process.env, {
  SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc', STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x', RESEND_API_KEY: 're_x', OWNER_EMAIL: 'roy@test', ADMIN_PASSWORD: 'gutters123',
  SESSION_SECRET: 's'.repeat(40), CALENDAR_TOKEN: 'caltok', SITE_URL: 'https://www.the-gutterguy.co.uk',
});

const rows = []; const settingsRows = []; const timeOffRows = []; const emails = []; const stripeCalls = []; const uploads = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); const method = opts.method || 'GET';
  const ok = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status });
  const tableMatch = /^https:\/\/db\.test\/rest\/v1\/(jobs|settings|time_off)/.exec(url);
  if (tableMatch) {
    const table = { jobs: rows, settings: settingsRows, time_off: timeOffRows }[tableMatch[1]];
    const q = new URL(url).searchParams;
    const filt = (r) => {
      for (const [k, v] of q) {
        if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
        const val = r[k] == null ? null : String(r[k]);
        if (v.startsWith('eq.') && val !== v.slice(3)) return false;
        if (v.startsWith('neq.') && val === v.slice(4)) return false;
        if (v === 'not.is.null' && val == null) return false;
        if (v.startsWith('gte.') && !(val >= v.slice(4))) return false;
        if (v.startsWith('lte.') && !(val <= v.slice(4))) return false;
        if (v.startsWith('in.(') && !v.slice(4, -1).split(',').includes(val)) return false;
        if (v.startsWith('not.in.(') && v.slice(8, -1).split(',').includes(val)) return false;
      }
      return true;
    };
    if (method === 'POST') {
      const body = JSON.parse(opts.body);
      if (tableMatch[1] === 'settings') { settingsRows.length = 0; settingsRows.push(body); return ok([body], 201); }
      const r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...body }; table.push(r); return ok([r], 201);
    }
    if (method === 'PATCH') { const hit = table.filter(filt); hit.forEach((r) => Object.assign(r, JSON.parse(opts.body))); return ok(hit); }
    if (method === 'DELETE') { const keep = table.filter((r) => !filt(r)); table.length = 0; table.push(...keep); return ok(null, 204); }
    return ok(table.filter(filt));
  }
  if (url.startsWith('https://db.test/storage/v1/object/sign')) return ok(JSON.parse(opts.body).paths.map((p) => ({ path: p, signedURL: `/object/sign/job-photos/${p}?token=t` })));
  if (url.startsWith('https://db.test/storage/v1/object/')) { uploads.push(url); return ok({ Key: url }); }
  if (url.startsWith('https://api.stripe.com/v1')) {
    const path = url.slice('https://api.stripe.com/v1'.length).split('?')[0];
    const body = Object.fromEntries(new URLSearchParams(opts.body || ''));
    stripeCalls.push({ method, path, body });
    assert.equal(opts.headers.Authorization, 'Bearer sk_test_x');
    if (path === '/customers') return ok({ id: 'cus_1' });
    if (path === '/checkout/sessions') return ok({ id: 'cs_' + stripeCalls.length, url: 'https://checkout.stripe.com/c/pay/cs_' + stripeCalls.length });
    if (path === '/invoices' && method === 'POST') return ok({ id: 'in_' + stripeCalls.length, status: 'draft' });
    if (path.endsWith('/finalize')) return ok({ id: path.split('/')[2], hosted_invoice_url: 'https://invoice.stripe.com/i/' + path.split('/')[2], status: 'open' });
    if (/^\/invoices\/in_\d+$/.test(path) && method === 'GET') return ok({ id: path.split('/')[2], status: 'open' });
    return ok({ id: 'x', status: 'open' });
  }
  if (url.startsWith('https://places.googleapis.com/v1/places/')) {
    assert.equal(opts.headers['X-Goog-Api-Key'], 'gkey');
    return ok({ googleMapsUri: 'https://maps.google.com/?cid=1', reviews: [
      { rating: 5, originalText: { text: 'Roy was brilliant, gutters spotless.' }, authorAttribution: { displayName: 'Jo B', uri: 'https://g/jo' }, relativePublishTimeDescription: 'a week ago' },
      { rating: 2, originalText: { text: 'Late.' }, authorAttribution: { displayName: 'X' } },
      { rating: 5, text: { text: 'Great job' }, authorAttribution: { displayName: 'Sam' } } ] });
  }
  if (url === 'https://api.resend.com/emails') { emails.push(JSON.parse(opts.body)); return ok({ id: 'em' }); }
  throw new Error('Unexpected fetch ' + url);
};

const req = (url, { method = 'GET', body, headers = {} } = {}) =>
  new Request('https://www.the-gutterguy.co.uk' + url, { method, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), headers: { 'content-type': 'application/json', ...headers } });

const R = await import('../server/routes/request.js');
const S = await import('../server/routes/admin/session.js');
const J = await import('../server/routes/admin/jobs.js');
const Q = await import('../server/routes/admin/send-quote.js');
const W = await import('../server/routes/stripe-webhook.js');
const C = await import('../server/routes/calendar.js');
const B = await import('../server/routes/booking.js');
const ST = await import('../server/routes/admin/settings.js');
const TO = await import('../server/routes/admin/time-off.js');
const AV = await import('../server/availability.js');
const L = await import('../server/routes/admin/calendar-link.js');

// 1. Validation
let res = await R.POST(req('/api/request', { method: 'POST', body: { name: 'A' } }));
assert.equal(res.status, 400);

// 2. Good request with a photo
const png = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64');
res = await R.POST(req('/api/request', { method: 'POST', body: {
  name: 'Sarah Jones', email: 'Sarah@Example.com', phone: '07700 900123', address: '14 Birch Road', town: 'Walsall',
  postcode: 'ws5 3ab', property_type: 'Semi-detached', storeys: '2', services: ['Gutters vacuumed / cleared', 'Fascia & gutter cleaning', 'Hack'],
  preferred_date: '2026-12-01', notes: 'Front <b>overflowing</b>', photos: [png] } }));
assert.equal(res.status, 200, await res.clone().text());
assert.equal(rows.length, 1);
const job = rows[0];
assert.equal(job.postcode, 'WS5 3AB'); assert.equal(job.email, 'sarah@example.com');
assert.deepEqual(job.services, ['Gutters vacuumed / cleared', 'Fascia & gutter cleaning']);
assert.equal(uploads.length, 1); assert.equal(job.photos.length, 1);
assert.equal(emails.length, 2, 'customer + owner emails');
assert.ok(emails.every((e) => !e.html.includes('<b>overflowing')), 'notes are escaped');

// 3. Honeypot
res = await R.POST(req('/api/request', { method: 'POST', body: { website: 'spam' } }));
assert.equal(res.status, 200); assert.equal(rows.length, 1);

// 4. Admin needs login
res = await J.GET(req('/api/admin/jobs')); assert.equal(res.status, 401);
res = await S.POST(req('/api/admin/session', { method: 'POST', body: { password: 'nope' } })); assert.equal(res.status, 401);
res = await S.POST(req('/api/admin/session', { method: 'POST', body: { password: 'gutters123' } })); assert.equal(res.status, 200);
const cookie = res.headers.get('set-cookie').split(';')[0];
const auth = { headers: { cookie } };
res = await J.GET(req('/api/admin/jobs', auth)); assert.equal((await res.json()).jobs.length, 1);
res = await J.GET(req('/api/admin/jobs?id=' + job.id, auth));
assert.ok((await res.json()).job.photo_urls[0].startsWith('https://db.test/storage/v1/object/sign/'));
// tampered cookie
res = await J.GET(req('/api/admin/jobs', { headers: { cookie: cookie.slice(0, -2) + 'xx' } })); assert.equal(res.status, 401);

// 5. Send quote
res = await Q.POST(req('/api/admin/send-quote', { method: 'POST', ...auth, body: { id: job.id, price: '65', days_until_due: 7, message: 'Front and back', scheduled_date: '2026-12-03' } }));
assert.equal(res.status, 200, await res.clone().text());
assert.equal(job.status, 'quoted'); assert.equal(job.price_pence, 6500); assert.equal(job.scheduled_date, '2026-12-03');
const item = stripeCalls.find((c) => c.path === '/invoiceitems');
assert.equal(item.body.amount, '6500'); assert.equal(item.body.currency, 'gbp');
const inv = stripeCalls.find((c) => c.path === '/invoices' && c.method === 'POST');
assert.equal(inv.body.collection_method, 'send_invoice'); assert.equal(inv.body['metadata[job_id]'], job.id);
assert.ok(stripeCalls.some((c) => c.path.endsWith('/send')));
const firstInvoice = job.stripe_invoice_id;

// 6. Re-quote voids the old invoice
res = await Q.POST(req('/api/admin/send-quote', { method: 'POST', ...auth, body: { id: job.id, price: 70 } }));
assert.equal(res.status, 200);
assert.ok(stripeCalls.some((c) => c.path === `/invoices/${firstInvoice}/void`));
assert.equal(stripeCalls.filter((c) => c.path === '/customers').length, 1, 'customer reused');
assert.equal(job.price_pence, 7000);

// 7. Webhook: bad signature rejected, good one marks paid
const payload = JSON.stringify({ type: 'invoice.paid', data: { object: { id: job.stripe_invoice_id, amount_paid: 7000, metadata: { job_id: job.id } } } });
res = await W.POST(req('/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': 't=1,v1=bad' } }));
assert.equal(res.status, 400); assert.equal(job.status, 'quoted');
const t = Math.floor(Date.now() / 1000);
const sig = createHmac('sha256', 'whsec_x').update(`${t}.${payload}`).digest('hex');
const before = emails.length;
res = await W.POST(req('/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': `t=${t},v1=${sig}` } }));
assert.equal(res.status, 200); assert.equal(job.status, 'paid'); assert.ok(job.paid_at);
assert.equal(emails.length - before, 2, 'customer + owner payment emails');
// duplicate webhook doesn't re-email
res = await W.POST(req('/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': `t=${t},v1=${sig}` } }));
assert.equal(emails.length - before, 2);

// 8. Can't quote a paid job
res = await Q.POST(req('/api/admin/send-quote', { method: 'POST', ...auth, body: { id: job.id, price: 10 } }));
assert.equal(res.status, 400);

// 9. Diary update + confirmation email
res = await J.PATCH(req('/api/admin/jobs', { method: 'PATCH', ...auth, body: { id: job.id, scheduled_date: '2026-12-04', scheduled_slot: 'am', notify: true } }));
assert.equal(res.status, 200); assert.equal(job.scheduled_date, '2026-12-04');
assert.match(emails.at(-1).subject, /booked for Friday 4 December 2026/);

// 10. Calendar feed
res = await C.GET(req('/api/calendar?token=wrong')); assert.equal(res.status, 404);
res = await C.GET(req('/api/calendar?token=caltok'));
const ics = await res.text();
assert.match(ics, /BEGIN:VEVENT/); assert.match(ics, /DTSTART;VALUE=DATE:20261204/); assert.match(ics, /DTEND;VALUE=DATE:20261205/);
assert.match(ics, /AM · Sarah Jones/); assert.match(ics, /PAID £70.00/);
assert.ok(ics.split('\r\n').every((l) => l.length <= 75), 'lines folded');
res = await L.GET(req('/api/admin/calendar-link', auth)); assert.match((await res.json()).webcal, /^webcal:\/\/www.the-gutterguy.co.uk\/api\/calendar\?token=caltok$/);

// 11. Mark done
res = await J.PATCH(req('/api/admin/jobs', { method: 'PATCH', ...auth, body: { id: job.id, status: 'completed' } }));
assert.equal(job.status, 'completed');

console.log('Core flow ✓');

// 13. Availability maths (pure)
{
  const now = new Date('2026-11-12T10:00:00Z'); // Thursday
  const st = { working_days: [1, 2, 3, 4, 5], slots: { am: true, pm: true }, capacity_per_slot: 1, min_notice_days: 1, max_days_ahead: 14 };
  const a = AV.computeAvailability(st, [{ start_date: '2026-11-17', end_date: '2026-11-18', slot: 'all' }, { start_date: '2026-11-19', end_date: '2026-11-19', slot: 'pm' }],
    [{ status: 'paid', scheduled_date: '2026-11-13', scheduled_slot: 'am' },
     { status: 'pending', scheduled_date: '2026-11-16', scheduled_slot: 'am', hold_expires_at: '2026-11-12T10:20:00Z' },
     { status: 'pending', scheduled_date: '2026-11-16', scheduled_slot: 'pm', hold_expires_at: '2026-11-12T09:00:00Z' }], now);
  assert.equal(a.first, '2026-11-13');
  assert.deepEqual(a.days['2026-11-13'], { pm: 1 }, 'paid AM taken');
  assert.ok(!a.days['2026-11-14'] && !a.days['2026-11-15'], 'weekend closed');
  assert.deepEqual(a.days['2026-11-16'], { pm: 1 }, 'live hold blocks, expired hold frees');
  assert.ok(!a.days['2026-11-17'] && !a.days['2026-11-18'], 'time off blocks');
  assert.deepEqual(a.days['2026-11-19'], { am: 1 }, 'afternoon off');
  console.log('Availability ✓');
}

// 14. Prices & hours + time off (admin) and instant booking (public)
{
  let r = await ST.PUT(req('/api/admin/settings', { method: 'PUT', body: {} })); assert.equal(r.status, 401);
  r = await ST.PUT(req('/api/admin/settings', { method: 'PUT', ...auth, body: {
    services: [{ id: 'gutters', name: 'Gutters vacuumed / cleared', price: '60' }, { id: 'fascia', name: 'Fascia & gutter cleaning', price: '45.50' },
      { id: 'repairs', name: 'Gutter repairs', price: '' }, { name: 'Soffit cleaning', price: 30 }, { name: 'Moss removal', price: 25, active: false }],
    surcharge_3plus: 20, working_days: [0, 1, 2, 3, 4, 5, 6], slots: { am: true, pm: true }, capacity_per_slot: 1, min_notice_days: 1, max_days_ahead: 30 } }));
  assert.equal(r.status, 200);
  const saved = (await r.json()).settings;
  const sv = Object.fromEntries(saved.services.map((x) => [x.id, x]));
  assert.equal(sv.gutters.price, 6000); assert.equal(sv.fascia.price, 4550); assert.equal(sv.repairs.price, null);
  assert.equal(sv['soffit-cleaning'].price, 3000, 'new service added with an id');
  assert.equal(saved.surcharge_3plus, 2000);

  // public options
  r = await B.GET(req('/api/booking-options'));
  const opt = await r.json();
  assert.equal(opt.services.find((x) => x.id === 'gutters').price, 6000);
  assert.ok(opt.services.some((x) => x.id === 'soffit-cleaning'), 'new service offered');
  assert.ok(!opt.services.some((x) => x.id === 'moss-removal'), 'switched-off service hidden');
  const days = Object.keys(opt.availability.days);
  assert.ok(days.length > 10);
  const day = days.find((d) => opt.availability.days[d].am);

  // time off removes a day
  r = await TO.POST(req('/api/admin/time-off', { method: 'POST', ...auth, body: { start_date: days[1], end_date: days[2], note: 'Holiday' } }));
  assert.equal(r.status, 200);
  const offId = (await r.json()).timeOff.id;
  r = await B.GET(req('/api/booking-options'));
  let av = (await r.json()).availability.days;
  assert.ok(!av[days[1]] && !av[days[2]], 'time off hidden from customers');
  r = await TO.DELETE(req('/api/admin/time-off?id=' + offId, { method: 'DELETE', ...auth }));
  r = await B.GET(req('/api/booking-options'));
  av = (await r.json()).availability.days;
  assert.ok(av[days[1]], 'deleting time off reopens the day');

  const booking = { property_type: 'semi', storeys: '3+', services: ['gutters', 'fascia'], date: day, slot: 'am',
    name: 'Amy Test', email: 'amy@test.com', phone: '07700 900111', address: '1 High St', postcode: 'WS1 1AA' };
  // default: open every day
  {
    const { DEFAULT_SETTINGS } = await import('../server/catalog.js');
    assert.deepEqual(DEFAULT_SETTINGS.working_days, [1, 2, 3, 4, 5, 6], 'Mon–Sat');
    const { bankHolidays } = await import('../server/bank-holidays.js');
    assert.deepEqual([...bankHolidays(2026)].sort(), ['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28']);
    assert.deepEqual([...bankHolidays(2027)].sort(), ['2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28']);
    assert.deepEqual([...bankHolidays(2028)].sort(), ['2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26']);
    const a = AV.computeAvailability({ working_days: [1, 2, 3, 4, 5, 6], closed_bank_holidays: true, slots: { am: true }, capacity_per_slot: 1, min_notice_days: 0, max_days_ahead: 60 }, [], [], new Date('2026-12-20T10:00:00Z'));
    assert.ok(!a.days['2026-12-25'] && !a.days['2026-12-28'] && !a.days['2026-12-27'] && a.days['2026-12-29'], 'Christmas, Boxing Day substitute and Sunday closed');
  }
  // price on request -> rejected for instant booking
  r = await B.POST(req('/api/book', { method: 'POST', body: { ...booking, services: ['repairs'] } }));
  assert.equal(r.status, 400);
  // good booking
  const before = stripeCalls.length;
  r = await B.POST(req('/api/book', { method: 'POST', body: booking }));
  assert.equal(r.status, 200, await r.clone().text());
  assert.match((await r.json()).url, /^https:\/\/checkout\.stripe\.com/);
  const sess = stripeCalls.slice(before).find((c) => c.path === '/checkout/sessions');
  assert.equal(sess.body['line_items[0][price_data][unit_amount]'], String(6000 + 4550 + 2000), 'server works out the price');
  assert.equal(sess.body['line_items[0][price_data][currency]'], 'gbp');
  const bjob = rows.find((j) => j.email === 'amy@test.com');
  assert.equal(bjob.status, 'pending'); assert.equal(bjob.scheduled_date, day); assert.ok(bjob.stripe_session_id);

  // the held slot is no longer offered, and double-booking it fails
  r = await B.GET(req('/api/booking-options'));
  assert.ok(!(await r.json()).availability.days[day]?.am, 'held slot hidden');
  r = await B.POST(req('/api/book', { method: 'POST', body: { ...booking, email: 'bob@test.com' } }));
  assert.equal(r.status, 409);

  // Stripe says paid -> booked, emails sent
  const pay = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: bjob.stripe_session_id, payment_status: 'paid', amount_total: 12550, metadata: { job_id: bjob.id } } } });
  const ts = Math.floor(Date.now() / 1000);
  const sg = createHmac('sha256', 'whsec_x').update(`${ts}.${pay}`).digest('hex');
  const e0 = emails.length;
  r = await W.POST(req('/api/stripe-webhook', { method: 'POST', body: pay, headers: { 'stripe-signature': `t=${ts},v1=${sg}` } }));
  assert.equal(r.status, 200); assert.equal(bjob.status, 'paid'); assert.equal(bjob.hold_expires_at, null);
  assert.equal(emails.length - e0, 2);
  assert.ok(emails.some((e) => /New booking: Amy Test/.test(e.subject)));

  // an abandoned checkout frees its slot when Stripe says it expired
  const other = days.find((d) => d !== day && opt.availability.days[d].pm);
  r = await B.POST(req('/api/book', { method: 'POST', body: { ...booking, email: 'carl@test.com', date: other, slot: 'pm' } }));
  const cjob = rows.find((j) => j.email === 'carl@test.com');
  const exp = JSON.stringify({ type: 'checkout.session.expired', data: { object: { id: cjob.stripe_session_id, metadata: { job_id: cjob.id } } } });
  const sg2 = createHmac('sha256', 'whsec_x').update(`${ts}.${exp}`).digest('hex');
  await W.POST(req('/api/stripe-webhook', { method: 'POST', body: exp, headers: { 'stripe-signature': `t=${ts},v1=${sg2}` } }));
  assert.equal(cjob.status, 'cancelled');
  r = await B.GET(req('/api/booking-options'));
  assert.ok((await r.json()).availability.days[other]?.pm, 'expired checkout frees slot');

  // price-on-request still works via /api/request with ids
  r = await R.POST(req('/api/request', { method: 'POST', body: { ...booking, property_type: 'commercial', services: ['repairs', 'unsure'], email: 'dan@test.com' } }));
  assert.equal(r.status, 200);
  const djob = rows.find((j) => j.email === 'dan@test.com');
  assert.equal(djob.property_type, 'Commercial'); assert.deepEqual(djob.services, ['Gutter repairs', 'Not sure – please advise']);
  assert.equal(djob.preferred_date, day); assert.match(djob.notes, /Morning/);
  console.log('Booking, prices & time off ✓');
}

// 15. Google reviews
{
  const RV = await import('../server/routes/reviews.js');
  let r = await RV.GET(req('/api/reviews'));
  assert.deepEqual((await r.json()).reviews, [], 'no key = no reviews');
  process.env.GOOGLE_PLACES_API_KEY = 'gkey'; process.env.GOOGLE_PLACE_ID = 'ChIJ123';
  r = await RV.GET(req('/api/reviews'));
  const out = await r.json();
  assert.equal(out.reviews.length, 2, 'only 4-5 star reviews');
  assert.equal(out.reviews[0].author, 'Jo B'); assert.equal(out.googleUrl, 'https://maps.google.com/?cid=1');
  assert.ok(!('count' in out) && !('rating' in out), 'no review count exposed');
  delete process.env.GOOGLE_PLACES_API_KEY; delete process.env.GOOGLE_PLACE_ID;
  console.log('Google reviews ✓');
}

// 12. Cloudflare Worker entry: settings arrive via env, website files via ASSETS
{
  const saved = { ...process.env };
  const cfEnv = { ...saved, ASSETS: { fetch: async (r) => new Response('static:' + new URL(r.url).pathname) } };
  for (const k of ['ADMIN_PASSWORD', 'SESSION_SECRET', 'CALENDAR_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) delete process.env[k];
  const worker = (await import('../server/worker.js')).default;
  let r = await worker.fetch(req('/api/admin/session', { method: 'POST', body: { password: 'gutters123' } }), cfEnv);
  assert.equal(r.status, 200);
  const c = r.headers.get('set-cookie').split(';')[0];
  r = await worker.fetch(req('/api/admin/jobs', { headers: { cookie: c } }), cfEnv);
  assert.equal(r.status, 200); assert.ok((await r.json()).jobs.length >= 1);
  r = await worker.fetch(req('/admin'), cfEnv); assert.equal(await r.text(), 'static:/admin');
  r = await worker.fetch(req('/api/nope'), cfEnv); assert.equal(r.status, 404);
  r = await worker.fetch(req('/api/request'), cfEnv); assert.equal(r.status, 405);
  Object.assign(process.env, saved);
  console.log('Cloudflare Worker entry ✓');
}
console.log('All tests passed ✓');
