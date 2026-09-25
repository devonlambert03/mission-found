// POST /api/upload-link/complete — PUBLIC, authorised by the secret link token.
// Body: { "token": "...", "paths": ["<client_id>/<uuid>.jpg", ...] }
// Records client_uploads rows for files that were signed for this token AND
// actually landed in storage, then emails Devon.
import { handler, jsonBody, sendJson, HttpError } from '../_lib/http.js';
import { serviceClient } from '../_lib/supabase.js';
import { resolveToken } from '../_lib/upload-token.js';
import { notify } from '../_lib/notify.js';
import { MAX_FILES_PER_REQUEST } from '../../app/js/upload-rules.js';

const BUCKET = 'client-uploads';

export default handler(['POST'], async (req, res) => {
  const body = jsonBody(req);
  const link = await resolveToken(body.token);
  const paths = body.paths;
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_FILES_PER_REQUEST
      || !paths.every((p) => typeof p === 'string' && p.startsWith(`${link.clientId}/`))) {
    throw new HttpError(400, 'invalid_paths', 'Nothing to record.');
  }

  const db = serviceClient();
  const { data: pending, error } = await db
    .from('upload_link_files')
    .select('id, storage_path, original_filename, content_type, size_bytes, caption')
    .eq('token_id', link.tokenId)
    .is('completed_at', null)
    .in('storage_path', paths);
  if (error) throw error;

  // Only record files that really exist in storage.
  const present = [];
  for (const file of pending) {
    const name = file.storage_path.slice(link.clientId.length + 1);
    const { data: listed, error: listError } = await db.storage
      .from(BUCKET)
      .list(link.clientId, { search: name, limit: 1 });
    if (listError) throw listError;
    const object = listed?.find((o) => o.name === name);
    if (object) present.push({ file, size: object.metadata?.size ?? file.size_bytes });
  }

  if (present.length > 0) {
    const { error: insertError } = await db.from('client_uploads').upsert(
      present.map(({ file, size }) => ({
        client_id: link.clientId,
        storage_path: file.storage_path,
        original_filename: file.original_filename,
        content_type: file.content_type,
        size_bytes: size,
        caption: file.caption,
        source: 'upload_link',
        status: 'new',
      })),
      { onConflict: 'storage_path', ignoreDuplicates: true },
    );
    if (insertError) throw insertError;

    const { error: doneError } = await db
      .from('upload_link_files')
      .update({ completed_at: new Date().toISOString() })
      .in('id', present.map(({ file }) => file.id));
    if (doneError) throw doneError;

    const count = present.length;
    const caption = present.find(({ file }) => file.caption)?.file.caption;
    await notify({
      subject: `${link.businessName} sent ${count} photo${count === 1 ? '' : 's'}`,
      text: [
        `${link.businessName} sent ${count} new photo${count === 1 ? '' : 's'} with their photo link.`,
        caption ? `Caption: "${caption}"` : null,
        `They're in the client-uploads bucket under ${link.clientId}/.`,
      ].filter(Boolean).join('\n'),
    });
  }

  sendJson(res, 200, { recorded: present.length });
});
