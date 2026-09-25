# Mission Found client portal (Phase 1)

The portal lives at `/app/`. Clients sign in with a 6-digit email code and see
their results against where they started, send job photos, send change
requests and manage billing. There's also a no-login photo link for each client.

Phase 1 = database, security, sign-in, client pages, seed data, docs.
Phase 2 = admin screens + CSV import. Phase 3 = PDF reports + monthly summary email.
Until Phase 2, **you enter data in the Supabase table editor**.

```
app/                   portal pages (static HTML + ES modules, no build step)
  css/tokens.css       every color, size and spacing value — re-theme from here
  js/config.js         PUBLIC settings: Supabase URL, anon key, Stripe link
api/                   Vercel serverless functions (the only place secrets are used)
supabase/migrations/   database schema, security rules, storage buckets
supabase/seed.sql      DEMO data (fake businesses) for local testing only
supabase/tests/        row-level security tests (pgTAP)
supabase/templates/    sign-in and invite email templates
scripts/               secrets check, plain-Postgres test runner
```

---

## 1. One-time setup

### 1.1 Create the Supabase project
1. [supabase.com](https://supabase.com) → **New project**. Pick a US East region.
2. **Project Settings → API**: copy the **Project URL**, the **anon / public** key
   and the **service_role** key. The service_role key is a password to your whole
   database. It goes in Vercel only (step 1.6), never in any file in this repo.

### 1.2 Create the tables, security rules and storage buckets
With the [Supabase CLI](https://supabase.com/docs/guides/cli):
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push          # runs supabase/migrations/*.sql
```
No CLI? Open **SQL Editor**, paste all of `supabase/migrations/20260925000000_init.sql`, and run it.

This also creates two **private** storage buckets, `client-uploads` (photos, 15 MB
max, JPEG/PNG/WEBP/HEIC) and `reports` (PDFs). Check they appear under **Storage**.

**Don't run `supabase/seed.sql` on the real project.** It creates demo logins.

### 1.3 Turn on sign-in by email code
**Authentication → Sign In / Providers → Email**
- Email provider: **on**. Confirm email: on.
- **Allow new users to sign up: OFF.** Clients are invited by you; nobody can make their own account.
- Email OTP length: **6**. Email OTP expiration: **3600** seconds.

**Authentication → Emails → Templates**
- **Magic Link**: subject `Your Mission Found sign-in code`, body = contents of
  `supabase/templates/magic_link.html`. The `{{ .Token }}` line is the 6-digit code;
  that's the main way clients sign in. The link below it is a backup.
- **Invite user**: subject `Your Mission Found results page is ready`, body =
  `supabase/templates/invite.html`.

**Authentication → URL Configuration**
- Site URL: `https://mission-found.com/app/`
- Redirect URLs: `https://mission-found.com/app/**` and, for Vercel previews,
  `https://*-devonlambert03-projects.vercel.app/app/**`

### 1.4 Custom SMTP (required before real clients)
Supabase's built-in email is rate-limited to a few emails per hour and is only for testing.
Use Resend's SMTP (same account as step 1.6):
**Authentication → Emails → SMTP Settings** → enable custom SMTP:
host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key,
sender e.g. `portal@mission-found.com` (verify the domain in Resend first).
Then raise **Authentication → Rate Limits → emails per hour** to something like 30.

### 1.5 Public browser config
Edit `app/js/config.js`:
```js
export const SUPABASE_URL = 'https://<ref>.supabase.co';
export const SUPABASE_ANON_KEY = '<anon public key>';
export const STRIPE_PORTAL_LOGIN_URL = '';   // see 1.7; empty hides the billing button
```
The anon key is safe to publish; the row-level security rules decide what it can see.

### 1.6 Vercel environment variables
**Vercel → mission-found → Settings → Environment Variables** (Production + Preview):

| Name | Required | What it is |
|---|---|---|
| `SUPABASE_URL` | yes | Same Project URL as config.js |
| `SUPABASE_ANON_KEY` | yes | Same anon key (kept here too so server code can use it later) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | service_role key. **Secret.** |
| `RESEND_API_KEY` | optional | Emails you when a client sends photos or a request. If missing, emails are skipped (one warning in the function log) and nothing else breaks. |
| `NOTIFY_EMAIL` | optional | Where those emails go (your inbox) |
| `NOTIFY_FROM` | optional | Sender, e.g. `Mission Found Portal <portal@mission-found.com>`. Defaults to Resend's test sender, which only delivers to your own Resend account email. |
| `SITE_URL` | optional | e.g. `https://mission-found.com`. Used to build photo links; defaults to the request's host. |

Redeploy after adding them.

### 1.7 Stripe customer portal (billing button)
Stripe Dashboard → **Settings → Billing → Customer portal** → turn it on, allow
"update payment method" and "view invoice history" → copy the **Login link**
(`https://billing.stripe.com/p/login/...`) → paste into `STRIPE_PORTAL_LOGIN_URL`
in `app/js/config.js`. Clients enter their billing email there and Stripe emails them a link.

### 1.8 Make yourself admin
1. **Authentication → Users → Invite user** → your email. Accept the invite.
2. **SQL Editor**:
```sql
insert into public.profiles (user_id, role)
select id, 'admin' from auth.users where email = 'you@yourdomain.com';
```
Sign in at `/app/`. Admins get a "Viewing as client" picker at the top (read-only).

---

## 2. Adding a client (until Phase 2 adds a button)

1. **Client row**, **Table Editor → clients → Insert row**: business_name, trade, city,
   owner_name, email, phone, `start_date` (first day you manage them), status `active`
   (or `onboarding`). `gbp_location_id` can stay empty.
2. **Baseline**, **baseline_snapshots → Insert row**: client_id + the numbers from your
   onboarding audit, as **monthly** figures. Leave `period_start`/`period_end` empty and
   they default to the last full calendar month before `start_date`. For a 3-month
   average, set `period_type = three_month_avg` and enter the monthly average.
   Internal audit notes go in `baseline_audit_notes`; clients can never see that table.
3. **Checklist**, one `completeness_checklist` row per item you're tracking (missing
   items count as "To do"). The 0–100 profile health score is computed from this by
   `public.completeness_score()`; the weights are in the migration.
4. **Invite**: **Authentication → Users → Invite user** → the owner's email.
5. **Link login to business** in the SQL Editor:
```sql
insert into public.profiles (user_id, client_id, role)
select u.id, c.id, 'client'
from auth.users u, public.clients c
where u.email = 'owner@theirbusiness.com' and c.business_name = 'Their Business';
```
6. **Text them their photo link** (section 3).

### Monthly data entry
- `monthly_metrics`: one row per client per month; `month` must be the 1st (`2026-08-01`).
  Leave a number **empty** (not 0) if Google didn't report it; the portal shows "—".
  `messages` is historical only (Google ended GBP chat in 2024) and `photo_views` isn't
  in Google's current API. Neither counts toward any total.
- `top_search_terms` (JSON): `[{"term":"plumber near me","impressions":120,"is_threshold":false},{"term":"drain cleaning","impressions":15,"is_threshold":true}]`.
  When Google only says "<15", store `15` with `is_threshold: true`; the portal shows "fewer than 15".
- `reviews_snapshot`: one row per month.
- `activity_log`: set `visible_to_client = true` for anything the client should see.
  Internal notes stay `false`.
- `client_requests`: move `status` to `in_progress` / `done` as you work them.
- `client_uploads`: set `status` to `used` once a photo goes in a post.

**Write rules for monthly_metrics.** Every writer upserts on `(client_id, month)`.
Data from Google's API (`source = api`) overwrites CSV or manual rows. Setting
`locked = true` freezes a row against CSV/API writes; your own manual edits still apply.
Totals (views = 4 impression fields; actions = calls + directions + website clicks + bookings)
come only from the `monthly_metrics_derived` / `baseline_snapshots_derived` views.

---

## 3. Photo links (no login)

Each client gets one secret link. Only a SHA-256 hash is stored, so **you only see the
link once**. Making a new one kills the old one. The link can only *add* photos; it
can't see existing photos or any client data except the business name.

Until Phase 2 adds a button, create it with curl. First get an admin access token
(the code arrives by email):
```bash
SB=https://<ref>.supabase.co; ANON=<anon key>
curl -s "$SB/auth/v1/otp" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"email":"you@yourdomain.com","create_user":false}'
TOKEN=$(curl -s "$SB/auth/v1/verify" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"type":"email","email":"you@yourdomain.com","token":"123456"}' | jq -r .access_token)
```
(Replace `123456` with the code from the email. Tokens last an hour.)
Then:
```bash
curl -s https://mission-found.com/api/upload-link/create \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"client_id":"<client uuid>"}'
```
Text the `link` from the response to the owner and suggest they add it to their home
screen (the page has instructions). Limits: 20 photos per batch, 100 per link per day,
15 MB each. You get an email for each batch if Resend is set up (1.6).

If a client taps "Request a new photo link" on their Account page, it shows up as a
request. Run the curl again and text the new link.

---

## 4. Security and tests

Row-level security is on for every table. Clients can read only their own rows. Hidden
activity, draft reports, audit notes and upload tokens are never readable by clients.
Clients can only *insert* photo rows and requests, and can't choose the status of either.
Nothing can be updated or deleted by a client. Storage follows the same rules by folder
(`{client_id}/...`). Admins can do everything.

**`supabase/tests/rls_test.sql`** (89 pgTAP assertions) checks all of that:
client A can't read or insert B's rows in any table or bucket; can't see hidden/draft/
internal data; can't set statuses; can't update or delete anything (including their own
role); anonymous visitors get nothing; admin can read/write everything; plus the
monthly_metrics lock/overwrite rules, the default baseline period, and one-active-token.

Run it (needs Docker for the local stack):
```bash
supabase start
supabase db reset     # migrations + seed
supabase test db
```
No Docker? `scripts/rls-local/run.sh` runs the migration, seed and the same tests on a
plain PostgreSQL with pgTAP, using a small stand-in for Supabase's auth/storage schemas.

### No secrets in the browser
The service-role key and Resend key are only read in `/api` via `process.env`.
Before merging anything that touches the site, run:
```bash
scripts/check-no-secrets.sh
```
It fails if any browser-served file contains a Supabase secret key, a service_role JWT,
a Resend or Stripe secret key, or `process.env`.

---

## 5. Google Business Profile sync (later)

`/api/sync-gbp` is a stub (returns 501). When Google approves API access, implement the
two adapter functions documented at the top of `api/sync-gbp.js`:
`fetchMonthlyMetrics(locationId, month)` and `fetchSearchKeywords(locationId, month)`.
Upsert into `monthly_metrics` with `source = 'api'` and the write rules above handle the rest.
Google's Performance API keeps about 18 months of history, so baselines can be backfilled then.

---

## 6. Local development

```bash
npm install                       # only for /api
supabase start && supabase db reset
# put the local URL + anon key from `supabase status` in app/js/config.js (don't commit them)
vercel dev                        # serves the site and /api on http://localhost:3000
```
Demo logins: `demo-plumber@example.com`, `demo-contractor@example.com`,
`admin@example.com`. Local emails (with the code) show up in Mailpit at
http://127.0.0.1:54324. The demo photos in `supabase/seed-assets/` are uploaded
automatically by `supabase start`.
