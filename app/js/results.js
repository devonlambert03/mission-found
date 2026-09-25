// Results page (/app/index.html): proves the service works by showing every
// number against the client's pre-Mission-Found baseline.
import { supabase } from './supabase.js';
import { startPortal, renderError } from './portal.js';
import { lazyTrendChart } from './charts.js';
import { icons } from './icons.js';
import {
  DASH, esc, isNum, fmtNum, delta, arrowFor, growthHeadline, friendlyHours, plural,
  monthLabel, monthName, shortDate, longDate, parseDate, addMonths, monthKey,
} from './format.js';

// Plain-English copy for the four headline numbers. No jargon.
const KPIS = [
  {
    key: 'calls', title: 'Calls', desc: 'People who called you from Google',
    info: 'Taps on the "Call" button on your Google listing. People who dial your number by hand aren\'t counted, so the real number is likely higher.',
  },
  {
    key: 'direction_requests', title: 'Directions', desc: 'People who asked for directions',
    info: 'People who asked Google Maps for directions to your business.',
  },
  {
    key: 'website_clicks', title: 'Website visits', desc: 'People who went to your website from Google',
    info: 'Taps on the "Website" link on your Google listing.',
  },
  {
    key: 'total_views', title: 'Total views', desc: 'Times your business showed up on Google',
    info: 'How many times your listing was shown on Google Search and Google Maps, on phones and computers. One person can count more than once.',
  },
];

const COMPARE = [
  { key: 'total_actions', title: 'Calls, directions and website visits, all together', note: 'Plus online bookings, if you take them.' },
  { key: 'calls', title: 'Calls' },
  { key: 'direction_requests', title: 'People who asked for directions' },
  { key: 'website_clicks', title: 'Website visits' },
  { key: 'total_views', title: 'Total views' },
];

const CHECKLIST_LABELS = {
  categories: 'Business categories',
  services: 'Services list',
  description: 'Business description',
  hours: 'Opening hours',
  special_hours: 'Holiday hours',
  photos: 'Photos',
  logo_cover: 'Logo and cover photo',
  products: 'Products',
  attributes: 'Extra details (like "veteran-owned")',
  service_areas: 'Towns you serve',
  q_and_a: 'Questions and answers',
  booking_website_links: 'Website and booking links',
};
const STATUS = {
  done: { text: 'Done', icon: icons.done },
  in_progress: { text: 'In progress', icon: icons.progress },
  todo: { text: 'To do', icon: icons.todo },
};

