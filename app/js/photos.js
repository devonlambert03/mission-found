// Send Photos (/app/photos.html), signed in. Uploads go straight to the
// client's own folder in the private bucket (storage RLS allows exactly that),
// then a client_uploads row is added (table RLS forces status = 'new').
import { supabase } from './supabase.js';
import { startPortal, renderError, makeReadOnly } from './portal.js';
import { createUploader, uploaderMarkup } from './uploader.js';
import { ALLOWED_TYPES } from './upload-rules.js';
import { esc, shortDate } from './format.js';

const BUCKET = 'client-uploads';
const STATUS_LABEL = { new: 'New', used: 'Used in a post', not_used: 'Saved for later' };
const $ = (id) => document.getElementById(id);

async function loadPast(clientId) {
  const el = $('past-body');
  try {
    const { data: rows, error } = await supabase
      .from('client_uploads')
      .select('id, storage_path, caption, status, uploaded_at')
      .eq('client_id', clientId)
      .order('uploaded_at', { ascending: false })
      .limit(60);
    if (error) throw error;
    if (!rows.length) {
      el.innerHTML = '<p class="empty">Photos you send will show up here.</p>';
      return;
    }
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(rows.map((r) => r.storage_path), 3600);
    if (signError) throw signError;
    const urls = new Map((signed || []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
    el.innerHTML = `<ul class="thumb-grid">${rows.map((r) => {
      const url = urls.get(r.storage_path);
      const alt = r.caption ? `Photo: ${r.caption}` : `Photo sent ${shortDate(r.uploaded_at)}`;
      return `
        <li>
          ${url ? `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy">` : '<span class="thumb-fallback">Preview not available</span>'}
          <span class="badge ${r.status === 'used' ? 'solid' : ''}">${STATUS_LABEL[r.status]}</span>
          <span class="thumb-caption muted">${esc(r.caption || shortDate(r.uploaded_at))}</span>
        </li>`;
    }).join('')}</ul>`;
    // HEIC previews only render in Safari; show a friendly tile elsewhere.
    el.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => {
      img.replaceWith(Object.assign(document.createElement('span'), { className: 'thumb-fallback', textContent: 'Preview not available on this device' }));
    }, { once: true }));
  } catch {
    renderError(el, 'We couldn\'t load your photos just now.', () => loadPast(clientId));
  }
}

async function boot() {
  const main = $('main');
  try {
    const ctx = await startPortal();
    if (!ctx) return;
    const root = $('uploader');
    root.innerHTML = uploaderMarkup();

    if (ctx.isAdmin) {
      makeReadOnly(root, `Viewing ${ctx.client.business_name}'s page. Uploading is turned off in view-as mode.`);
    } else {
      createUploader(root, {
        async prepare(item) {
          const path = `${ctx.clientId}/${crypto.randomUUID()}.${ALLOWED_TYPES[item.type]}`;
          const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
          if (error) throw new Error('Couldn\'t start the upload. Please try again.');
          return { signedUrl: data.signedUrl, path };
        },
        async finish(item) {
          const { error } = await supabase.from('client_uploads').insert({
            client_id: ctx.clientId,
            storage_path: item.path,
            original_filename: item.name.slice(0, 255),
            content_type: item.type,
            size_bytes: item.size,
            caption: item.caption || null,
          });
          if (error) throw new Error('Sent, but we couldn\'t log it. Tap Retry.');
        },
      });
      root.addEventListener('uploads-complete', () => loadPast(ctx.clientId));
    }
    main.removeAttribute('aria-busy');
    await loadPast(ctx.clientId);
  } catch {
    main.removeAttribute('aria-busy');
    renderError($('uploader'), 'We couldn\'t load this page. Check your connection and try again.', () => location.reload());
  }
}

boot();
