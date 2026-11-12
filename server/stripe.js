// Stripe through its REST API – no packages needed.
import { env } from './util.js';
import { hmacHex, safeEqual } from './crypto.js';

const API = 'https://api.stripe.com/v1';
const VERSION = '2024-06-20';

// Turn {a: 1, metadata: {job: 'x'}} into a=1&metadata[job]=x
export function encode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) encode(v, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? encode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, item)));
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(path, params = {}, { method = 'POST', idempotencyKey } = {}) {
  const headers = {
    Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
    'Stripe-Version': VERSION,
  };
  let url = API + path;
  let body;
  if (method === 'GET') {
    const qs = encode(params).toString();
    if (qs) url += '?' + qs;
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = encode(params).toString();
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(url, { method, headers, body });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(`Stripe: ${data?.error?.message || res.status}`);
    err.status = 502;
    throw err;
  }
  return data;
}

// Check the Stripe-Signature header on webhooks so nobody can fake a "paid" event.
export async function verifyWebhook(rawBody, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=')).filter((p) => p.length === 2 && p[0] !== 'v1'),
  );
  const signatures = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !signatures.length) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  for (const s of signatures) if (await safeEqual(s, expected)) return true;
  return false;
}
