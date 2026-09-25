// Account (/app/account.html): business info, billing link, photo link, sign out.
import { startPortal, renderError, signOut } from './portal.js';
import { sendRequest } from './request-api.js';
import { STRIPE_PORTAL_LOGIN_URL } from './config.js';
import { esc, longDate, DASH } from './format.js';

const $ = (id) => document.getElementById(id);

function infoRow(label, value) {
  return `<div><dt>${esc(label)}</dt><dd>${value ? esc(value) : DASH}</dd></div>`;
}

async function boot() {
  const main = $('main');
  try {
    const ctx = await startPortal();
    if (!ctx) return;
    const c = ctx.client;
    $('info').innerHTML = [
      infoRow('Business name', c.business_name),
      infoRow('Owner', c.owner_name),
      infoRow('Phone', c.phone),
      infoRow('Email', c.email),
      infoRow('Town', c.city),
      infoRow('Trade', c.trade),
      infoRow('With Mission Found since', c.start_date && longDate(c.start_date)),
    ].join('');

    if (STRIPE_PORTAL_LOGIN_URL) {
      $('billing').hidden = false;
      $('billing-link').href = STRIPE_PORTAL_LOGIN_URL;
    }

    const linkBtn = $('new-link');
    const linkMsg = $('link-msg');
    if (ctx.isAdmin) {
      linkBtn.disabled = true;
      linkMsg.textContent = 'View-as mode: create links with /api/upload-link/create (see app/README.md).';
    } else {
      linkBtn.addEventListener('click', async () => {
        linkBtn.disabled = true;
        linkMsg.className = 'form-msg';
        linkMsg.textContent = 'Sending…';
        try {
          await sendRequest(ctx.clientId, 'photos_or_info', 'Please text me a new photo link. I lost the old one.');
          linkMsg.textContent = 'Got it. We\'ll text you a new link within 24 hours.';
        } catch {
          linkBtn.disabled = false;
          linkMsg.className = 'form-msg error';
          linkMsg.textContent = 'That didn\'t send. Please try again, or call us.';
        }
      });
    }

    $('signout').addEventListener('click', signOut);
    main.removeAttribute('aria-busy');
  } catch {
    main.removeAttribute('aria-busy');
    renderError($('info'), 'We couldn\'t load your account just now.', () => location.reload());
  }
}

boot();
