// Email notifications to Devon via Resend (https://resend.com).
// Optional: if RESEND_API_KEY or NOTIFY_EMAIL is missing we skip silently and
// log one warning per cold start. A failed notification never fails the
// user's action — callers don't need to catch anything.

let warned = false;

export async function notify({ subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) {
    if (!warned) {
      console.warn('notify: RESEND_API_KEY or NOTIFY_EMAIL not set; skipping email notifications');
      warned = true;
    }
    return false;
  }
  // Resend only sends from a verified domain. Until one is set up,
  // onboarding@resend.dev works for sending to your own Resend account email.
  const from = process.env.NOTIFY_FROM || 'Mission Found Portal <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error('notify: Resend responded', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('notify: send failed', err?.message || err);
    return false;
  }
}

export function siteUrl(req) {
  const configured = process.env.SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
}
