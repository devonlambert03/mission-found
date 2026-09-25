// POST /api/request-notify — signed-in client.
// Body: { "request_id": "<uuid>" }
// The portal inserts the request directly (RLS allows that), then calls this
// so Devon gets an email. Each request is emailed at most once.
import { handler, jsonBody, requireUuid, sendJson, HttpError } from './_lib/http.js';
import { getCaller, serviceClient } from './_lib/supabase.js';
import { notify, siteUrl } from './_lib/notify.js';

const TYPE_LABELS = {
  hours_change: 'Change my hours',
  services_change: 'Update my services',
  photos_or_info: 'I have photos or info for you',
  question: 'Question',
  other: 'Something else',
};

export default handler(['POST'], async (req, res) => {
  const { profile } = await getCaller(req);
  const requestId = requireUuid(jsonBody(req).request_id, 'request_id');
  const db = serviceClient();

  const { data: request, error } = await db
    .from('client_requests')
    .select('id, client_id, type, message, notified_at, clients(business_name, owner_name, phone)')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw error;
  // Same answer for "doesn't exist" and "not yours" so ids can't be probed.
  if (!request || !profile?.client_id || request.client_id !== profile.client_id) {
    throw new HttpError(404, 'request_not_found', 'We could not find that request.');
  }
  if (request.notified_at) {
    sendJson(res, 200, { notified: true });
    return;
  }

  // Claim the notification first so a double-tap can't send two emails.
  const { data: claimed, error: claimError } = await db
    .from('client_requests')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', requestId)
    .is('notified_at', null)
    .select('id');
  if (claimError) throw claimError;
  if (claimed.length === 0) {
    sendJson(res, 200, { notified: true });
    return;
  }

  const c = request.clients || {};
  await notify({
    subject: `New request from ${c.business_name}: ${TYPE_LABELS[request.type]}`,
    text: [
      `${c.business_name} (${c.owner_name || 'owner'}${c.phone ? ', ' + c.phone : ''}) sent a request.`,
      `Type: ${TYPE_LABELS[request.type]}`,
      '',
      request.message,
      '',
      `Promised response: within 24 hours. Update the status in Supabase (client_requests) when done.`,
      `${siteUrl(req)}/app/`,
    ].join('\n'),
  });

  sendJson(res, 200, { notified: true });
});
