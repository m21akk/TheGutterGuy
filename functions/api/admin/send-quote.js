// Cloudflare route – the real code is in server/routes/admin/send-quote.js
import * as route from '../../../server/routes/admin/send-quote.js';
import { wrap } from '../../../server/adapter.js';
export const onRequestPost = wrap(route.POST);
