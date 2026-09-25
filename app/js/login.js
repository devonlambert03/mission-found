// Sign in with a 6-digit email code. The code is the main path because magic
// links break inside email apps' built-in browsers and get "clicked" early by
// email link scanners. The same email also has a link as a fallback.
import { supabase } from './supabase.js';
import { isConfigured } from './config.js';

const $ = (id) => document.getElementById(id);

// Only allow same-site portal paths as the post-login destination.
function nextUrl() {
  const next = new URLSearchParams(location.search).get('next') || '/app/';
  return next.startsWith('/app/') && !next.startsWith('//') ? next : '/app/';
}

function setMsg(el, text, isError = false) {
  el.textContent = text;
  el.className = `form-msg${isError ? ' error' : ''}`;
}

async function boot() {
  if (!isConfigured) {
    $('email-form').hidden = true;
    $('not-configured').hidden = false;
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    location.replace(nextUrl());
    return;
  }

  const emailForm = $('email-form');
  const codeForm = $('code-form');
  const emailInput = $('email');
  const codeInput = $('code');
  let email = '';

  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('email-msg');
    email = emailInput.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMsg(msg, 'That email doesn\'t look right. Check it and try again.', true);
      emailInput.focus();
      return;
    }
    const btn = emailForm.querySelector('button');
    btn.disabled = true;
    setMsg(msg, 'Sending your code…');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, // only clients Devon has invited can sign in
        emailRedirectTo: `${location.origin}${nextUrl()}`,
      },
    });
    btn.disabled = false;
    // An unknown email gets the same screen as a known one, so the form
    // can't be used to check who is a client.
    if (error && error.status === 429) {
      setMsg(msg, 'Too many tries. Wait a minute, then try again.', true);
      return;
    }
    if (error && !/signups not allowed|not found/i.test(error.message)) {
      setMsg(msg, navigator.onLine ? 'We couldn\'t send a code just now. Please try again.' : 'You\'re offline. Connect to the internet and try again.', true);
      return;
    }
    setMsg(msg, '');
    $('sent-to').textContent = email;
    emailForm.hidden = true;
    codeForm.hidden = false;
    codeInput.focus();
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('code-msg');
    const token = codeInput.value.replace(/\D/g, '');
    if (token.length !== 6) {
      setMsg(msg, 'The code is 6 numbers.', true);
      codeInput.focus();
      return;
    }
    const btn = codeForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    setMsg(msg, 'Checking…');
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    btn.disabled = false;
    if (error) {
      setMsg(msg, 'That code didn\'t work. Check the newest email from us, or get a new code.', true);
      codeInput.select();
      return;
    }
    location.replace(nextUrl());
  });

  $('change-email').addEventListener('click', () => {
    codeForm.hidden = true;
    emailForm.hidden = false;
    codeInput.value = '';
    setMsg($('code-msg'), '');
    emailInput.focus();
  });
}

boot();
