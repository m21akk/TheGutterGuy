// Supabase (Postgres + file storage) through its REST API – no packages needed.
import { env } from './util.js';

const BUCKET = 'job-photos';

function headers(extra = {}) {
  const key = env('SUPABASE_SERVICE_KEY');
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

function base() {
  return env('SUPABASE_URL').replace(/\/$/, '');
}

async function check(res) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Database error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function listJobs() {
  const res = await fetch(`${base()}/rest/v1/jobs?select=*&order=created_at.desc&limit=1000`, { headers: headers() });
  return check(res);
}

export async function scheduledJobs() {
  const res = await fetch(
    `${base()}/rest/v1/jobs?select=*&scheduled_date=not.is.null&status=not.in.(cancelled,pending)&order=scheduled_date.asc`,
    { headers: headers() },
  );
  return check(res);
}

export async function getJob(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const res = await fetch(`${base()}/rest/v1/jobs?id=eq.${id}&select=*`, { headers: headers() });
  const rows = await check(res);
  return rows?.[0] || null;
}

export async function insertJob(row) {
  const res = await fetch(`${base()}/rest/v1/jobs`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  return (await check(res))[0];
}

export async function updateJob(id, patch) {
  const res = await fetch(`${base()}/rest/v1/jobs?id=eq.${id}`, {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return (await check(res))[0];
}

export async function findJobByInvoice(invoiceId) {
  const res = await fetch(`${base()}/rest/v1/jobs?stripe_invoice_id=eq.${encodeURIComponent(invoiceId)}&select=*`, {
    headers: headers(),
  });
  return (await check(res))?.[0] || null;
}

export async function uploadPhoto(path, bytes, contentType) {
  const res = await fetch(`${base()}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType, 'x-upsert': 'false' }),
    body: bytes,
  });
  await check(res);
  return path;
}

export async function signedPhotoUrls(paths = []) {
  if (!paths.length) return [];
  const res = await fetch(`${base()}/storage/v1/object/sign/${BUCKET}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: 3600, paths }),
  });
  const rows = await check(res);
  return (rows || []).filter((r) => r.signedURL).map((r) => `${base()}/storage/v1${r.signedURL}`);
}

// ---------- Booking settings, time off and availability ----------

export async function getSettingsRow() {
  const res = await fetch(`${base()}/rest/v1/settings?id=eq.1&select=data`, { headers: headers() });
  return (await check(res))?.[0]?.data || null;
}

export async function saveSettingsRow(data) {
  const res = await fetch(`${base()}/rest/v1/settings?on_conflict=id`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ id: 1, data, updated_at: new Date().toISOString() }),
  });
  return (await check(res))?.[0]?.data;
}

export async function listTimeOff(fromDate) {
  const filter = fromDate ? `&end_date=gte.${fromDate}` : '';
  const res = await fetch(`${base()}/rest/v1/time_off?select=*&order=start_date.asc${filter}`, { headers: headers() });
  return (await check(res)) || [];
}

export async function addTimeOff(row) {
  const res = await fetch(`${base()}/rest/v1/time_off`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  return (await check(res))[0];
}

export async function deleteTimeOff(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return;
  const res = await fetch(`${base()}/rest/v1/time_off?id=eq.${id}`, { method: 'DELETE', headers: headers() });
  await check(res);
}

export async function jobsBetween(from, to) {
  const res = await fetch(
    `${base()}/rest/v1/jobs?select=id,status,scheduled_date,scheduled_slot,hold_expires_at` +
      `&scheduled_date=gte.${from}&scheduled_date=lte.${to}&status=in.(pending,quoted,paid,completed)`,
    { headers: headers() },
  );
  return (await check(res)) || [];
}

export async function findJobBySession(sessionId) {
  const res = await fetch(`${base()}/rest/v1/jobs?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=*`, {
    headers: headers(),
  });
  return (await check(res))?.[0] || null;
}
