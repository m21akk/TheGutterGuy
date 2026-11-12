// Cloudflare route – the real code is in server/routes/admin/session.js
import * as route from '../../../server/routes/admin/session.js';
import { wrap } from '../../../server/adapter.js';
export const onRequestGet = wrap(route.GET);
export const onRequestPost = wrap(route.POST);
export const onRequestDelete = wrap(route.DELETE);
