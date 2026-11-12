// /api/admin/session – log in (POST), check (GET), log out (DELETE).
import { route, json, fail, readJson } from '../../util.js';
import { passwordMatches, sessionCookie, clearCookie, isAdmin } from '../../auth.js';

export const GET = route(async (request) => json({ loggedIn: await isAdmin(request) }));

export const POST = route(async (request) => {
  const { password } = await readJson(request, 10_000);
  await new Promise((r) => setTimeout(r, 600)); // slows down password guessing
  if (!(await passwordMatches(password))) return fail('Wrong password', 401);
  return json({ ok: true }, 200, { 'Set-Cookie': await sessionCookie() });
});

export const DELETE = route(async () => json({ ok: true }, 200, { 'Set-Cookie': clearCookie() }));
