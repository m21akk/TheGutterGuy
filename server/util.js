// Small shared helpers for every API route.

// On Cloudflare the variables arrive per request (see server/adapter.js);
// in Node (tests) they come from process.env.
export function allEnv() {
  return globalThis.__GG_ENV || (typeof process !== 'undefined' ? process.env : {});
}

export function env(name, { optional = false } = {}) {
  const v = allEnv()[name];
  if (!v && !optional) throw new Error(`Missing environment variable ${name}`);
  return v || '';
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function clean(s, max = 500) {
  return String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

export function money(pence) {
  return '£' + (Number(pence) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function niceDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : ''));
  const part = (o) => d.toLocaleDateString('en-GB', { ...o, timeZone: 'Europe/London' });
  return `${part({ weekday: 'long' })} ${part({ day: 'numeric' })} ${part({ month: 'long' })} ${part({ year: 'numeric' })}`;
}

export const SLOTS = { am: 'Morning (8am–12pm)', pm: 'Afternoon (12pm–5pm)', any: 'Any time' };

export function siteUrl() {
  return (allEnv().SITE_URL || 'https://www.the-gutterguy.co.uk').replace(/\/$/, '');
}

export async function readJson(request, maxBytes = 4_000_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 });
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('Invalid request'), { status: 400 });
  }
}

// Wrap a handler so thrown errors become tidy JSON responses.
export function route(fn) {
  return async (request) => {
    try {
      return await fn(request);
    } catch (err) {
      if (!err.status || err.status >= 500) console.error(err);
      return fail(err.status ? err.message : 'Something went wrong. Please try again.', err.status || 500);
    }
  };
}
