# The Gutter Guy – setup guide (Cloudflare Pages)

You don't need to use a terminal or install anything. Everything is done in the browser.
Set aside about 1–2 hours. Do the steps in order.

> **StudentStash is safe.** In Cloudflare, every website is its own **Pages project** and every domain is its own **zone**, each with its own settings and DNS. Nothing below changes anything belonging to StudentStash. Just make sure you always pick **the-gutterguy** project or **the-gutterguy.co.uk** domain when following these steps.

## What the site does

1. A customer fills in **Request a quote** on the-gutterguy.co.uk. They get a "we've got your request" email, and Roy gets an alert.
2. Roy opens **the-gutterguy.co.uk/admin** on his phone, types a price and taps **Send quote**.
3. **Stripe** emails the customer the quote with a **Pay** button (card, Apple Pay or Google Pay). If they don't pay, Stripe sends reminders automatically.
4. When they pay, the job turns **Paid**. Roy and the customer both get an email.
5. Roy sets the date in the **Diary**, and the customer can be emailed a booking confirmation. The jobs also show up in the calendar on his phone.

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
5. Go to **Project Settings → API** (it may be under **Data API / API Keys**) and copy two values:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role** secret key → this is `SUPABASE_SERVICE_KEY`. Keep this one secret.

## Step 2 – Put the files on GitHub

1. Sign in at **github.com**, click **+** (top right) → **New repository**.
2. Name it `the-gutterguy`, choose **Private**, then click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. Open this project folder on your computer, select **everything inside it** (the files *and* the `public`, `functions`, `server` and `tests` folders), and drag it all onto the page.
5. Click **Commit changes**.

Check: the repo should show `public`, `functions`, `server`, `schema.sql`, `SETUP.md` and so on at the top level, not inside another folder.

## Step 3 – Create the Pages project on Cloudflare

1. Log in to **dash.cloudflare.com** and click **Workers & Pages** in the left menu.
2. Click **Create** (or **Create application**), then choose the **Pages** option.
   *If you only see a Workers screen, look for "Looking to deploy Pages? Get started" at the bottom.*
3. Choose **Import an existing Git repository** (Connect to Git).
4. Connect your GitHub account. When asked which repos to allow, you can allow just `the-gutterguy`. Select it and click **Begin setup**.
5. Fill in the build settings exactly like this:
   - **Project name:** `the-gutterguy`
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** leave empty
   - **Build output directory:** `public`
6. Open **Environment variables (advanced)** and add these (each name exactly as written):

   | Name | Value |
   |---|---|
   | `SITE_URL` | `https://www.the-gutterguy.co.uk` |
   | `SUPABASE_URL` | from Step 1 |
   | `SUPABASE_SERVICE_KEY` | from Step 1. Click **Encrypt**. |
   | `ADMIN_PASSWORD` | Roy's login password. Make it strong, and click **Encrypt**. |
   | `SESSION_SECRET` | any long random text (40+ characters). Click **Encrypt**. |
   | `CALENDAR_TOKEN` | another long random text. Click **Encrypt**. |
   | `OWNER_EMAIL` | where Roy wants new-job alerts (e.g. his Hotmail for now) |

   You'll add the Stripe and Resend values later, in Steps 4 and 5.
7. Click **Save and Deploy**. After about a minute you'll get an address like **`the-gutterguy.pages.dev`**.
8. Open it. The site should load. Go to **`/admin`** and log in with your `ADMIN_PASSWORD`.
9. Send yourself a test quote request from the home page. It should appear under **New** in the admin.

> **Adding or changing a variable later:** go to **Workers & Pages → the-gutterguy → Settings → Variables and Secrets**, add it (use type **Secret** for keys and passwords) and save. Then go to **Deployments**, click **⋯** on the latest deployment and choose **Retry deployment**, so the site picks up the change.

## Step 4 – Payments (Stripe)

Do this with Roy, since the account and bank details must be his.

1. Sign up at **stripe.com**. Stripe starts you in **test mode** (sandbox), so nothing is real yet.
2. **API key:** go to **Developers → API keys** and copy the **Secret key** (`sk_test_…`). In Cloudflare, add it as the secret `STRIPE_SECRET_KEY`.
3. **Webhook** (this is how the site finds out a customer has paid):
   - **Developers → Webhooks → Add endpoint**
   - Endpoint URL: `https://the-gutterguy.pages.dev/api/stripe-webhook`
   - Event to send: **`invoice.paid`**
   - Save it, click **Reveal signing secret** (`whsec_…`) and add it in Cloudflare as the secret `STRIPE_WEBHOOK_SECRET`.
