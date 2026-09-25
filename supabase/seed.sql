-- =============================================================================
-- DEMO SEED DATA — FAKE BUSINESSES, FAKE PEOPLE, FAKE NUMBERS.
-- For local development and preview only. Never run against production
-- (it creates demo sign-in accounts). Every email is @example.com.
--
-- Idempotent: demo clients are deleted and rebuilt on every run. Dates are
-- relative to today so the demo always looks current.
--
--   admin@example.com              admin (DEMO)
--   demo-plumber@example.com       "Demo Plumbing Co." — 8 months in
--   demo-contractor@example.com    "Demo Builders LLC" — onboarded 2 weeks ago
--
-- Sign in locally with the OTP code shown in Mailpit (http://127.0.0.1:54324).
-- =============================================================================

-- Users (skip if they already exist).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()
from (values
  ('0d000000-0000-4000-8000-000000000001'::uuid, 'admin@example.com'),
  ('0d000000-0000-4000-8000-000000000002'::uuid, 'demo-plumber@example.com'),
  ('0d000000-0000-4000-8000-000000000003'::uuid, 'demo-contractor@example.com')
) as u(id, email)
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id, u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now()
from auth.users u
where u.id in ('0d000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000002',
               '0d000000-0000-4000-8000-000000000003')
on conflict do nothing;

-- Rebuild demo clients from scratch (child rows cascade).
delete from public.clients
where id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002');

do $$
declare
  plumber    constant uuid := 'c0000000-0000-4000-8000-000000000001';
  contractor constant uuid := 'c0000000-0000-4000-8000-000000000002';
  m0         constant date := date_trunc('month', current_date)::date;  -- this month
  p_start    constant date := (date_trunc('month', current_date) - interval '8 months')::date + 9;
  c_start    constant date := current_date - 14;
  i int;
  m date;
  f numeric;
  -- Plumber, months 1..8 since start. Month 5 is a dip (slow season + a
  -- week of Google listing trouble) so the chart isn't a too-perfect line.
  calls  int[] := array[14, 19, 24, 29, 22, 33, 38, 42];
  dirs   int[] := array[10, 13, 16, 19, 15, 22, 25, 27];
  web    int[] := array[16, 20, 25, 29, 24, 33, 36, 40];
  books  int[] := array[ 0,  1,  1,  2,  1,  3,  3,  4];
  views  numeric[] := array[1.10, 1.28, 1.45, 1.62, 1.38, 1.85, 2.05, 2.30];
  tot_rev int[] := array[25, 29, 33, 38, 40, 46, 53, 61];
  new_rev int[] := array[ 2,  4,  4,  5,  2,  6,  7,  8];
  rating  numeric[] := array[4.4, 4.5, 4.5, 4.6, 4.6, 4.7, 4.7, 4.8];
  resp_h  numeric[] := array[30, 20, 14, 9, 11, 7, 6, 5.5];
begin
  insert into public.clients (id, business_name, trade, city, owner_name, email, phone, start_date, status, plan, founding_client)
  values
    (plumber, 'Demo Plumbing Co.', 'Plumbing', 'Anytown, NH', 'Pat Example',
     'demo-plumber@example.com', '555-0100', p_start, 'active', 'standard', true),
    (contractor, 'Demo Builders LLC', 'General contractor', 'Sampleton, NH', 'Sam Placeholder',
     'demo-contractor@example.com', '555-0199', c_start, 'onboarding', 'standard', false);

  insert into public.profiles (user_id, client_id, role) values
    ('0d000000-0000-4000-8000-000000000001', null, 'admin'),
    ('0d000000-0000-4000-8000-000000000002', plumber, 'client'),
    ('0d000000-0000-4000-8000-000000000003', contractor, 'client')
  on conflict (user_id) do update set client_id = excluded.client_id, role = excluded.role;

  -- ----- Baselines (monthly figures; period defaults to last full month before start) -----
  insert into public.baseline_snapshots (client_id, period_type,
      search_impressions_mobile, search_impressions_desktop, maps_impressions_mobile, maps_impressions_desktop,
      calls, website_clicks, direction_requests, bookings, messages, photo_views,
      top_search_terms, profile_completeness_score)
  values
    (plumber, 'single_month', 620, 180, 540, 110, 11, 14, 9, 0, null, null,
     '[{"term":"plumber anytown","impressions":140,"is_threshold":false},
       {"term":"demo plumbing","impressions":60,"is_threshold":false},
       {"term":"plumber near me","impressions":15,"is_threshold":true}]', 45),
    (contractor, 'single_month', 210, 90, 150, 40, 3, 6, 2, 0, null, null,
     '[{"term":"demo builders","impressions":35,"is_threshold":false},
       {"term":"contractor sampleton","impressions":15,"is_threshold":true}]', 30);

  insert into public.baseline_audit_notes (client_id, notes) values
    (plumber, 'DEMO: wrong Saturday hours, 3 duplicate categories, no service areas, 4 unanswered reviews.'),
    (contractor, 'DEMO: listing unverified until last week; no photos; description is one line.');

  -- ----- Plumber monthly metrics: 8 managed months -----
  for i in 1..8 loop
    m := (date_trunc('month', p_start) + (i - 1) * interval '1 month')::date;
    f := views[i];
    insert into public.monthly_metrics (client_id, month, source,
        search_impressions_mobile, search_impressions_desktop, maps_impressions_mobile, maps_impressions_desktop,
        calls, website_clicks, direction_requests, bookings, messages, photo_views, top_search_terms)
    values (plumber, m, 'manual',
        round(620 * f), round(180 * f), round(540 * f * 1.1), round(110 * f),
        calls[i], web[i], dirs[i], books[i], null, null,
        jsonb_build_array(
          jsonb_build_object('term', 'plumber near me',          'impressions', round(120 * f), 'is_threshold', false),
          jsonb_build_object('term', 'plumber anytown',          'impressions', round(95 * f),  'is_threshold', false),
          jsonb_build_object('term', 'emergency plumber',        'impressions', round(40 * f),  'is_threshold', false),
          jsonb_build_object('term', 'water heater repair',      'impressions', round(22 * f),  'is_threshold', false),
          jsonb_build_object('term', 'drain cleaning anytown',   'impressions', 15,             'is_threshold', true),
          jsonb_build_object('term', 'sump pump installation',   'impressions', 15,             'is_threshold', true)
        ));

    insert into public.reviews_snapshot (client_id, month, total_reviews, average_rating, new_reviews, reviews_responded, avg_response_hours)
    values (plumber, m, tot_rev[i], rating[i], new_rev[i], new_rev[i] - case when i = 1 then 1 else 0 end, resp_h[i]);
  end loop;

  -- Same months last year (backfilled from the owner's Google export), so the
  -- seasonality line has something to compare against.
  for i in 12..14 loop
    m := (m0 - i * interval '1 month')::date;
    insert into public.monthly_metrics (client_id, month, source,
        search_impressions_mobile, search_impressions_desktop, maps_impressions_mobile, maps_impressions_desktop,
        calls, website_clicks, direction_requests, bookings)
    values (plumber, m, 'csv', 600, 170, 520, 100,
            case i when 12 then 15 when 13 then 18 else 16 end, 13, 9, 0);
  end loop;

  -- ----- Checklists -----
  insert into public.completeness_checklist (client_id, item, status, detail, completed_at)
  select plumber, item::public.checklist_item, status::public.checklist_status, detail,
         case when status = 'done' then p_start + 20 end
  from (values
    ('categories', 'done', 'Primary: Plumber. Added: Water heater installation service, Drainage service.'),
    ('services', 'done', '14 services listed with short descriptions.'),
    ('description', 'done', 'Rewritten to mention emergency service and towns served.'),
    ('hours', 'done', 'Fixed Saturday hours.'),
    ('special_hours', 'done', 'Holiday hours set through New Year.'),
    ('photos', 'done', '40+ job photos, 2–4 new each month.'),
    ('logo_cover', 'done', null),
    ('products', 'in_progress', 'Adding water heater models you install.'),
    ('attributes', 'done', 'Veteran-owned, online estimates, onsite services.'),
    ('service_areas', 'done', '9 towns listed.'),
    ('q_and_a', 'todo', 'Waiting on your answers to 3 common questions.'),
    ('booking_website_links', 'done', 'Website and quote-request links checked.')
  ) as t(item, status, detail);

  insert into public.completeness_checklist (client_id, item, status, detail)
  select contractor, item::public.checklist_item, status::public.checklist_status, detail
  from (values
    ('categories', 'done', 'Primary: General contractor.'),
    ('hours', 'in_progress', 'Confirming winter hours with you.'),
    ('services', 'todo', null), ('description', 'todo', null), ('special_hours', 'todo', null),
    ('photos', 'todo', 'Send us job photos any time.'), ('logo_cover', 'todo', null),
    ('products', 'todo', null), ('attributes', 'todo', null), ('service_areas', 'todo', null),
    ('q_and_a', 'todo', null), ('booking_website_links', 'todo', null)
  ) as t(item, status, detail);

  -- ----- Activity: 25 plumber entries (5 hidden), 3 contractor entries -----
  insert into public.activity_log (id, client_id, date, type, title, detail, visible_to_client, created_by)
  select md5('demo-plumber-activity-' || n)::uuid, plumber, least(p_start + d, current_date - 1),
         type::public.activity_type, title, detail, visible, '0d000000-0000-4000-8000-000000000001'
  from (values
    ( 1,   1, 'fix',            'Fixed your Saturday hours',              'Google showed you closed Saturdays. Now it shows 8am–2pm.', true),
    ( 2,   2, 'profile_update',  'Cleaned up your categories',            'Removed 3 duplicates and added "Water heater installation service".', true),
    ( 3,   3, 'note',           'Onboarding call notes',                  'Owner prefers texts before 7am. Wants more drain work.', false),
    ( 4,   5, 'review_reply',   'Replied to 4 older reviews',             'Every review now has a reply from you.', true),
    ( 5,  10, 'post',           'Posted: Winter pipe tips',               'Short post with a photo from your van.', true),
    ( 6,  16, 'photo',          'Added 6 job photos',                     'Water heater swap and a bathroom rough-in.', true),
    ( 7,  24, 'profile_update',  'Listed the 9 towns you serve',          null, true),
    ( 8,  33, 'post',           'Posted: Emergency service, 7 days',     null, true),
    ( 9,  40, 'review_reply',   'Replied to 5 new reviews',               null, true),
    (10,  47, 'note',           'Competitor check',                       'Two competitors added "24/7" to names. Watching.', false),
    (11,  55, 'q_and_a',        'Answered 2 customer questions',          'Do you do free estimates? Do you service Sampleton?', true),
    (12,  64, 'post',           'Posted: Water heater swap before/after', null, true),
    (13,  72, 'photo',          'Added 4 job photos you sent',            null, true),
    (14,  80, 'fix',            'Got a fake listing removed',             'A spam listing was using your phone number. Google took it down.', true),
    (15,  88, 'note',           'Slow month — Google listing issue',      'Listing was suspended 5 days after a Google glitch. Reinstated.', false),
    (16,  95, 'fix',            'Got your listing back online',           'Google paused it for a few days by mistake. It''s back and verified.', true),
    (17, 180, 'post',           'Posted: Sump pump season',               null, true),
    (18, 196, 'review_reply',   'Replied to 6 new reviews',               null, true),
    (19, 205, 'profile_update',  'Added holiday hours',                   null, true),
    (20, 212, 'post',           'Posted: Drain cleaning special',        null, true),
    (21, 220, 'photo',          'Added 3 job photos you sent',            null, true),
    (22, 226, 'request_done',   'Updated your services list',             'Added tankless water heaters, like you asked.', true),
    (23, 231, 'note',           'Ask about Q&A answers',                  null, false),
    (24, 238, 'post',           'Posted: Frozen pipe checklist',          null, true),
    (25, 245, 'review_reply',   'Replied to 8 new reviews',               'Average reply time this month: about 5 hours.', false)
  ) as t(n, d, type, title, detail, visible);

  insert into public.activity_log (id, client_id, date, type, title, detail, visible_to_client, created_by)
  select md5('demo-contractor-activity-' || n)::uuid, contractor, least(c_start + d, current_date),
         type::public.activity_type, title, detail, true, '0d000000-0000-4000-8000-000000000001'
  from (values
    (1, 0, 'note',           'Welcome aboard',                  'We finished your starting audit. Here''s where you stand.'),
    (2, 3, 'fix',            'Verified your Google listing',    'Your listing now shows on Google Maps.'),
    (3, 8, 'profile_update', 'Set your main category',          'You now show up as a General contractor.')
  ) as t(n, d, type, title, detail);

  -- ----- Plumber requests (one of each status) -----
  insert into public.client_requests (id, client_id, type, message, status, created_at, updated_at, created_by, notified_at)
  values
    (md5('demo-req-1')::uuid, plumber, 'services_change', 'We started doing tankless water heaters. Can you add that?',
     'done', now() - interval '40 days', now() - interval '38 days', '0d000000-0000-4000-8000-000000000002', now() - interval '40 days'),
    (md5('demo-req-2')::uuid, plumber, 'hours_change', 'Closed the Friday after Thanksgiving.',
     'in_progress', now() - interval '3 days', now() - interval '2 days', '0d000000-0000-4000-8000-000000000002', now() - interval '3 days'),
    (md5('demo-req-3')::uuid, plumber, 'question', 'Is it worth getting more reviews from commercial customers?',
     'received', now() - interval '5 hours', now() - interval '5 hours', '0d000000-0000-4000-8000-000000000002', now() - interval '5 hours');

  -- ----- Plumber uploads. Files are placeholders in supabase/seed-assets/ -----
  insert into public.client_uploads (id, client_id, storage_path, original_filename, content_type, size_bytes, caption, source, status, uploaded_at)
  select ('e0000000-0000-4000-8000-00000000000' || n)::uuid, plumber,
         plumber || '/e0000000-0000-4000-8000-00000000000' || n || '.jpg',
         'IMG_' || (4100 + n) || '.jpg', 'image/jpeg', 11300, caption,  -- ~size of the placeholder files
         source::public.upload_source, status::public.upload_status, now() - (days || ' days')::interval
  from (values
    (1, 'Water heater swap, Main St', 'upload_link', 'used', 60),
    (2, null, 'upload_link', 'used', 58),
    (3, 'Bathroom rough-in', 'portal', 'not_used', 30),
    (4, 'Frozen pipe fix', 'upload_link', 'new', 4),
    (5, null, 'upload_link', 'new', 4),
    (6, 'New sump pump', 'portal', 'new', 1)
  ) as t(n, caption, source, status, days);
end $$;