const $ = (id) => document.getElementById(id);
const state = {};
let destroyChart = () => {};

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
async function loadData(clientId) {
  const q = (p) => p.then(({ data, error }) => { if (error) throw error; return data; });
  const [baseline, metrics, reviews, checklist, score, activity, reports] = await Promise.all([
    q(supabase.from('baseline_snapshots_derived').select('*').eq('client_id', clientId).maybeSingle()),
    q(supabase.from('monthly_metrics_derived')
      .select('month, calls, direction_requests, website_clicks, bookings, total_views, total_actions, top_search_terms')
      .eq('client_id', clientId).order('month')),
    q(supabase.from('reviews_snapshot').select('*').eq('client_id', clientId).order('month')),
    q(supabase.from('completeness_checklist').select('item, status, detail').eq('client_id', clientId)),
    q(supabase.rpc('completeness_score', { p_client_id: clientId })),
    q(supabase.from('activity_log').select('id, date, type, title, detail')
      .eq('client_id', clientId).eq('visible_to_client', true).order('date', { ascending: false }).limit(200)),
    q(supabase.from('reports').select('id, month, storage_path').eq('client_id', clientId)
      .eq('status', 'final').order('month', { ascending: false })),
  ]);
  return { baseline, metrics, reviews, checklist, score, activity, reports };
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------
function deltaHtml(now, before, context) {
  const d = delta(now, before);
  if (!d.text) return '';
  const word = { up: 'Up', down: 'Down', flat: '' }[d.dir];
  return `<p><span class="delta ${d.dir}"><span class="arrow" aria-hidden="true">${arrowFor(d.dir)}</span>`
    + `${word ? `<span class="visually-hidden">${word}: </span>` : ''}${esc(d.text)}</span> <span class="ctx">${esc(context)}</span></p>`;
}

function baselineLabel(b) {
  if (!b) return '';
  if (b.period_type === 'three_month_avg') {
    return `the 3-month average before we started (${monthLabel(b.period_start, { month: 'short' })}–${monthLabel(b.period_end, { month: 'short', year: 'numeric' })})`;
  }
  return monthLabel(b.period_start);
}

function kpiCard(k, value, extras, idx) {
  const infoId = `kpi-info-${idx}`;
  return `
    <article class="kpi-card">
      <div class="kpi-top">
        <h3 class="kpi-label">${esc(k.title)}</h3>
        <button type="button" class="info-btn" aria-expanded="false" aria-controls="${infoId}">
          ${icons.info}<span class="visually-hidden">What is "${esc(k.title)}"?</span>
        </button>
      </div>
      <p class="info-panel" id="${infoId}" hidden>${esc(k.info)}</p>
      <p class="kpi-value">${isNum(value) ? fmtNum(value) : DASH}</p>
      <p class="kpi-desc">${esc(k.desc)}</p>
      <div class="kpi-deltas">${extras}</div>
    </article>`;
}

function wireInfoButtons(root) {
  root.querySelectorAll('.info-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      document.getElementById(btn.getAttribute('aria-controls')).hidden = open;
    });
  });
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
function renderScorecard(month) {
  const { byMonth, baseline } = state;
  const row = byMonth.get(month);
  const prev = byMonth.get(addMonths(month, -1));
  const name = monthName(month);

  $('scorecard-grid').innerHTML = KPIS.map((k, i) => {
    const value = row[k.key];
    const lines = [];
    if (!isNum(value)) {
      lines.push(`<p class="muted">Google didn't report this for ${esc(name)}.</p>`);
    } else {
      lines.push(prev && isNum(prev[k.key])
        ? deltaHtml(value, prev[k.key], `vs ${monthName(prev.month)}`)
        : '<p class="muted">No numbers for the month before.</p>');
      if (baseline && isNum(baseline[k.key])) {
        lines.push(deltaHtml(value, baseline[k.key], 'vs before we started'));
      }
    }
    return kpiCard(k, value, lines.join(''), i);
  }).join('');
  wireInfoButtons($('scorecard-grid'));
  $('scorecard-title').textContent = `Your results for ${monthLabel(month)}`;

  // Seasonality: same month last year, only if we have it.
  const lastYear = byMonth.get(addMonths(month, -12));
  const season = $('season');
  if (lastYear && isNum(lastYear.calls)) {
    season.textContent = `For comparison, last ${name}: ${plural(lastYear.calls, 'call')}${isNum(lastYear.direction_requests) ? `, ${plural(lastYear.direction_requests, 'direction request')}` : ''}.`;
    season.hidden = false;
  } else {
    season.hidden = true;
  }
}

function renderStartingPoint() {
  // New client: no monthly results yet, show the baseline as the starting line.
  const { baseline } = state;
  $('scorecard-title').textContent = 'Your starting point';
  $('month-field').hidden = true;
  const intro = `<p class="notice">Your first monthly results arrive after your first full month. Here's where you're starting from${baseline ? ` (${esc(baselineLabel(baseline))})` : ''}.</p>`;
  if (!baseline) {
    $('scorecard').innerHTML = `<h2>Your starting point</h2>${intro}<p class="empty">We're still recording your starting numbers. They'll show up here soon.</p>`;
    return;
  }
  $('scorecard-grid').innerHTML = KPIS.map((k, i) => kpiCard(k, baseline[k.key], '<p class="muted">Before we started</p>', i)).join('');
  $('scorecard-grid').insertAdjacentHTML('beforebegin', intro);
  wireInfoButtons($('scorecard-grid'));
}

function renderSince(month) {
  const { byMonth, baseline, client } = state;
  const el = $('since-body');
  if (!baseline) {
    el.innerHTML = '<p class="empty">We\'re still recording your starting numbers. This comparison appears once they\'re in.</p>';
    return;
  }
  const row = byMonth.get(month);
  $('since-sub').textContent = `${monthLabel(month)} compared with ${baselineLabel(baseline)}, before we started on ${longDate(client.start_date)}.`;
  el.innerHTML = `<ul class="compare-list">${COMPARE.map((c) => {
    const now = row[c.key];
    const before = baseline[c.key];
    const max = Math.max(isNum(now) ? now : 0, isNum(before) ? before : 0) || 1;
    const d = delta(now, before);
    const pctW = (v) => (isNum(v) ? Math.max(2, Math.round((v / max) * 100)) : 0);
    return `
      <li class="compare-item">
        <div class="compare-head">
          <h3>${esc(c.title)}</h3>
          <span class="compare-headline delta ${d.dir || 'flat'}">
            <span class="arrow" aria-hidden="true">${arrowFor(d.dir)}</span>${esc(growthHeadline(now, before))}
          </span>
        </div>
        ${c.note ? `<p class="small muted">${esc(c.note)}</p>` : ''}
        <div class="bar-row"><span>Before</span><span class="bar-track" aria-hidden="true"><span class="bar before" style="width:${pctW(before)}%"></span></span><span class="num">${fmtNum(before)}</span></div>
        <div class="bar-row"><span>${esc(monthName(month))}</span><span class="bar-track" aria-hidden="true"><span class="bar" style="width:${pctW(now)}%"></span></span><span class="num">${fmtNum(now)}</span></div>
      </li>`;
  }).join('')}</ul>`;
}

