// Admin login: one password (ADMIN_PASSWORD) and a signed, HttpOnly cookie.
import { env } from './util.js';
import { hmacB64url, safeEqual, textToB64url, b64urlToText } from './crypto.js';

const COOKIE = 'gg_admin';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function passwordMatches(input) {
  return safeEqual(input || '', env('ADMIN_PASSWORD'));
}

export async function sessionCookie() {
  const payload = textToB64url(JSON.stringify({ exp: Date.now() + MAX_AGE * 1000 }));
  const token = `${payload}.${await hmacB64url(env('SESSION_SECRET'), payload)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function isAdmin(request) {
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!match) return false;
  const [payload, sig] = match.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return false;
  if (!(await safeEqual(sig, await hmacB64url(env('SESSION_SECRET'), payload)))) return false;
  try {
    return Date.now() < JSON.parse(b64urlToText(payload)).exp;
  } catch {
    return false;
  }
}

export async function requireAdmin(request) {
  if (!(await isAdmin(request))) throw Object.assign(new Error('Please log in'), { status: 401 });
}
