# The Gutter Guy – setup guide (Cloudflare Workers)

You don't need to use a terminal or install anything. Everything is done in the browser.
Set aside about 1–2 hours. Do the steps in order.

> **StudentStash is safe.** In Cloudflare, every website is its own **Worker** and every domain is its own **zone**, each with its own settings and DNS. Nothing below changes anything belonging to StudentStash. Just make sure you always pick the **thegutterguy** Worker or **the-gutterguy.co.uk** domain when following these steps.

## What the site does

1. A customer clicks **Book now**, picks their property and services, sees the price, chooses a free morning or afternoon and **pays on the spot** with Stripe. They're booked in instantly, and both they and Roy get an email.
2. Free slots come from Roy's **Prices & hours** (working days, morning and afternoon slots, jobs per slot) minus his **Time off** and the jobs already booked.
3. Jobs without a set price (commercial, repairs, "not sure", or any empty price box) come in as a **booking request**. Roy opens **/admin**, types a price and taps **Send quote**. Stripe emails the customer a pay link and chases it with reminders.
4. Everything shows in Roy's **Diary**, and on his phone's calendar if he subscribes to it.

## Accounts you'll need

| Service | What it's for | Cost |
|---|---|---|
| **Cloudflare** (your existing account) | Hosts the website and the domain | Free |
| **GitHub** (github.com) | Stores the website files; Cloudflare updates the site from here | Free |
| **Supabase** (supabase.com) | Database for jobs and customer photos | Free |
| **Stripe** (stripe.com) | Quotes, payments and reminders. **Set this up in Roy's name with his bank account.** | Stripe takes a fee per payment, no monthly fee |
| **Resend** (resend.com) | Sends the site's emails | Free up to 3,000 emails a month |

---

## Step 1 – Database (Supabase)

1. Sign up at **supabase.com** and click **New project**.
   - Name: `gutter-guy`
   - Region: **London (eu-west-2)**
   - Set a database password and save it somewhere safe.
2. Wait about a minute for the project to finish setting up.
3. In the left menu click **SQL Editor**, then **New query**.
4. Open **`schema.sql`** from this folder, copy everything in it, paste it into the editor and click **Run**. You should see "Success".
   *Updating from an older version? Run the new `schema.sql` again. It only adds what's missing and keeps your existing jobs.*
5. Go to **Project Settings → API** (it may be under **Data API / API Keys**) and copy two values:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role** secret key → this is `SUPABASE_SERVICE_KEY`. Keep this one secret.

## Step 2 – Put the files on GitHub

1. Sign in at **github.com**, click **+** (top right) → **New repository**.
2. Name it `the-gutterguy`, choose **Private**, then click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. Open this project folder on your computer, select **everything inside it** (the files *and* the `public`, `server` and `tests` folders and `wrangler.jsonc`), and drag it all onto the page.
5. Click **Commit changes**.

Check: the repo should show `public`, `server`, `wrangler.jsonc`, `schema.sql`, `SETUP.md` and so on at the top level, not inside another folder.

## Step 3 – Create the Worker on Cloudflare

1. Log in to **dash.cloudflare.com** and go to **Compute → Workers & Pages → Create**.
2. Choose **Import a repository**, connect GitHub and pick the repo.
3. Name it **`thegutterguy`**. It must match the `name` in `wrangler.jsonc`. Leave the build command empty and the deploy command as `npx wrangler deploy`. Click **Deploy**.
4. When the build turns green, open **Settings → Domains & Routes** to find the address, e.g. `thegutterguy.<your-name>.workers.dev`.
5. Go to **Settings → Variables and Secrets → Add** and add these (type **Secret** for anything marked 🔒):

   | Name | Value |
   |---|---|
   | `SITE_URL` | `https://www.the-gutterguy.co.uk` |
   | `SUPABASE_URL` | from Step 1 |
   | `SUPABASE_SERVICE_KEY` 🔒 | from Step 1 |
   | `ADMIN_PASSWORD` 🔒 | Roy's login password |
   | `SESSION_SECRET` 🔒 | any long random text (40+ characters) |
   | `CALENDAR_TOKEN` 🔒 | another long random text |
   | `OWNER_EMAIL` | where Roy wants new-job alerts |

   Saving deploys the change straight away.
6. Open the site address, go to **`/admin`**, log in, and send yourself a test quote request from the home page.

> Any change you commit on GitHub redeploys the site automatically within about a minute.

## Step 4 – Payments (Stripe)

Do this with Roy, since the account and bank details must be his.

1. Sign up at **stripe.com**. Stripe starts you in **test mode** (sandbox), so nothing is real yet.
2. **API key:** go to **Developers → API keys** and copy the **Secret key** (`sk_test_…`). In Cloudflare, add it as the secret `STRIPE_SECRET_KEY`.
3. **Webhook** (this is how the site finds out a customer has paid):
   - **Developers → Webhooks → Add endpoint**
   - Endpoint URL: `https://thegutterguy.<your-name>.workers.dev/api/stripe-webhook`
   - Events to send: **`checkout.session.completed`**, **`checkout.session.expired`** and **`invoice.paid`**
   - Save it, click **Reveal signing secret** (`whsec_…`) and add it in Cloudflare as the secret `STRIPE_WEBHOOK_SECRET`.
4. **Branding:** in **Settings → Branding**, upload the logo and set the brand colour to `#6e1419`.
5. **Invoice emails and reminders:** in Stripe **Settings**, find the invoice / customer email settings (search "reminders" in the settings search box) and:
   - Turn on **emailing finalized invoices** to customers
   - Turn on **reminders** for one-off invoices. A good pattern is 3 days before the due date, on the due date, and 7 days after.
   - Turn on **payment confirmation / receipt** emails
