// POST /api/stripe-webhook – Stripe tells us when a customer has paid.
import { env, json } from '../util.js';
import { verifyWebhook } from '../stripe.js';
import { findJobByInvoice, getJob, updateJob } from '../db.js';
import { paymentReceived } from '../email.js';

export async function POST(request) {
  const raw = await request.text();
  if (!(await verifyWebhook(raw, request.headers.get('stripe-signature'), env('STRIPE_WEBHOOK_SECRET')))) {
    return json({ error: 'Bad signature' }, 400);
  }
  const event = JSON.parse(raw);

  try {
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      const job = (await findJobByInvoice(invoice.id)) || (await getJob(invoice.metadata?.job_id));
      if (job && job.status !== 'paid' && job.status !== 'completed') {
        const updated = await updateJob(job.id, {
          status: 'paid',
          paid_at: new Date().toISOString(),
          price_pence: invoice.amount_paid || job.price_pence,
        });
        await paymentReceived(updated);
      }
    }
  } catch (err) {
    console.error(err);
    return json({ error: 'Handler failed' }, 500); // Stripe will retry
  }
  return json({ received: true });
}
