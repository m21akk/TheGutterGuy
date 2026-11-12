// Cloudflare route – the real code is in server/routes/request.js
import * as route from '../../server/routes/request.js';
import { wrap } from '../../server/adapter.js';
export const onRequestPost = wrap(route.POST);