6. **Payment methods:** in **Settings → Payment methods**, make sure **Cards**, **Apple Pay** and **Google Pay** are on.

**Test it:** in the admin, open your test request, enter a price and tap **Send quote**.
In test mode Stripe **doesn't email** real customers, so tap **View quote** instead. Pay with the test card **4242 4242 4242 4242**, any future expiry date and any 3-digit CVC. Within a few seconds the job should move to **Paid**.

## Step 4b – Set Roy's prices and hours

1. Log in at **/admin** and open **Prices & hours**.
2. Under **Services & prices**, type a price for each service at **1 storey**, **2 storeys** and **3+ storeys**. Bungalows always use the 1-storey price. **Leave a box empty** for anything Roy wants to price himself. Customers will see "Price on request" and send a booking request instead.
   - **+ Add a service** adds a new one, and you can rename any service by typing over it.
   - Untick **Bookable** to hide a service without deleting it. **×** removes it.
3. Click **Save prices & hours** when you're done.
4. **Working hours:** the calendar is open **Monday–Saturday** by default, and **closed on bank holidays** (worked out automatically every year). Untick any other days Roy never works, choose morning and/or afternoon, how many jobs fit in each, and how far ahead people can book. Click **Save**.
5. Use the **Time off** tab for holidays. Those dates vanish from the booking calendar straight away.

## Step 5 – Emails (Resend)

1. Sign up at **resend.com**, create an **API key** and add it in Cloudflare as the secret `RESEND_API_KEY`.
2. Until the domain is verified, Resend can only send emails to *your own* address. That's fine for testing. Leave `EMAIL_FROM` out for now.
3. After Step 6, go to **Resend → Domains → Add domain** and add `the-gutterguy.co.uk`. Resend can connect to Cloudflare and add the DNS records for you. If it doesn't, copy them in yourself under **the-gutterguy.co.uk → DNS → Records** (not the StudentStash domain).
4. When it says **Verified**, add `EMAIL_FROM` = `The Gutter Guy <info@the-gutterguy.co.uk>`.

> Resend only *sends* email. To *receive* mail at info@the-gutterguy.co.uk, either set up **Cloudflare Email Routing** (free) to forward it to Roy's existing inbox, or get a mailbox (Zoho Mail free, Microsoft 365 or Google Workspace).

## Step 5b – Live Google reviews (optional)

The site can show a few of Roy's latest 4★ and 5★ Google reviews, refreshed daily. If you skip this, it shows buttons linking to his Google and Facebook reviews instead.

1. Go to **console.cloud.google.com**, create a project (e.g. `gutter-guy`) and enable **Places API (New)**. Google asks for a billing card, but a small site like this stays well inside the free monthly allowance.
2. **APIs & Services → Credentials → Create credentials → API key**. Restrict the key to **Places API (New)**.
3. Find Roy's **Place ID**: search "Place ID finder" (Google's own tool), type *The Gutter Guy Walsall* and copy the ID (it starts with `ChIJ…`).
4. In Cloudflare, add the secret `GOOGLE_PLACES_API_KEY` and the text variable `GOOGLE_PLACE_ID`.

## Step 6 – Connect the-gutterguy.co.uk

1. **Get the domain onto Cloudflare.** The easiest way is to buy it in Cloudflare: **Domain Registration → Register Domains**, search `the-gutterguy.co.uk` and buy it. It's then added to your account as its own zone automatically.
   *If you bought it elsewhere, use **Add a domain** in Cloudflare and change the nameservers at the registrar to the two Cloudflare shows you.*
2. Go to **Workers & Pages → thegutterguy → Settings → Domains & Routes → Add → Custom domain**.
3. Enter `www.the-gutterguy.co.uk` and click **Add domain**. Cloudflare adds the DNS record for you.
4. Repeat for `the-gutterguy.co.uk` (without www).
5. Wait until both show **Active** (usually a few minutes).
6. In Stripe, edit the webhook URL to `https://www.the-gutterguy.co.uk/api/stripe-webhook`.

## Step 7 – Go live

When everything works in test mode:

1. In Stripe, finish **activating the account** (Roy's business and bank details).
2. Switch Stripe to **live mode** and copy the live **Secret key** (`sk_live_…`) into Cloudflare as `STRIPE_SECRET_KEY`.
3. Create the webhook again **in live mode** (same URL, same three events) and copy its new `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
4. Send a real £1 quote to yourself and pay it to check the full flow end to end.

## Step 8 – Set up Roy's phone

- Open **the-gutterguy.co.uk/admin**, log in, then tap **Share → Add to Home Screen**. It now works like an app.
- Go to **Diary → 📅 Add to my phone** so booked jobs appear in his phone's calendar automatically.

---

## Making changes later

- **Change wording or contact details:** on GitHub, open `public/index.html`, click the ✏️ pencil, edit and click **Commit**. Cloudflare updates the live site within a minute.
- **Change the services list:** it's in **two** places that must match – the tick-boxes in `public/index.html` and the `SERVICES` list in `server/routes/request.js`.
- **Change the logo:** replace `public/assets/logo.png` (upload a file with the same name).

## If something goes wrong

- **Form says "Something went wrong":** in Cloudflare open **thegutterguy → Observability → Logs** (or **Logs → Begin log stream**), then try the form again to see the error. Usually a missing or mistyped variable, or `schema.sql` wasn't run.
- **Jobs don't turn Paid:** in Stripe check **Developers → Webhooks → your endpoint**. Failed deliveries show the error. Check the URL and the `STRIPE_WEBHOOK_SECRET`.
- **No emails:** check `RESEND_API_KEY`, and that the domain is verified in Resend.
- **Can't log in:** check `ADMIN_PASSWORD` in Variables and Secrets.
