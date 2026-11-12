// Cloudflare route – the real code is in server/routes/calendar.js
import * as route from '../../server/routes/calendar.js';
import { wrap } from '../../server/adapter.js';
export const onRequestGet = wrap(route.GET);
