# The Gutter Guy – the-gutterguy.co.uk

Website for The Gutter Guy (Roy, Walsall & the Midlands). It handles online quote requests, Stripe quotes, payments and reminders, and a job diary. Hosted on **Cloudflare Pages**.

**Start with `SETUP.md`.**

```
public/                  The website (Cloudflare "build output directory")
  index.html             Public site + quote request form
  admin.html             Roy's admin: jobs, send quotes, diary
  assets/                Styles, scripts, logo
  _headers               Security headers
functions/api/...        Cloudflare routes – each one passes the request to server/routes
server/routes/...        The actual API code (requests, admin, Stripe webhook, calendar)
server/*.js              Database, Stripe, email, login and crypto helpers
schema.sql               Database tables (run once in Supabase)
tests/run.mjs            Automated tests: `node tests/run.mjs`
```

There are no packages to install and no build step.
