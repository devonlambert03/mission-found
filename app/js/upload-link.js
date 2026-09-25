// Upload by secret link (/app/upload.html?t=...), no sign-in.
// The page only ever learns the business name. It can't list or read any
// files, so a leaked link only lets someone ADD photos.
import { createUploader, uploaderMarkup } from './uploader.js';
import { isConfigured, PHONE_DISPLAY, PHONE_TEL } from './config.js';
import { esc } from './format.js';

const TOKEN_KEY = 'mf-upload-token';
const $ = (id) => document.getElementById(id);

// A home-screen shortcut opens the URL it was saved from (the manifest for
// this page has no start_url for exactly that reason). As a backup, remember
// the token on this device in case the link is opened without it.
function readToken() {
  const fromUrl = new URLSearchParams(location.search).get('t');
  try {
    if (fromUrl) localStorage.setItem(TOKEN_KEY, fromUrl);
    return fromUrl || localStorage.getItem(TOKEN_KEY);
  } catch {
    return fromUrl;
  }
}

async function api(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error(navigator.onLine ? 'Couldn\'t reach us. Please try again.' : 'offline'), { network: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Please try again.'), { status: res.status });
  return data;
}

function showInvalid() {
  $('main').innerHTML = `
    <div class="notice narrow">
      <h1>This photo link isn't working</h1>
      <p>It may be old or mistyped. Call or text us and we'll send you a new one.</p>
      <a class="btn btn-block" href="${PHONE_TEL}">Call ${PHONE_DISPLAY}</a>
    </div>`;
}

async function boot() {
  const main = $('main');
  const token = readToken();
  if (!isConfigured || !token) {
    showInvalid();
    return;
  }
  try {
    const { business_name: name } = await api('/api/upload-link/sign', { token, files: [] });
    $('biz-name').textContent = name;
    document.title = `Send photos — ${name} | Mission Found`;
    const root = $('uploader');
    root.innerHTML = uploaderMarkup();
    createUploader(root, {
      async prepare(item) {
        const { uploads } = await api('/api/upload-link/sign', {
          token,
          caption: item.caption,
          files: [{ filename: item.name, content_type: item.type, size: item.size }],
        });
        return { signedUrl: uploads[0].signed_url, path: uploads[0].path };
      },
      async finalize(paths) {
        await api('/api/upload-link/complete', { token, paths });
      },
    });
    main.removeAttribute('aria-busy');
  } catch (err) {
    main.removeAttribute('aria-busy');
    if (err.status === 404) {
      try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
      showInvalid();
      return;
    }
    $('uploader').innerHTML = `
      <div class="error-state" role="alert">
        <p>${esc(err.message === 'offline' ? 'You\'re offline. Connect to the internet and try again.' : err.message)}</p>
        <button type="button" class="btn btn-outline" id="retry">Try again</button>
      </div>`;
    $('retry').addEventListener('click', () => location.reload());
  }
}

boot();
