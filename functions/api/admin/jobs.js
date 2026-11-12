// Cloudflare route – the real code is in server/routes/admin/jobs.js
import * as route from '../../../server/routes/admin/jobs.js';
import { wrap } from '../../../server/adapter.js';
export const onRequestGet = wrap(route.GET);
export const onRequestPatch = wrap(route.PATCH);
