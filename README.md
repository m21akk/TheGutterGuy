# The Gutter Guy – the-gutterguy.co.uk

Website for The Gutter Guy (Roy, Walsall & the Midlands). It handles online quote requests, Stripe quotes, payments and reminders, and a job diary. Hosted on **Cloudflare Workers** (static assets + API).

**Start with `SETUP.md`.**

```
wrangler.jsonc           Cloudflare settings (Worker name, website folder)
public/                  The website files
  index.html             Public site + online booking
  booked.html            "You’re booked in" page after payment
  admin.html             Roy's admin: jobs, send quotes, diary
  assets/                Styles, scripts, logo
  _headers               Security headers
server/worker.js         Sends /api/... to the code, everything else to the website
server/routes/...        The actual API code (requests, admin, Stripe webhook, calendar)
server/*.js              Database, Stripe, email, login and crypto helpers
schema.sql               Database tables (run once in Supabase)
tests/run.mjs            Automated tests: `node tests/run.mjs`
```

There are no packages to install and no build step.
