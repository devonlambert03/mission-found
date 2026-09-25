// Shared start-up for the signed-in portal pages: auth guard, profile,
// admin "view as client" picker, and small UI helpers.
import { supabase } from './supabase.js';
import { isConfigured, PHONE_DISPLAY, PHONE_TEL } from './config.js';
import { esc } from './format.js';

const ADMIN_CLIENT_KEY = 'mf-admin-client';

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: fine */ }
}

export function showFatal(main, html) {
  main.innerHTML = `<div class="notice">${html}</div>`;
  main.removeAttribute('aria-busy');
}

// Renders a friendly error with a retry button into `el`.
export function renderError(el, message, retry) {
  el.innerHTML = `
    <div class="error-state" role="alert">
      <p>${esc(message)}</p>
      <button type="button" class="btn btn-outline">Try again</button>
    </div>`;
  el.querySelector('button').addEventListener('click', retry);
}

function redirectToLogin() {
  const next = location.pathname + location.search;
  location.replace(`/app/login.html?next=${encodeURIComponent(next)}`);
}

// Keeps ?client=<id> on nav links while an admin is viewing a client.
function carryClientParam(clientId) {
  document.querySelectorAll('.tabbar a, a[data-carry-client]').forEach((a) => {
    const url = new URL(a.getAttribute('href'), location.href);
    url.searchParams.set('client', clientId);
    a.setAttribute('href', url.pathname + url.search + url.hash);
  });
}

async function adminPicker(currentId) {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, business_name, status')
    .order('business_name');
  if (error) throw error;
  if (!clients.length) return null;

  const chosen = clients.find((c) => c.id === currentId) || clients[0];
  const wrap = document.createElement('div');
  wrap.className = 'banner-wrap';
  wrap.innerHTML = `
    <div class="banner admin-bar">
      <label for="admin-client">Viewing as client</label>
      <select id="admin-client">
        ${clients.map((c) => `<option value="${c.id}" ${c.id === chosen.id ? 'selected' : ''}>${esc(c.business_name)}${c.status === 'active' ? '' : ` (${esc(c.status)})`}</option>`).join('')}
      </select>
      <span class="small muted">Read-only view. Edit data in Supabase until the admin screens ship.</span>
    </div>`;
  document.querySelector('.app-header').after(wrap);
  wrap.querySelector('select').addEventListener('change', (e) => {
    storageSet(ADMIN_CLIENT_KEY, e.target.value);
    const url = new URL(location.href);
    url.searchParams.set('client', e.target.value);
    location.assign(url);
  });
  return chosen.id;
}

// Returns { user, isAdmin, clientId, client } or null if the page can't continue
// (in which case an explanation or redirect has already happened).
export async function startPortal() {
  const main = document.getElementById('main');
  if (!isConfigured) {
    showFatal(main, `<h2>Almost ready</h2><p>The portal isn't connected to its database yet. Add the Supabase URL and anon key to <code>app/js/config.js</code> (see app/README.md).</p>`);
    return null;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    redirectToLogin();
    return null;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error) throw error;

  if (!profile) {
    showFatal(main, `
      <h2>Your account isn't set up yet</h2>
      <p>You're signed in as ${esc(session.user.email)}, but this email isn't linked to a business yet.
      Call us at <a href="${PHONE_TEL}">${PHONE_DISPLAY}</a> and we'll fix it.</p>
      <button type="button" class="btn btn-outline" id="signout">Sign out</button>`);
    document.getElementById('signout').addEventListener('click', signOut);
    return null;
  }

  const isAdmin = profile.role === 'admin';
  let clientId = profile.client_id;
  if (isAdmin) {
    const requested = new URLSearchParams(location.search).get('client') || storageGet(ADMIN_CLIENT_KEY);
    clientId = await adminPicker(requested);
    if (!clientId) {
      showFatal(main, '<h2>No clients yet</h2><p>Add a row to the <code>clients</code> table in Supabase, then reload.</p>');
      return null;
    }
    storageSet(ADMIN_CLIENT_KEY, clientId);
    carryClientParam(clientId);
    document.body.classList.add('is-admin');
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, business_name, trade, city, owner_name, email, phone, start_date, status')
    .eq('id', clientId)
    .single();
  if (clientError) throw clientError;

  return { user: session.user, isAdmin, clientId, client };
}

export async function signOut() {
  await supabase.auth.signOut();
  location.replace('/app/login.html');
}

// Disables every form control inside `root` for the admin read-only view.
export function makeReadOnly(root, note) {
  root.querySelectorAll('input, textarea, select, button').forEach((el) => { el.disabled = true; });
  const p = document.createElement('p');
  p.className = 'notice small';
  p.textContent = note;
  root.prepend(p);
}
