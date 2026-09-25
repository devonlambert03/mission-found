// Formatting helpers. Rule for every function here: never produce "NaN",
// "Infinity", "undefined" or "null" — missing values render as "—".

export const DASH = '—';

const nf = new Intl.NumberFormat('en-US');

export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

export function fmtNum(v) {
  return isNum(v) ? nf.format(Math.round(v)) : DASH;
}

// "2026-03-01" -> Date at local midnight (avoids UTC off-by-one-day).
export function parseDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

export function monthLabel(iso, opts = { month: 'long', year: 'numeric' }) {
  return parseDate(iso).toLocaleDateString('en-US', opts);
}

export function monthName(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'long' });
}

export function shortDate(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function longDate(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function addMonths(iso, n) {
  const d = parseDate(iso);
  return monthKey(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

// Change from `before` to `now`.
// Returns { dir: 'up'|'down'|'flat'|null, text } where text is ready to show:
//   "+5 (+13%)", "−3 (−8%)", "No change", "from 0 to 12", or null if unknown.
export function delta(now, before) {
  if (!isNum(now) || !isNum(before)) return { dir: null, text: null };
  const diff = now - before;
  if (diff === 0) return { dir: 'flat', text: 'No change' };
  const dir = diff > 0 ? 'up' : 'down';
  if (before === 0) return { dir, text: `from 0 to ${fmtNum(now)}` };
  const pct = Math.round((diff / before) * 100);
  const sign = diff > 0 ? '+' : '−';
  return { dir, text: `${sign}${fmtNum(Math.abs(diff))} (${sign}${Math.abs(pct)}%)` };
}

export function arrowFor(dir) {
  return dir === 'up' ? '▲' : dir === 'down' ? '▼' : dir === 'flat' ? '■' : '';
}

// Headline percentage for "since we started", e.g. "+282%" or "from 0 to 12".
export function growthHeadline(now, before) {
  if (!isNum(now) || !isNum(before)) return DASH;
  if (before === 0) return now === 0 ? 'No change yet' : `from 0 to ${fmtNum(now)}`;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return 'About the same';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
}

// 6 -> "about 6 hours", 0.5 -> "under an hour", 50 -> "about 2 days".
export function friendlyHours(h) {
  if (!isNum(h)) return DASH;
  if (h < 1) return 'under an hour';
  if (h < 36) {
    const r = Math.round(h);
    return `about ${r} hour${r === 1 ? '' : 's'}`;
  }
  const days = Math.round(h / 24);
  return `about ${days} day${days === 1 ? '' : 's'}`;
}

export function plural(n, one, many = one + 's') {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}

// Escape user/admin-entered text before it goes into innerHTML templates.
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
