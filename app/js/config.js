// Public browser configuration. Everything here is safe to publish:
// the anon key only grants what the row-level security policies allow.
// NEVER put the service-role key, RESEND_API_KEY, or any other secret here —
// those live only in Vercel environment variables for /api (see app/README.md).

export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-SUPABASE-ANON-KEY';

// Stripe customer portal login link (Stripe Dashboard -> Settings -> Billing ->
// Customer portal -> "Login link"). Leave empty to hide the billing button.
export const STRIPE_PORTAL_LOGIN_URL = '';

export const PHONE_DISPLAY = '603-921-0218';
export const PHONE_TEL = 'tel:6039210218';

export const isConfigured = !SUPABASE_URL.includes('YOUR-PROJECT-REF') && !SUPABASE_ANON_KEY.startsWith('YOUR-');
