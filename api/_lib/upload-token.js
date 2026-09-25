// Per-client secret photo links. The raw token only ever exists in the link
// Devon texts to the client; the database stores its SHA-256 hash.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';
import { serviceClient } from './supabase.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url, no padding

export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

const INVALID = () =>
  new HttpError(404, 'invalid_link', 'This photo link is not active anymore.');

// Looks up the active token row plus the client's business name.
// The hash is looked up by index, then compared in constant time so the
// response time doesn't depend on how many characters matched.
export async function resolveToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw INVALID();
  const hash = hashToken(token);
  const { data, error } = await serviceClient()
    .from('upload_tokens')
    .select('id, client_id, token_hash, revoked_at, clients(business_name, status)')
    .eq('token_hash', hash)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw INVALID();
  const a = Buffer.from(data.token_hash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw INVALID();
  if (data.revoked_at || data.clients?.status === 'cancelled') throw INVALID();
  return { tokenId: data.id, clientId: data.client_id, businessName: data.clients?.business_name || '' };
}
