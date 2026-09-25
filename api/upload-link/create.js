// POST /api/upload-link/create — ADMIN ONLY.
// Body: { "client_id": "<uuid>" }
// Revokes the client's current photo link (if any) and returns a new one.
// The full link is only ever returned here, once; only its hash is stored.
import { handler, jsonBody, requireUuid, sendJson, HttpError } from '../_lib/http.js';
import { requireAdmin, serviceClient } from '../_lib/supabase.js';
import { newToken, hashToken } from '../_lib/upload-token.js';
import { siteUrl } from '../_lib/notify.js';

export default handler(['POST'], async (req, res) => {
  await requireAdmin(req);
  const clientId = requireUuid(jsonBody(req).client_id, 'client_id');
  const db = serviceClient();

  const { data: client, error } = await db
    .from('clients')
    .select('id, business_name')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!client) throw new HttpError(404, 'client_not_found', 'No client with that id.');

  const token = newToken();
  const { error: rotateError } = await db.rpc('rotate_upload_token', {
    p_client_id: clientId,
    p_token_hash: hashToken(token),
  });
  if (rotateError) throw rotateError;

  sendJson(res, 200, {
    client_id: client.id,
    business_name: client.business_name,
    link: `${siteUrl(req)}/app/upload.html?t=${token}`,
    note: 'This link is shown once. Text it to the client now; any older link has stopped working.',
  });
});