function trendSeries(month) {
  const { byMonth, baseline, client } = state;
  const baselineMonth = baseline
    ? `${baseline.period_end.slice(0, 7)}-01`
    : null;
  const firstManaged = `${client.start_date.slice(0, 7)}-01`;
  let from = baselineMonth && baselineMonth < firstManaged ? baselineMonth : firstManaged;
  if (from < addMonths(month, -12)) from = addMonths(month, -12);

  const points = [];
  for (let m = from; m <= month; m = addMonths(m, 1)) {
    const row = byMonth.get(m);
    let value = row && isNum(row.total_actions) ? row.total_actions : null;
    let note = '';
    if (value === null && m === baselineMonth && isNum(baseline.total_actions)) {
      value = baseline.total_actions;
      note = baseline.period_type === 'three_month_avg' ? ' (3-month average)' : '';
    }
    points.push({ month: m, value, note });
  }
  const startIdx = points.findIndex((p) => p.month === firstManaged);
  const start = parseDate(client.start_date);
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return {
    points,
    markerPosition: startIdx >= 0 ? startIdx + (start.getDate() - 1) / daysInMonth : null,
  };
}

function renderTrend(month) {
  destroyChart();
  const { points, markerPosition } = trendSeries(month);
  const labels = points.map((p) => monthLabel(p.month, { month: 'short', year: '2-digit' }));
  const first = points.find((p) => p.value !== null);
  const last = [...points].reverse().find((p) => p.value !== null);
  const summary = first && last && first !== last
    ? `Line chart of total actions per month, from ${fmtNum(first.value)} in ${monthLabel(first.month)} to ${fmtNum(last.value)} in ${monthLabel(last.month)}.`
    : 'Line chart of total actions per month.';

  $('trend-table').innerHTML = `
    <table class="data-table">
      <caption class="visually-hidden">Total actions by month</caption>
      <thead><tr><th scope="col">Month</th><th scope="col" class="n">Total actions</th></tr></thead>
      <tbody>${points.map((p) => `<tr><th scope="row">${esc(monthLabel(p.month))}${esc(p.note)}${p.month === `${state.client.start_date.slice(0, 7)}-01` ? ' — Mission Found started' : ''}</th><td class="n">${fmtNum(p.value)}</td></tr>`).join('')}</tbody>
    </table>`;

  if (points.filter((p) => p.value !== null).length < 2) {
    $('trend-chart').innerHTML = '<p class="empty">The trend line appears once there are two months to compare.</p>';
    destroyChart = () => {};
    return;
  }
  destroyChart = lazyTrendChart($('trend-chart'), {
    labels,
    values: points.map((p) => p.value),
    markerPosition,
    markerLabel: 'Mission Found started',
    summary,
  });
}

