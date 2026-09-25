// Shared by the Requests and Account pages.
import { supabase } from './supabase.js';

export const REQUEST_TYPES = {
  hours_change: 'Change my hours',
  services_change: 'Update my services',
  photos_or_info: 'I have photos or info for you',
  question: 'Question',
  other: 'Something else',
};

// Tell Devon. Fire-and-forget: the request is already saved, so a failed
// email must never look like a failed request to the client.
async function notifyDevon(requestId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/request-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ request_id: requestId }),
      keepalive: true,
    });
  } catch {
    // Devon still sees the request in Supabase.
  }
}

// Inserts a request (RLS forces status = 'received') and emails Devon.
export async function sendRequest(clientId, type, message) {
  const { data, error } = await supabase
    .from('client_requests')
    .insert({ client_id: clientId, type, message })
    .select('id')
    .single();
  if (error) throw error;
  notifyDevon(data.id);
  return data.id;
}
