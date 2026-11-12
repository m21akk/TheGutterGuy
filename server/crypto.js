// Web-standard crypto helpers (work on Cloudflare and modern Node with no flags).
const enc = new TextEncoder();

async function hmacBytes(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export function bytesToB64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function textToB64url(text) {
  return bytesToB64url(enc.encode(text));
}

export function b64urlToText(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(base64ToBytes(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hmacB64url(secret, message) {
  return bytesToB64url(await hmacBytes(secret, message));
}

export async function hmacHex(secret, message) {
  return [...(await hmacBytes(secret, message))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time comparison of two strings (compares their SHA-256 hashes).
export async function safeEqual(a, b) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}
