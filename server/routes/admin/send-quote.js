// POST /api/admin/send-quote – Roy sets a price; Stripe emails the customer a
// quote/invoice with a "Pay online" button and chases it with reminders.
import { route, json, fail, clean, readJson } from '../../util.js';
import { requireAdmin } from '../../auth.js';
import { getJob, updateJob } from '../../db.js';
import { stripe } from '../../stripe.js';

export const POST = route(async (request) => {
  await requireAdmin(request);
  const b = await readJson(request, 50_000);
  const job = await getJob(b.id);
  if (!job) return fail('Job not found', 404);
  if (job.status === 'paid' || job.status === 'completed') return fail('This job has already been paid.');

  const pence = Math.round(Number(b.price) * 100);
  if (!Number.isFinite(pence) || pence < 100 || pence > 10_000_00) return fail('Enter a price between £1 and £10,000.');
  const days = Math.min(Math.max(parseInt(b.days_until_due, 10) || 7, 1), 60);
  const message = clean(b.message, 1000);
  const scheduled = /^\d{4}-\d{2}-\d{2}$/.test(b.scheduled_date || '') ? b.scheduled_date : job.scheduled_date;

  // Re-quoting? Cancel the old invoice first so the customer can't pay twice.
  if (job.stripe_invoice_id) {
    const old = await stripe(`/invoices/${job.stripe_invoice_id}`, {}, { method: 'GET' });
    if (old.status === 'paid') return fail('The previous quote has already been paid.');
    if (old.status === 'open') await stripe(`/invoices/${old.id}/void`);
    if (old.status === 'draft') await stripe(`/invoices/${old.id}`, {}, { method: 'DELETE' });
  }

  let customerId = job.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe('/customers', {
      name: job.name,
      email: job.email,
      phone: job.phone,
      address: { line1: job.address, city: job.town || undefined, postal_code: job.postcode, country: 'GB' },
      metadata: { job_id: job.id },
    });
    customerId = customer.id;
  }

  const address = [job.address, job.town, job.postcode].filter(Boolean).join(', ');
  const services = (job.services || []).join(', ');
  const dateLine = scheduled
    ? `Proposed date: ${new Date(scheduled + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.`
    : 'Once paid, we’ll be in touch to book a date.';

  const invoice = await stripe('/invoices', {
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: days,
    auto_advance: false,
    pending_invoice_items_behavior: 'exclude',
    description: [`Your quote from The Gutter Guy for ${address}.`, message, `Pay online below to accept this quote. ${dateLine}`]
      .filter(Boolean).join('\n\n'),
    footer: 'The Gutter Guy · Roy · 07460 941982 · info@the-gutterguy.co.uk',
    metadata: { job_id: job.id },
  });

  await stripe('/invoiceitems', {
    customer: customerId,
    invoice: invoice.id,
    amount: pence,
    currency: 'gbp',
    description: services || 'Gutter clearance',
  });

  const finalised = await stripe(`/invoices/${invoice.id}/finalize`, { auto_advance: false });
  await stripe(`/invoices/${invoice.id}/send`); // Stripe emails the customer (live mode)

  const updated = await updateJob(job.id, {
    status: 'quoted',
    price_pence: pence,
    quote_message: message || null,
    scheduled_date: scheduled || null,
    stripe_customer_id: customerId,
    stripe_invoice_id: invoice.id,
    invoice_url: finalised.hosted_invoice_url,
    quoted_at: new Date().toISOString(),
  });
  return json({ job: updated });
});