function renderReviews(month) {
  const el = $('reviews-body');
  const snap = [...state.reviews].reverse().find((r) => r.month <= month);
  if (!snap) {
    el.innerHTML = '<p class="empty">We\'ll start tracking your Google reviews this month.</p>';
    return;
  }
  const rating = snap.average_rating === null ? null : Number(snap.average_rating); // numeric arrives as a string
  const stars = rating === null ? '' : '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
  let responseRate = DASH;
  if (isNum(snap.new_reviews) && snap.new_reviews === 0) responseRate = 'No new reviews to answer';
  else if (isNum(snap.new_reviews) && isNum(snap.reviews_responded)) {
    responseRate = `${Math.round((snap.reviews_responded / snap.new_reviews) * 100)}%`;
  }
  const hours = snap.avg_response_hours === null ? null : Number(snap.avg_response_hours);
  el.innerHTML = `
    ${snap.month !== month ? `<p class="small muted">Latest numbers are from ${esc(monthLabel(snap.month))}.</p>` : ''}
    <ul class="stat-list">
      <li><span class="muted small">Total reviews</span><span class="stat-value">${fmtNum(snap.total_reviews)}</span></li>
      <li><span class="muted small">Average rating</span>
        <span class="stat-value">${rating === null ? DASH : rating.toFixed(1)}</span>
        ${rating === null ? '' : `<span class="stars" aria-hidden="true">${stars}</span><span class="visually-hidden">${rating.toFixed(1)} out of 5 stars</span>`}
      </li>
      <li><span class="muted small">New this month</span><span class="stat-value">${fmtNum(snap.new_reviews)}</span></li>
      <li><span class="muted small">Reviews we replied to</span><span class="stat-value text">${esc(responseRate)}</span></li>
      <li><span class="muted small">How fast we replied</span><span class="stat-value text">${esc(friendlyHours(hours))}</span></li>
    </ul>`;
}

function renderHealth() {
  const { checklist, score } = state;
  const byItem = new Map(checklist.map((c) => [c.item, c]));
  const items = Object.keys(CHECKLIST_LABELS).map((item) => ({ item, ...(byItem.get(item) || { status: 'todo' }) }));
  const done = items.filter((i) => i.status === 'done').length;
  const r = 52;
  const circ = 2 * Math.PI * r;
  const pct = isNum(score) ? Math.max(0, Math.min(100, score)) : 0;
  $('health-body').innerHTML = `
    <div class="ring-wrap">
      <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="Profile health: ${pct} out of 100">
        <circle class="ring-track" cx="60" cy="60" r="${r}" fill="none" stroke-width="12"/>
        <circle class="ring-fill" cx="60" cy="60" r="${r}" fill="none" stroke-width="12" stroke-linecap="butt"
          stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 60 60)"/>
        <text class="ring-text" x="60" y="68" text-anchor="middle" font-size="30">${pct}</text>
      </svg>
      <p><strong>${done} of ${items.length}</strong> done.<br><span class="muted small">A complete Google profile shows up more often. We work through this list for you.</span></p>
    </div>
    <ul class="checklist">${items.map((i) => `
      <li>
        <span aria-hidden="true">${STATUS[i.status].icon}</span>
        <span>${esc(CHECKLIST_LABELS[i.item])}${i.detail ? `<span class="item-detail">${esc(i.detail)}</span>` : ''}</span>
        <span class="status-tag">${STATUS[i.status].text}</span>
      </li>`).join('')}
    </ul>`;
}

function renderActivity(month) {
  const el = $('activity-body');
  const end = addMonths(month, 1);
  const isLatest = month === state.months[0];
  const inMonth = state.activity.filter((a) => a.date >= month && a.date < end);
  const after = isLatest ? state.activity.filter((a) => a.date >= end) : [];
  $('activity-title').textContent = `What we did in ${monthName(month)}`;

  const list = (items) => `<ul class="feed">${items.map((a) => `
    <li>
      <span class="feed-icon" aria-hidden="true">${icons[a.type] || icons.note}</span>
      <div>
        <p class="feed-title">${esc(a.title)}</p>
        ${a.detail ? `<p class="muted">${esc(a.detail)}</p>` : ''}
        <p class="small muted"><time datetime="${esc(a.date)}">${esc(shortDate(a.date))}</time></p>
      </div>
    </li>`).join('')}</ul>`;

  let html = '';
  if (after.length) {
    html += `<h3 class="feed-group">So far in ${esc(monthName(monthKey(new Date())))}</h3>${list(after)}<h3 class="feed-group">${esc(monthName(month))}</h3>`;
  }
  html += inMonth.length ? list(inMonth) : `<p class="empty">Nothing logged for ${esc(monthName(month))}.</p>`;
  el.innerHTML = html;
}

function renderStartingActivity() {
  // Before the first full month, show everything so far.
  $('activity-title').textContent = 'What we\'ve done so far';
  const el = $('activity-body');
  if (!state.activity.length) {
    el.innerHTML = '<p class="empty">Your first updates will show up here as we make them.</p>';
    return;
  }
  el.innerHTML = `<ul class="feed">${state.activity.map((a) => `
    <li>
      <span class="feed-icon" aria-hidden="true">${icons[a.type] || icons.note}</span>
      <div>
        <p class="feed-title">${esc(a.title)}</p>
        ${a.detail ? `<p class="muted">${esc(a.detail)}</p>` : ''}
        <p class="small muted"><time datetime="${esc(a.date)}">${esc(shortDate(a.date))}</time></p>
      </div>
    </li>`).join('')}</ul>`;
}

