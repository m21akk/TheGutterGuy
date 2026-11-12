// POST /api/stripe-webhook – Stripe tells us when a customer has paid.
//   checkout.session.completed – an online booking was paid
//   checkout.session.expired   – they didn't pay in time, so free the slot
//   invoice.paid               – a quote Roy sent was paid
import { env, json } from '../util.js';
import { verifyWebhook } from '../stripe.js';
import { findJobByInvoice, findJobBySession, getJob, updateJob } from '../db.js';
import { paymentReceived } from '../email.js';

async function markPaid(job, amount) {
  if (!job || job.status === 'paid' || job.status === 'completed') return;
  const updated = await updateJob(job.id, {
    status: 'paid',
    paid_at: new Date().toISOString(),
    price_pence: amount || job.price_pence,
    hold_expires_at: null,
  });
  await paymentReceived(updated);
}

export async function POST(request) {
  const raw = await request.text();
  if (!(await verifyWebhook(raw, request.headers.get('stripe-signature'), env('STRIPE_WEBHOOK_SECRET')))) {
    return json({ error: 'Bad signature' }, 400);
  }
  const event = JSON.parse(raw);
  const obj = event.data?.object || {};

  try {
    if (event.type === 'checkout.session.completed' && obj.payment_status === 'paid') {
      const job = (await findJobBySession(obj.id)) || (await getJob(obj.metadata?.job_id));
      await markPaid(job, obj.amount_total);
    }
    if (event.type === 'checkout.session.expired') {
      const job = (await findJobBySession(obj.id)) || (await getJob(obj.metadata?.job_id));
      if (job?.status === 'pending') await updateJob(job.id, { status: 'cancelled', hold_expires_at: null });
    }
    if (event.type === 'invoice.paid') {
      const job = (await findJobByInvoice(obj.id)) || (await getJob(obj.metadata?.job_id));
      await markPaid(job, obj.amount_paid);
    }
  } catch (err) {
    console.error(err);
    return json({ error: 'Handler failed' }, 500); // Stripe will retry
  }
  return json({ received: true });
}
