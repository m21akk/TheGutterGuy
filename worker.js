// Cloudflare Worker entry: /api/... goes to our code, everything else is the website in /public.
import * as request from './routes/request.js';
import * as webhook from './routes/stripe-webhook.js';
import * as calendar from './routes/calendar.js';
import * as session from './routes/admin/session.js';
import * as jobs from './routes/admin/jobs.js';
import * as sendQuote from './routes/admin/send-quote.js';
import * as calendarLink from './routes/admin/calendar-link.js';

const ROUTES = {
  '/api/request': request,
  '/api/stripe-webhook': webhook,
  '/api/calendar': calendar,
  '/api/admin/session': session,
  '/api/admin/jobs': jobs,
  '/api/admin/send-quote': sendQuote,
  '/api/admin/calendar-link': calendarLink,
};

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname.replace(/\/$/, '');
    const route = ROUTES[path];
    if (route) {
      globalThis.__GG_ENV = env;
      const handler = route[req.method];
      if (!handler) return new Response('Method not allowed', { status: 405 });
      return handler(req);
    }
    if (path.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(req);
  },
};
