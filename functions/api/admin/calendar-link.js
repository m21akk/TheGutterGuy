// Cloudflare route – the real code is in server/routes/admin/calendar-link.js
import * as route from '../../../server/routes/admin/calendar-link.js';
import { wrap } from '../../../server/adapter.js';
export const onRequestGet = wrap(route.GET);
