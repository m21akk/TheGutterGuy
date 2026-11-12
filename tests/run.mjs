// End-to-end test of the API with Stripe, Supabase and Resend faked out.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

Object.assign(process.env, {
  SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc', STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x', RESEND_API_KEY: 're_x', OWNER_EMAIL: 'roy@test', ADMIN_PASSWORD: 'gutters123',
  SESSION_SECRET: 's'.repeat(40), CALENDAR_TOKEN: 'caltok', SITE_URL: 'https://www.the-gutterguy.co.uk',
});

const rows = []; const emails = []; const stripeCalls = []; const uploads = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); const method = opts.method || 'GET';
  const ok = (data, status = 200) => new Response(JSON.stringify(data), { status });
  if (url.startsWith('https://db.test/rest/v1/jobs')) {
    const q = new URL(url).searchParams;
    const filt = (r) => {
      for (const [k, v] of q) {
        if (['select', 'order', 'limit'].includes(k)) continue;
        if (v.startsWith('eq.') && String(r[k]) !== v.slice(3)) return false;
        if (v === 'not.is.null' && r[k] == null) return false;
        if (v.startsWith('neq.') && r[k] === v.slice(4)) return false;
      }
      return true;
    };
    if (method === 'POST') { const r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...JSON.parse(opts.body) }; rows.push(r); return ok([r], 201); }
    if (method === 'PATCH') { const hit = rows.filter(filt); hit.forEach((r) => Object.assign(r, JSON.parse(opts.body))); return ok(hit); }
    return ok(rows.filter(filt));
  }
  if (url.startsWith('https://db.test/storage/v1/object/sign')) return ok(JSON.parse(opts.body).paths.map((p) => ({ path: p, signedURL: `/object/sign/job-photos/${p}?token=t` })));
  if (url.startsWith('https://db.test/storage/v1/object/')) { uploads.push(url); return ok({ Key: url }); }
  if (url.startsWith('https://api.stripe.com/v1')) {
    const path = url.slice('https://api.stripe.com/v1'.length).split('?')[0];
    const body = Object.fromEntries(new URLSearchParams(opts.body || ''));
    stripeCalls.push({ method, path, body });
    assert.equal(opts.headers.Authorization, 'Bearer sk_test_x');
    if (path === '/customers') return ok({ id: 'cus_1' });
    if (path === '/invoices' && method === 'POST') return ok({ id: 'in_' + stripeCalls.length, status: 'draft' });
    if (path.endsWith('/finalize')) return ok({ id: path.split('/')[2], hosted_invoice_url: 'https://invoice.stripe.com/i/' + path.split('/')[2], status: 'open' });
    if (/^\/invoices\/in_\d+$/.test(path) && method === 'GET') return ok({ id: path.split('/')[2], status: 'open' });
    return ok({ id: 'x', status: 'open' });
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

console.log('All tests passed ✓');

// 12. Cloudflare entry points: settings arrive via context.env, not process.env
{
  const saved = { ...process.env };
  const cfEnv = { ...saved };
  for (const k of ['ADMIN_PASSWORD', 'SESSION_SECRET', 'CALENDAR_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) delete process.env[k];
  const CS = await import('../functions/api/admin/session.js');
  const CJ = await import('../functions/api/admin/jobs.js');
  let r = await CS.onRequestPost({ request: req('/api/admin/session', { method: 'POST', body: { password: 'gutters123' } }), env: cfEnv });
  assert.equal(r.status, 200);
  const c = r.headers.get('set-cookie').split(';')[0];
  r = await CJ.onRequestGet({ request: req('/api/admin/jobs', { headers: { cookie: c } }), env: cfEnv });
  assert.equal(r.status, 200); assert.equal((await r.json()).jobs.length, 1);
  Object.assign(process.env, saved);
  console.log('Cloudflare entry points ✓');
}