4. **Branding:** in **Settings → Branding**, upload the logo and set the brand colour to `#6e1419`.
5. **Invoice emails and reminders:** in Stripe **Settings**, find the invoice / customer email settings (search "reminders" in the settings search box) and:
   - Turn on **emailing finalized invoices** to customers
   - Turn on **reminders** for one-off invoices. A good pattern is 3 days before the due date, on the due date, and 7 days after.
   - Turn on **payment confirmation / receipt** emails
6. **Payment methods:** in **Settings → Payment methods**, make sure **Cards**, **Apple Pay** and **Google Pay** are on.
7. Retry the deployment in Cloudflare (see the tip at the end of Step 3).

**Test it:** in the admin, open your test request, enter a price and tap **Send quote**.
In test mode Stripe **doesn't email** real customers, so tap **View quote** instead. Pay with the test card **4242 4242 4242 4242**, any future expiry date and any 3-digit CVC. Within a few seconds the job should move to **Paid**.

## Step 5 – Emails (Resend)

1. Sign up at **resend.com**, create an **API key** and add it in Cloudflare as the secret `RESEND_API_KEY`.
2. Until the domain is verified, Resend can only send emails to *your own* address. That's fine for testing. Leave `EMAIL_FROM` out for now.
3. After Step 6, go to **Resend → Domains → Add domain** and add `the-gutterguy.co.uk`. Resend can connect to Cloudflare and add the DNS records for you. If it doesn't, copy them in yourself under **the-gutterguy.co.uk → DNS → Records** (not the StudentStash domain).
4. When it says **Verified**, add `EMAIL_FROM` = `The Gutter Guy <info@the-gutterguy.co.uk>` and retry the deployment.

> Resend only *sends* email. To *receive* mail at info@the-gutterguy.co.uk, either set up **Cloudflare Email Routing** (free) to forward it to Roy's existing inbox, or get a mailbox (Zoho Mail free, Microsoft 365 or Google Workspace).

## Step 6 – Connect the-gutterguy.co.uk

1. **Get the domain onto Cloudflare.** The easiest way is to buy it in Cloudflare: **Domain Registration → Register Domains**, search `the-gutterguy.co.uk` and buy it. It's then added to your account as its own zone automatically.
   *If you bought it elsewhere, use **Add a domain** in Cloudflare and change the nameservers at the registrar to the two Cloudflare shows you.*
2. Go to **Workers & Pages → the-gutterguy → Custom domains → Set up a custom domain**.
3. Enter `www.the-gutterguy.co.uk` and click **Activate domain**. Cloudflare adds the DNS record for you.
4. Repeat for `the-gutterguy.co.uk` (without www).
5. Wait until both show **Active** (usually a few minutes).
6. In Stripe, edit the webhook URL to `https://www.the-gutterguy.co.uk/api/stripe-webhook`.

## Step 7 – Go live

When everything works in test mode:

1. In Stripe, finish **activating the account** (Roy's business and bank details).
2. Switch Stripe to **live mode** and copy the live **Secret key** (`sk_live_…`) into Cloudflare as `STRIPE_SECRET_KEY`.
3. Create the webhook again **in live mode** (same URL, same `invoice.paid` event) and copy its new `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
4. Retry the deployment. Send a real £1 quote to yourself and pay it to check the full flow end to end.

## Step 8 – Set up Roy's phone

- Open **the-gutterguy.co.uk/admin**, log in, then tap **Share → Add to Home Screen**. It now works like an app.
- Go to **Diary → 📅 Add to my phone** so booked jobs appear in his phone's calendar automatically.

---

## Making changes later

- **Change wording or contact details:** on GitHub, open `public/index.html`, click the ✏️ pencil, edit and click **Commit**. Cloudflare updates the live site within a minute.
- **Change the services list:** it's in **two** places that must match – the tick-boxes in `public/index.html` and the `SERVICES` list in `server/routes/request.js`.
- **Change the logo:** replace `public/assets/logo.png` (upload a file with the same name).

## If something goes wrong

- **Form says "Something went wrong":** in Cloudflare open **the-gutterguy → Deployments → View details → Functions → Real-time logs**, then try the form again to see the error. Usually a missing or mistyped variable, or `schema.sql` wasn't run.
- **Jobs don't turn Paid:** in Stripe check **Developers → Webhooks → your endpoint**. Failed deliveries show the error. Check the URL and the `STRIPE_WEBHOOK_SECRET`.
- **No emails:** check `RESEND_API_KEY`, and that the domain is verified in Resend.
- **Can't log in:** check `ADMIN_PASSWORD`, then retry the deployment.
