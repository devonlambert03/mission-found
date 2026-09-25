// One shared Supabase client for the portal, loaded as a pinned ESM build.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,     // stay signed in on this phone
        autoRefreshToken: true,
        detectSessionInUrl: true, // magic-link fallback lands on /app/ with tokens in the URL
      },
    })
  : null;
