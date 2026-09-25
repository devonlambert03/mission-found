// POST /api/upload-link/sign — PUBLIC, authorised by the secret link token.
// Body: { "token": "...", "files": [{ "filename", "content_type", "size" }], "caption"?: "..." }
//
// With an empty `files` list this just checks the link and returns the
// business name (upload.html does that on load). Otherwise it returns one
// signed UPLOAD url per file. Nothing here can read or list existing files,
// so a leaked link only lets someone add photos.
import { randomUUID } from 'node:crypto';
import { handler, jsonBody, sendJson, HttpError } from '../_lib/http.js';
import { serviceClient } from '../_lib/supabase.js';
import { resolveToken } from '../_lib/upload-token.js';
import {
  ALLOWED_TYPES, MAX_BYTES, MAX_FILES_PER_REQUEST, DAILY_FILE_LIMIT, contentTypeFor,
} from '../../app/js/upload-rules.js';

const BUCKET = 'client-uploads';

function validateFiles(files) {
  if (!Array.isArray(files)) throw new HttpError(400, 'invalid_files', 'files must be a list.');
  if (files.length > MAX_FILES_PER_REQUEST) {
    throw new HttpError(400, 'too_many_files', `Send up to ${MAX_FILES_PER_REQUEST} photos at a time.`);
  }
  return files.map((f, index) => {
    const filename = typeof f?.filename === 'string' ? f.filename.slice(0, 255) : '';
    const type = contentTypeFor(filename, f?.content_type);
    const size = Number(f?.size);
    if (!type) {
      throw new HttpError(400, 'unsupported_type', `File ${index + 1} isn't a photo we can take (JPEG, PNG, WEBP or HEIC).`);
    }
    if (!Number.isInteger(size) || size <= 0) {
      throw new HttpError(400, 'invalid_size', `File ${index + 1} looks empty.`);
    }
    if (size > MAX_BYTES) {
      throw new HttpError(413, 'file_too_large', `File ${index + 1} is over 15 MB.`);
    }
    return { filename, type, size };
  });
}

export default handler(['POST'], async (req, res) => {
  const body = jsonBody(req);
  const link = await resolveToken(body.token);
  const files = validateFiles(body.files ?? []);
  const caption = typeof body.caption === 'string' ? body.caption.trim().slice(0, 200) : '';

  if (files.length === 0) {
    sendJson(res, 200, { business_name: link.businessName, uploads: [] });
    return;
  }

  const planned = files.map((f) => ({
    storage_path: `${link.clientId}/${randomUUID()}.${ALLOWED_TYPES[f.type]}`,
    original_filename: f.filename,
    content_type: f.type,
    size_bytes: f.size,
    caption,
  }));

  const db = serviceClient();
  const { data: remaining, error } = await db.rpc('reserve_upload_link_files', {
    p_token_id: link.tokenId,
    p_client_id: link.clientId,
    p_files: planned,
    p_daily_limit: DAILY_FILE_LIMIT,
  });
  if (error) {
    if (error.message?.includes('daily_limit_exceeded')) {
      throw new HttpError(429, 'daily_limit', "That's a lot of photos for one day! Please send the rest tomorrow, or call us.");
    }
    throw error;
  }

  const uploads = [];
  for (const [index, p] of planned.entries()) {
    const { data, error: signError } = await db.storage.from(BUCKET).createSignedUploadUrl(p.storage_path);
    if (signError) throw signError;
    uploads.push({ index, path: p.storage_path, signed_url: data.signedUrl, content_type: p.content_type });
  }

  sendJson(res, 200, { business_name: link.businessName, uploads, remaining_today: remaining });
});
