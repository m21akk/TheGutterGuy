// Cloudflare route – the real code is in server/routes/stripe-webhook.js
import * as route from '../../server/routes/stripe-webhook.js';
import { wrap } from '../../server/adapter.js';
export const onRequestPost = wrap(route.POST);
