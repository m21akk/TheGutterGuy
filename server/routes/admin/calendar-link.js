// GET /api/admin/calendar-link – gives Roy his private calendar subscription link.
import { route, json, env, siteUrl } from '../../util.js';
import { requireAdmin } from '../../auth.js';

export const GET = route(async (request) => {
  await requireAdmin(request);
  const https = `${siteUrl()}/api/calendar?token=${encodeURIComponent(env('CALENDAR_TOKEN'))}`;
  return json({ https, webcal: https.replace(/^https:/, 'webcal:') });
});
