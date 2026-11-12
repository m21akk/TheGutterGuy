// Emails sent through Resend (resend.com). If RESEND_API_KEY isn't set yet,
// emails are skipped (and logged) so the rest of the site still works.
import { escapeHtml, money, niceDate, SLOTS, siteUrl, allEnv } from './util.js';

const BRAND = '#6e1419'; // roof red from the logo
const ACCENT = '#2d8fd5'; // water blue from the logo

async function send({ to, subject, html, replyTo }) {
  const key = allEnv().RESEND_API_KEY;
  if (!key) {
    console.log(`[email skipped – no RESEND_API_KEY] to=${to} subject=${subject}`);
    return;
  }
  const from = allEnv().EMAIL_FROM || 'The Gutter Guy <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, reply_to: replyTo || allEnv().OWNER_EMAIL || undefined }),
    });
    if (!res.ok) console.error('Email failed', res.status, await res.text());
  } catch (e) {
    console.error('Email failed', e);
  }
}

function layout(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2a33">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden">
<tr><td style="background:#fff;border-bottom:4px solid ${BRAND};padding:14px 24px"><img src="${siteUrl()}/assets/logo.png" alt="The Gutter Guy" width="150" style="display:block"></td></tr>
<tr><td style="padding:24px"><h1 style="font-size:20px;margin:0 0 14px">${escapeHtml(title)}</h1>${body}</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafb;font-size:13px;color:#5b6a75">
The Gutter Guy · Roy · Walsall &amp; the Midlands<br>
07460 941982 · <a href="mailto:info@the-gutterguy.co.uk" style="color:${BRAND}">info@the-gutterguy.co.uk</a> · <a href="${siteUrl()}" style="color:${BRAND}">the-gutterguy.co.uk</a>
</td></tr></table></td></tr></table></body></html>`;
}

function rows(job) {
  const r = (k, v) => (v ? `<tr><td style="padding:4px 12px 4px 0;color:#5b6a75;vertical-align:top">${k}</td><td style="padding:4px 0">${v}</td></tr>` : '');
  return `<table style="font-size:14px;margin:12px 0">
${r('Name', escapeHtml(job.name))}
${r('Phone', escapeHtml(job.phone))}
${r('Email', escapeHtml(job.email))}
${r('Address', escapeHtml([job.address, job.town, job.postcode].filter(Boolean).join(', ')))}
${r('Property', escapeHtml([job.property_type, job.storeys && job.storeys + ' storey'].filter(Boolean).join(', ')))}
${r('Services', escapeHtml((job.services || []).join(', ')))}
${r('Preferred date', escapeHtml(niceDate(job.preferred_date)))}
${r('Notes', escapeHtml(job.notes).replace(/\n/g, '<br>'))}
</table>`;
}

export function requestReceived(job) {
  return send({
    to: job.email,
    subject: 'We’ve got your booking request – The Gutter Guy',
    html: layout(`Thanks ${job.name.split(' ')[0]}, we’ve got your request`, `
<p style="font-size:15px;line-height:1.5">Roy will take a look and email you a price. You can accept it and pay securely online in one click, and you’re booked in.</p>
<p style="font-size:15px;line-height:1.5">Here’s what you sent us:</p>${rows(job)}
<p style="font-size:14px;color:#5b6a75">Anything to add? Just reply to this email or call 07460 941982.</p>`),
  });
}

export function newRequestAlert(job) {
  const owner = allEnv().OWNER_EMAIL;
  if (!owner) return;
  return send({
    to: owner,
    replyTo: job.email,
    subject: `New booking request (needs a price): ${job.name}, ${job.postcode}`,
    html: layout('New booking request – needs a price', `${rows(job)}
<p><a href="${siteUrl()}/admin#job=${job.id}" style="display:inline-block;background:${BRAND};color:#fff;padding:12px 18px;border-radius:6px;font-weight:bold;text-decoration:none">Open and send a price</a></p>`),
  });
}

export function paymentReceived(job) {
  const tasks = [
    send({
      to: job.email,
      subject: 'Payment received – you’re booked in with The Gutter Guy',
      html: layout('Thanks, your payment has gone through', `
<p style="font-size:15px;line-height:1.5">We’ve received your payment of <b>${money(job.price_pence)}</b>.</p>
${job.scheduled_date
  ? `<p style="font-size:15px;line-height:1.5">You’re booked in for <b>${escapeHtml(niceDate(job.scheduled_date))}</b>${job.scheduled_slot ? ' – ' + escapeHtml(SLOTS[job.scheduled_slot] || '') : ''}.</p>`
  : '<p style="font-size:15px;line-height:1.5">We’ll be in touch shortly to confirm the date.</p>'}
<p style="font-size:14px;color:#5b6a75">Stripe will email your receipt separately.</p>`),
    }),
  ];
  if (allEnv().OWNER_EMAIL) {
    tasks.push(send({
      to: allEnv().OWNER_EMAIL,
      subject: `${job.booking_type === 'instant' ? 'New booking' : 'Paid'}: ${job.name} – ${money(job.price_pence)}${job.scheduled_date ? ' – ' + niceDate(job.scheduled_date) : ''}`,
      html: layout(`${job.name} has paid ${money(job.price_pence)}`, `${rows(job)}
<p><a href="${siteUrl()}/admin#job=${job.id}" style="color:${BRAND};font-weight:bold">Open job</a></p>`),
    }));
  }
  return Promise.all(tasks);
}

export function bookingConfirmed(job) {
  return send({
    to: job.email,
    subject: `Your gutter clean is booked for ${niceDate(job.scheduled_date)}`,
    html: layout('You’re booked in', `
<p style="font-size:15px;line-height:1.5">We’ll be with you on <b>${escapeHtml(niceDate(job.scheduled_date))}</b>${job.scheduled_slot ? ' – ' + escapeHtml(SLOTS[job.scheduled_slot] || '') : ''}.</p>
<p style="font-size:15px;line-height:1.5">Address: ${escapeHtml([job.address, job.town, job.postcode].filter(Boolean).join(', '))}</p>
<p style="font-size:14px;color:#5b6a75">Need to change the date? Reply to this email or call 07460 941982.</p>`),
  });
}
