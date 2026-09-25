// Shared photo uploader for /app/photos.html (signed in) and
// /app/upload.html (secret link). Handles: shrinking big photos on the phone,
// per-file progress, per-file retry, offline detection, and the thank-you
// screen. Where files go is decided by an `adapter`:
//   prepare(item)   -> { signedUrl, path }   get a signed upload URL for one file
//   finish(item)    -> void                  optional, after each file lands
//   finalize(items) -> void                  optional, once per batch of landed files
import { SUPABASE_ANON_KEY } from './config.js';
import { MAX_BYTES, MAX_FILES_PER_REQUEST, contentTypeFor } from './upload-rules.js';
import { icons } from './icons.js';
import { esc } from './format.js';

const MAX_EDGE = 2500;  // px; longer photos are scaled down before upload
const JPEG_QUALITY = 0.85;
const CONCURRENCY = 2;

// Decode and downscale if the long edge is over MAX_EDGE. If the browser
// can't decode the file (e.g. HEIC outside Safari) the original is sent as-is.
async function shrink(file, type) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { blob: file, type, name: file.name };
  }
  const long = Math.max(bitmap.width, bitmap.height);
  if (long <= MAX_EDGE) {
    bitmap.close();
    return { blob: file, type, name: file.name };
  }
  const scale = MAX_EDGE / long;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const outType = type === 'image/png' || type === 'image/webp' ? type : 'image/jpeg';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, outType, JPEG_QUALITY));
  if (!blob || blob.size >= file.size) return { blob: file, type, name: file.name };
  const name = outType === type ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return { blob, type: outType, name };
}

// PUT to a Supabase signed upload URL with progress events (fetch can't
// report upload progress). Same request shape as supabase-js uploadToSignedUrl.
function put(url, blob, type, name, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(xhr.status === 413 ? 'This photo is too big (15 MB max).' : 'Upload failed.')));
    xhr.onerror = () => reject(new Error(navigator.onLine ? 'Upload failed.' : 'offline'));
    const form = new FormData();
    form.append('cacheControl', '3600');
    // Storage reads the type from this part. Some browsers report HEIC as
    // an empty type, which would arrive as application/octet-stream and be
    // refused by the bucket, so always send the type we resolved.
    form.append('', blob.type === type ? blob : new Blob([blob], { type }), name);
    xhr.send(form);
  });
}

