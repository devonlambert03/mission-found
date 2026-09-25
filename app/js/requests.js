// Requests (/app/requests.html): "Need something changed?" form + history.
// No threads or replies — Devon answers by phone, text or email.
import { supabase } from './supabase.js';
import { startPortal, renderError, makeReadOnly } from './portal.js';
import { esc, shortDate } from './format.js';
import { REQUEST_TYPES, sendRequest } from './request-api.js';

const STATUS = {
  received: 'Received',
  in_progress: 'Working on it',
  done: 'Done',
};
const $ = (id) => document.getElementById(id);

async function loadHistory(clientId) {
  const el = $('history-body');
  try {
    const { data, error } = await supabase
      .from('client_requests')
      .select('id, type, message, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    el.innerHTML = data.length
      ? `<ul class="rows">${data.map((r) => `
          <li>
            <span class="row-main">
              <strong>${esc(REQUEST_TYPES[r.type])}</strong>
              <span>${esc(r.message)}</span>
              <span class="small muted">Sent ${esc(shortDate(r.created_at))}</span>
            </span>
            <span class="badge ${r.status === 'done' ? 'solid' : ''}">${STATUS[r.status]}</span>
          </li>`).join('')}</ul>`
      : '<p class="empty">Nothing yet. When you send a request, you can check on it here.</p>';
  } catch {
    renderError(el, 'We couldn\'t load your past requests.', () => loadHistory(clientId));
  }
}

function prefill(form) {
  const params = new URLSearchParams(location.search);
  const type = params.get('type');
  if (type && REQUEST_TYPES[type]) {
    form.querySelector(`input[name="type"][value="${type}"]`).checked = true;
  }
}

async function boot() {
  const main = $('main');
  try {
    const ctx = await startPortal();
    if (!ctx) return;
    const form = $('request-form');
    const msg = $('form-msg');
    const text = $('message');
    const count = $('count');
    prefill(form);
    text.addEventListener('input', () => { count.textContent = `${text.value.length} / 2000`; });

    if (ctx.isAdmin) {
      makeReadOnly(form, `Viewing ${ctx.client.business_name}'s page. The form is turned off in view-as mode.`);
    } else {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = form.querySelector('input[name="type"]:checked')?.value;
        const message = text.value.trim();
        if (!type) {
          msg.textContent = 'Pick what kind of request this is.';
          msg.className = 'form-msg error';
          form.querySelector('input[name="type"]').focus();
          return;
        }
        if (!message) {
          msg.textContent = 'Tell us a little about what you need.';
          msg.className = 'form-msg error';
          text.focus();
          return;
        }
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        msg.className = 'form-msg';
        msg.textContent = 'Sending…';
        try {
          await sendRequest(ctx.clientId, type, message);
        } catch {
          msg.textContent = navigator.onLine
            ? 'That didn\'t send. Please try again, or call us.'
            : 'You\'re offline. Connect to the internet and try again.';
          msg.className = 'form-msg error';
          return;
        } finally {
          button.disabled = false;
        }
        form.reset();
        count.textContent = '0 / 2000';
        form.hidden = true;
        $('sent').hidden = false;
        $('sent').querySelector('h2').focus();
        loadHistory(ctx.clientId);
      });
      $('send-another').addEventListener('click', () => {
        $('sent').hidden = true;
        form.hidden = false;
        msg.textContent = '';
        form.querySelector('input[name="type"]').focus();
      });
    }
    main.removeAttribute('aria-busy');
    await loadHistory(ctx.clientId);
  } catch {
    main.removeAttribute('aria-busy');
    renderError($('request-card'), 'We couldn\'t load this page. Check your connection and try again.', () => location.reload());
  }
}

boot();
