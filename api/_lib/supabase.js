// Service-role Supabase client. The service-role key bypasses RLS, so it is
// read from the server environment only and must never reach a browser file.
import { createClient } from '@supabase/supabase-js';
import { HttpError, bearerToken } from './http.js';

let client;

export function serviceClient() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// Verifies the caller's Supabase JWT and loads their profile.
// Returns { user, profile } where profile is null if none exists.
export async function getCaller(req) {
  const jwt = bearerToken(req);
  const db = serviceClient();
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) {
    throw new HttpError(401, 'not_signed_in', 'Your sign-in has expired. Please sign in again.');
  }
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('user_id, client_id, role')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  return { user: data.user, profile };
}

export async function requireAdmin(req) {
  const caller = await getCaller(req);
  if (caller.profile?.role !== 'admin') {
    throw new HttpError(403, 'admin_only', 'Only Mission Found staff can do this.');
  }
  return caller;
}