export function createUploader(root, adapter) {
  const input = root.querySelector('.file-input');
  const caption = root.querySelector('.caption-input');
  const list = root.querySelector('.upload-list');
  const status = root.querySelector('.upload-status');
  const picker = root.querySelector('.picker');
  const success = root.querySelector('.success');
  const offline = root.querySelector('.offline-notice');
  let items = [];
  let running = 0;

  const setOffline = () => { offline.hidden = navigator.onLine; };
  window.addEventListener('offline', setOffline);
  window.addEventListener('online', () => {
    setOffline();
    items.filter((i) => i.state === 'failed' && i.offline).forEach(retry);
  });
  setOffline();

  function rowHtml(item) {
    const pct = Math.round(item.progress * 100);
    const label = {
      queued: 'Waiting…',
      shrinking: 'Getting ready…',
      uploading: `Sending… ${pct}%`,
      done: 'Sent',
      failed: item.error || 'Didn\'t send',
    }[item.state];
    return `
      <li class="upload-row" data-id="${item.id}">
        <span class="upload-thumb-wrap">${item.thumb
          ? `<img class="upload-thumb" src="${item.thumb}" alt="">`
          : `<span class="upload-thumb" aria-hidden="true">${icons.camera}</span>`}</span>
        <span class="upload-meta">
          <span class="upload-name">${esc(item.file.name || 'Photo')}</span>
          ${item.state === 'uploading' ? `<progress class="progress" max="100" value="${pct}" aria-label="Sending ${esc(item.file.name)}"></progress>` : ''}
          <span class="small ${item.state === 'failed' ? 'error-text' : 'muted'}">${esc(label)}</span>
        </span>
        <span>${item.state === 'done'
          ? `<span class="badge solid">${icons.check}<span class="visually-hidden">Sent</span></span>`
          : item.state === 'failed' && item.retryable
            ? `<button type="button" class="btn btn-outline" data-retry="${item.id}">${icons.retry}Retry</button>`
            : ''}</span>
      </li>`;
  }

  function render() {
    list.innerHTML = items.map(rowHtml).join('');
    list.querySelectorAll('img.upload-thumb').forEach((img) => {
      img.addEventListener('error', () => { img.replaceWith(Object.assign(document.createElement('span'), { className: 'upload-thumb' })); }, { once: true });
    });
    const done = items.filter((i) => i.state === 'done').length;
    const failed = items.filter((i) => i.state === 'failed').length;
    const busy = items.length - done - failed;
    if (busy) status.textContent = `Sending ${items.length} photo${items.length === 1 ? '' : 's'}…`;
    else if (failed) status.textContent = `${done} sent, ${failed} didn't go through. Tap Retry, or call us if it keeps happening.`;
    else status.textContent = '';
  }

  // Retry buttons are re-rendered constantly, so listen on the list.
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-retry]');
    if (btn) retry(items.find((i) => i.id === btn.dataset.retry));
  });

  function retry(item) {
    if (!item) return;
    Object.assign(item, { state: 'queued', error: null, offline: false, progress: 0 });
    render();
    pump();
  }

  async function run(item) {
    try {
      if (!navigator.onLine) throw new Error('offline');
      item.state = 'shrinking';
      render();
      const shrunk = item.shrunk || (item.shrunk = await shrink(item.file, item.type));
      if (shrunk.blob.size > MAX_BYTES) {
        item.retryable = false;
        throw new Error('This photo is too big (15 MB max).');
      }
      const target = await adapter.prepare({ ...shrunk, size: shrunk.blob.size, caption: caption?.value.trim() || '' });
      item.path = target.path;
      item.state = 'uploading';
      render();
      let lastPaint = 0;
      await put(target.signedUrl, shrunk.blob, shrunk.type, shrunk.name, (p) => {
        item.progress = p;
        const now = performance.now();
        if (now - lastPaint > 120) { lastPaint = now; render(); }
      });
      await adapter.finish?.({ ...shrunk, size: shrunk.blob.size, path: item.path, caption: caption?.value.trim() || '' });
      item.state = 'done';
    } catch (err) {
      item.state = 'failed';
      item.offline = err.message === 'offline';
      item.error = item.offline ? 'You\'re offline. We\'ll try again when you\'re back.' : err.message;
    }
    render();
  }

  async function pump() {
    while (running < CONCURRENCY) {
      const next = items.find((i) => i.state === 'queued');
      if (!next) break;
      running += 1;
      next.state = 'shrinking';
      run(next).finally(() => { running -= 1; pump(); });
    }
    if (running === 0) await settle();
  }

  async function settle() {
    const landed = items.filter((i) => i.state === 'done' && !i.finalized);
    if (landed.length) {
      landed.forEach((i) => { i.finalized = true; });
      try {
        await adapter.finalize?.(landed.map((i) => i.path));
      } catch {
        // Files are safely stored even if the bookkeeping call fails;
        // Devon can still see them in the bucket.
      }
    }
    if (items.length && items.every((i) => i.state === 'done')) {
      picker.hidden = true;
      list.hidden = true;
      success.hidden = false;
      success.querySelector('h2, h3')?.focus();
      root.dispatchEvent(new CustomEvent('uploads-complete'));
    }
  }

  input.addEventListener('change', () => {
    const chosen = [...input.files].slice(0, MAX_FILES_PER_REQUEST);
    const skipped = input.files.length - chosen.length;
    input.value = '';
    if (!chosen.length) return;
    items.forEach((i) => i.thumb && URL.revokeObjectURL(i.thumb));
    items = chosen.map((file, n) => {
      const type = contentTypeFor(file.name, file.type);
      return {
        id: `${Date.now()}-${n}`,
        file,
        type,
        thumb: type ? URL.createObjectURL(file) : null,
        state: type ? 'queued' : 'failed',
        error: type ? null : 'Not a photo we can take (JPEG, PNG, WEBP or HEIC).',
        retryable: Boolean(type),
        progress: 0,
      };
    });
    list.hidden = false;
    render();
    if (skipped > 0) status.textContent += ` Only ${MAX_FILES_PER_REQUEST} at a time — send the other ${skipped} next.`;
    pump();
  });

  success.querySelector('.send-more').addEventListener('click', () => {
    items.forEach((i) => i.thumb && URL.revokeObjectURL(i.thumb));
    items = [];
    list.innerHTML = '';
    status.textContent = '';
    if (caption) caption.value = '';
    success.hidden = true;
    picker.hidden = false;
    input.focus();
  });
}

// Markup shared by both photo pages.
export function uploaderMarkup() {
  return `
    <div class="picker stack">
      <div class="field">
        <label for="caption">What job was this? <span class="muted">(optional)</span></label>
        <input id="caption" class="caption-input" type="text" maxlength="200" autocomplete="off" placeholder="e.g. Water heater swap on Main St">
      </div>
      <input id="file-input" class="file-input visually-hidden" type="file" accept="image/*" multiple>
      <label for="file-input" class="btn btn-big btn-block file-pick">${icons.camera}<span>Take or choose photos</span></label>
      <p class="small muted">Up to ${MAX_FILES_PER_REQUEST} at a time. Big photos are shrunk on your phone first to save data.</p>
    </div>
    <p class="notice offline-notice" role="status" hidden>You're offline. Photos will send when you're back online.</p>
    <p class="upload-status" role="status" aria-live="polite"></p>
    <ul class="upload-list" hidden></ul>
    <div class="success card" hidden>
      <span aria-hidden="true" class="big-check">${icons.done}</span>
      <h3 tabindex="-1">Got them — thanks!</h3>
      <p>We'll use these in your next posts.</p>
      <button type="button" class="btn btn-outline send-more">Send more photos</button>
    </div>`;
}