function renderSearches(terms, periodText) {
  const el = $('searches-body');
  const list = Array.isArray(terms) ? terms.filter((t) => t && typeof t.term === 'string') : [];
  if (!list.length) {
    el.innerHTML = '<p class="empty">Google hasn\'t reported search terms for this month yet.</p>';
    return;
  }
  const sorted = [...list].sort((a, b) =>
    (a.is_threshold === b.is_threshold ? 0 : a.is_threshold ? 1 : -1)
    || (Number(b.impressions) || 0) - (Number(a.impressions) || 0));
  el.innerHTML = `
    <p class="card-sub">Searches where your business showed up on Google ${esc(periodText)}.</p>
    <ul class="rows">${sorted.slice(0, 10).map((t) => `
      <li><span>${esc(t.term)}</span>
        <span class="num muted nowrap">${t.is_threshold
          ? `fewer than ${fmtNum(Number(t.impressions) || 15)} views`
          : isNum(Number(t.impressions)) ? plural(Number(t.impressions), 'view') : DASH}</span></li>`).join('')}
    </ul>
    <p class="small muted">Google only gives a range for small numbers, so we show "fewer than 15" instead of guessing.</p>`;
}

function renderReports() {
  const el = $('reports-body');
  if (!state.reports.length) {
    el.innerHTML = '<p class="empty">Your monthly report will appear here.</p>';
    return;
  }
  el.innerHTML = `<ul class="rows">${state.reports.map((r) => `
    <li><span>${esc(monthLabel(r.month))} report</span>
      <button type="button" class="btn btn-outline" data-path="${esc(r.storage_path || '')}" ${r.storage_path ? '' : 'disabled'}>Download</button></li>`).join('')}
    </ul><p class="form-msg small" id="reports-msg" role="status"></p>`;
  el.querySelectorAll('button[data-path]').forEach((btn) => btn.addEventListener('click', async () => {
    btn.disabled = true;
    const { data, error } = await supabase.storage.from('reports').createSignedUrl(btn.dataset.path, 60);
    btn.disabled = false;
    if (error || !data?.signedUrl) {
      $('reports-msg').textContent = 'That report could not be opened. Please try again, or call us.';
      $('reports-msg').className = 'form-msg small error';
      return;
    }
    location.assign(data.signedUrl);
  }));
}

function renderMonth(month) {
  renderScorecard(month);
  renderSince(month);
  renderTrend(month);
  renderReviews(month);
  renderActivity(month);
  renderSearches(state.byMonth.get(month).top_search_terms, `in ${monthLabel(month)}`);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  const main = $('main');
  try {
    const ctx = await startPortal();
    if (!ctx) return;
    state.client = ctx.client;
    $('biz-name').textContent = ctx.client.business_name;
    document.title = `${ctx.client.business_name} — Results | Mission Found`;

    Object.assign(state, await loadData(ctx.clientId));
    state.byMonth = new Map(state.metrics.map((r) => [r.month, r]));
    const firstManaged = `${ctx.client.start_date.slice(0, 7)}-01`;
    state.months = state.metrics.map((r) => r.month).filter((m) => m >= firstManaged).reverse();

    renderHealth();
    renderReports();

    if (!state.months.length) {
      renderStartingPoint();
      $('since').hidden = true;
      $('trend').hidden = true;
      renderReviews(monthKey(new Date()));
      renderStartingActivity();
      renderSearches(state.baseline?.top_search_terms, 'before we started');
    } else {
      const select = $('month');
      select.innerHTML = state.months.map((m) => `<option value="${m}">${esc(monthLabel(m))}</option>`).join('');
      $('month-field').hidden = false;
      select.addEventListener('change', () => renderMonth(select.value));
      renderMonth(state.months[0]);
    }

    $('trend-toggle').addEventListener('click', (e) => {
      const showTable = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(showTable));
      e.currentTarget.textContent = showTable ? 'Show as chart' : 'Show as table';
      $('trend-table').classList.toggle('visually-hidden', !showTable);
      $('trend-chart').hidden = showTable;
    });
    main.removeAttribute('aria-busy');
  } catch {
    main.removeAttribute('aria-busy');
    renderError($('results'), 'We couldn\'t load your results just now. Check your connection and try again.', () => location.reload());
  }
}

boot();
