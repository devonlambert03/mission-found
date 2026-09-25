// POST /api/sync-gbp — ADMIN ONLY. STUB: returns 501 until Google API access
// is approved. No Google calls are made.
//
// Adapter interface the real implementation will provide:
//
//   fetchMonthlyMetrics(locationId, month) -> MonthlyMetricsRow
//     locationId: clients.gbp_location_id ("locations/1234567890")
//     month:      'YYYY-MM-01'
//     Calls Business Profile Performance API
//     locations.fetchMultiDailyMetricsTimeSeries for the month, sums the
//     daily values, and returns a monthly_metrics row (see METRIC_MAP).
//
//   fetchSearchKeywords(locationId, month) -> top_search_terms[]
//     Calls locations.searchkeywords.impressions.monthly. Google reports low
//     counts only as a threshold (e.g. "<15"); map those to
//     { term, impressions: 15, is_threshold: true } — never invent a number.
//
// Writing: upsert into monthly_metrics on (client_id, month) with
// source = 'api'. The table trigger makes api data overwrite csv/manual
// rows unless the row is locked, so this function doesn't need to check.
// messages and photo_views stay NULL (not available from this API).
//
// TODO: the Performance API returns roughly 18 months of history, so once
// access is approved, backfill baseline_snapshots (and same-month-last-year
// rows) from real Google data instead of the onboarding screenshots.

import { handler, sendJson } from './_lib/http.js';
import { requireAdmin } from './_lib/supabase.js';

// Performance API DailyMetric -> monthly_metrics column.
const METRIC_MAP = {
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'search_impressions_mobile',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'search_impressions_desktop',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'maps_impressions_mobile',
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'maps_impressions_desktop',
  CALL_CLICKS: 'calls',
  WEBSITE_CLICKS: 'website_clicks',
  BUSINESS_DIRECTION_REQUESTS: 'direction_requests',
  BUSINESS_BOOKINGS: 'bookings',
};

export default handler(['POST'], async (req, res) => {
  await requireAdmin(req);
  sendJson(res, 501, {
    error: 'not_implemented',
    message: 'Google Business Profile sync is not connected yet. Enter metrics in Supabase for now.',
    planned_metric_map: METRIC_MAP,
  });
});
