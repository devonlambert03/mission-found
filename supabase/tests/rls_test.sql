-- RLS tests for the client portal. Run with `supabase test db` (pgTAP).
-- Everything happens inside one transaction that is rolled back, and all
-- fixtures use their own ids, so it's safe to run against a seeded database.
--
-- Pattern: statements under test run as `authenticated` with a JWT `sub`
-- claim (exactly how PostgREST runs API requests). Their outcomes are written
-- to a scratch table, then asserted as postgres — pgTAP's own bookkeeping
-- tables belong to postgres, so assertions can't run as `authenticated`.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). A and B are two clients; M is an admin.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'rls-a@example.com', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'rls-b@example.com', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'rls-admin@example.com', 'authenticated', 'authenticated');

insert into public.clients (id, business_name, start_date, status) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'RLS Client A', '2026-01-15', 'active'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'RLS Client B', '2026-02-10', 'active');

insert into public.profiles (user_id, client_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a', 'client'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-0000-4000-8000-00000000000b', 'client'),
  ('33333333-3333-4333-8333-333333333333', null, 'admin');

-- Same fixture set for both clients.
do $$
declare
  c uuid;
begin
  foreach c in array array['aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b']::uuid[] loop
    insert into public.baseline_snapshots (client_id, calls) values (c, 5);
    insert into public.baseline_audit_notes (client_id, notes) values (c, 'internal only');
    insert into public.monthly_metrics (client_id, month, calls, search_impressions_mobile, search_impressions_desktop,
                                        maps_impressions_mobile, maps_impressions_desktop, website_clicks,
                                        direction_requests, bookings)
      values (c, '2026-03-01', 10, 1, 1, 1, 1, 1, 1, 1);
    insert into public.reviews_snapshot (client_id, month, total_reviews) values (c, '2026-03-01', 20);
    insert into public.completeness_checklist (client_id, item, status) values
      (c, 'categories', 'done'), (c, 'photos', 'in_progress');
    insert into public.activity_log (client_id, type, title, visible_to_client) values
      (c, 'post', 'visible post', true),
      (c, 'note', 'hidden note', false);
    insert into public.reports (client_id, month, status, storage_path) values
      (c, '2026-02-01', 'final', c || '/2026-02.pdf'),
      (c, '2026-03-01', 'draft', c || '/2026-03.pdf');
    insert into public.client_uploads (client_id, storage_path, content_type, size_bytes) values
      (c, c || '/seed.jpg', 'image/jpeg', 1000);
    insert into public.upload_tokens (client_id, token_hash) values (c, encode(sha256(c::text::bytea), 'hex'));
    insert into public.client_requests (client_id, type, message) values (c, 'question', 'fixture');
    insert into storage.objects (bucket_id, name) values
      ('client-uploads', c || '/seed.jpg'),
      ('reports', c || '/2026-02.pdf'),
      ('reports', c || '/2026-03.pdf');
  end loop;
end $$;

create temp table outcome (k text primary key, v text);
grant all on outcome to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Act as client A.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- Reads: anything belonging to B, or to anyone but A, must be invisible.
insert into outcome select 'clients_not_a',        count(*)::text from public.clients where id <> 'aaaaaaaa-0000-4000-8000-00000000000a';
insert into outcome select 'clients_a',            count(*)::text from public.clients where id = 'aaaaaaaa-0000-4000-8000-00000000000a';
insert into outcome select 'profiles_not_mine',    count(*)::text from public.profiles where user_id <> '11111111-1111-4111-8111-111111111111';
insert into outcome select 'baseline_b',           count(*)::text from public.baseline_snapshots where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
insert into outcome select 'baseline_derived_b',   count(*)::text from public.baseline_snapshots_derived where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
insert into outcome select 'metrics_b',            count(*)::text from public.monthly_metrics where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
insert into outcome select 'metrics_derived_b',    count(*)::text from public.monthly_metrics_derived where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
insert into outcome select 'metrics_derived_a_total', (select total_actions::text from public.monthly_metrics_derived where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a');
insert into outcome select 'reviews_b',            count(*)::text from public.reviews_snapshot where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
insert into outcome select 'checklist_b',          count(*)::text from public.completeness_checklist where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
insert into outcome select 'activity_b',           count(*)::text from public.activity_log where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
insert into outcome select 'activity_a_hidden',    count(*)::text from public.activity_log where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and not visible_to_client;
insert into outcome select 'activity_a_visible',   count(*)::text from public.activity_log where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a';
insert into outcome select 'reports_b',            count(*)::text from public.reports where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
insert into outcome select 'reports_a_draft',      count(*)::text from public.reports where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and status = 'draft';
insert into outcome select 'reports_a_final',      count(*)::text from public.reports where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and status = 'final';
insert into outcome select 'uploads_b',            count(*)::text from public.client_uploads where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
insert into outcome select 'requests_b',           count(*)::text from public.client_requests where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
insert into outcome select 'audit_notes_any',      count(*)::text from public.baseline_audit_notes;
insert into outcome select 'upload_tokens_any',    count(*)::text from public.upload_tokens;
insert into outcome select 'upload_link_files_any', count(*)::text from public.upload_link_files;
insert into outcome select 'score_a',              public.completeness_score('aaaaaaaa-0000-4000-8000-00000000000a')::text;
insert into outcome select 'score_b_as_a',         public.completeness_score('bbbbbbbb-0000-4000-8000-00000000000b')::text;
insert into outcome select 'is_admin_a',           public.is_admin()::text;
insert into outcome select 'my_client_id_a',       public.my_client_id()::text;

-- Storage reads.
insert into outcome select 'obj_uploads_b', count(*)::text from storage.objects
  where bucket_id = 'client-uploads' and name like 'bbbbbbbb-0000-4000-8000-00000000000b/%';
insert into outcome select 'obj_uploads_a', count(*)::text from storage.objects
  where bucket_id = 'client-uploads' and name like 'aaaaaaaa-0000-4000-8000-00000000000a/%';
insert into outcome select 'obj_reports_b', count(*)::text from storage.objects
  where bucket_id = 'reports' and name like 'bbbbbbbb-0000-4000-8000-00000000000b/%';
insert into outcome select 'obj_reports_a_final', count(*)::text from storage.objects
  where bucket_id = 'reports' and name = 'aaaaaaaa-0000-4000-8000-00000000000a/2026-02.pdf';
insert into outcome select 'obj_reports_a_draft', count(*)::text from storage.objects
  where bucket_id = 'reports' and name = 'aaaaaaaa-0000-4000-8000-00000000000a/2026-03.pdf';

-- Writes. Each attempt records 'allowed' or 'denied'.
create function pg_temp.try(k text, stmt text) returns void language plpgsql as $$
begin
  execute stmt;
  insert into outcome values (k, 'allowed');
exception when others then
  insert into outcome values (k, 'denied');
end $$;

select pg_temp.try('ins_request_for_b',
  $q$insert into public.client_requests (client_id, type, message) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'question', 'x')$q$);
select pg_temp.try('ins_upload_for_b',
  $q$insert into public.client_uploads (client_id, storage_path, content_type, size_bytes) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-00000000000b/x.jpg', 'image/jpeg', 10)$q$);
select pg_temp.try('ins_upload_own_into_b_folder',
  $q$insert into public.client_uploads (client_id, storage_path, content_type, size_bytes) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b/x.jpg', 'image/jpeg', 10)$q$);
select pg_temp.try('ins_request_own_forced',
  $q$insert into public.client_requests (id, client_id, type, message, status) values ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'question', 'hello', 'done')$q$);
select pg_temp.try('ins_upload_own_forced',
  $q$insert into public.client_uploads (id, client_id, storage_path, content_type, size_bytes, status, source) values ('cccccccc-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a/new.jpg', 'image/jpeg', 10, 'used', 'upload_link')$q$);
select pg_temp.try('ins_activity_own',
  $q$insert into public.activity_log (client_id, type, title, visible_to_client) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'post', 'fake', true)$q$);
select pg_temp.try('ins_metrics_own',
  $q$insert into public.monthly_metrics (client_id, month, calls) values ('aaaaaaaa-0000-4000-8000-00000000000a', '2026-04-01', 999)$q$);
select pg_temp.try('ins_reviews_own',
  $q$insert into public.reviews_snapshot (client_id, month, total_reviews) values ('aaaaaaaa-0000-4000-8000-00000000000a', '2026-04-01', 999)$q$);
select pg_temp.try('ins_checklist_own',
  $q$insert into public.completeness_checklist (client_id, item, status) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'hours', 'done')$q$);
select pg_temp.try('ins_report_own',
  $q$insert into public.reports (client_id, month, status) values ('aaaaaaaa-0000-4000-8000-00000000000a', '2026-04-01', 'final')$q$);
select pg_temp.try('ins_audit_note_own',
  $q$insert into public.baseline_audit_notes (client_id, notes) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x')$q$);
select pg_temp.try('ins_upload_token_own',
  $q$insert into public.upload_tokens (client_id, token_hash) values ('aaaaaaaa-0000-4000-8000-00000000000a', repeat('a', 64))$q$);
select pg_temp.try('ins_client',
  $q$insert into public.clients (business_name, start_date) values ('Sneaky', '2026-01-01')$q$);
select pg_temp.try('ins_profile_admin',
  $q$insert into public.profiles (user_id, role) values ('22222222-2222-4222-8222-222222222222', 'admin')$q$);
select pg_temp.try('ins_obj_b_folder',
  $q$insert into storage.objects (bucket_id, name) values ('client-uploads', 'bbbbbbbb-0000-4000-8000-00000000000b/evil.jpg')$q$);
select pg_temp.try('ins_obj_own_folder',
  $q$insert into storage.objects (bucket_id, name) values ('client-uploads', 'aaaaaaaa-0000-4000-8000-00000000000a/ok.jpg')$q$);
select pg_temp.try('ins_obj_reports_own',
  $q$insert into storage.objects (bucket_id, name) values ('reports', 'aaaaaaaa-0000-4000-8000-00000000000a/fake.pdf')$q$);
select pg_temp.try('rpc_rotate_token',
  $q$select public.rotate_upload_token('aaaaaaaa-0000-4000-8000-00000000000a', repeat('b', 64))$q$);

-- Updates and deletes silently match zero rows (no policy); verified below as postgres.
select pg_temp.try('upd_request_status', $q$update public.client_requests set status = 'done' where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a'$q$);
select pg_temp.try('upd_upload_status',  $q$update public.client_uploads set status = 'used' where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a'$q$);
select pg_temp.try('upd_profile_role',   $q$update public.profiles set role = 'admin' where user_id = '11111111-1111-4111-8111-111111111111'$q$);
select pg_temp.try('upd_profile_client', $q$update public.profiles set client_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where user_id = '11111111-1111-4111-8111-111111111111'$q$);
select pg_temp.try('upd_client_name',    $q$update public.clients set business_name = 'Hacked' where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$q$);
select pg_temp.try('upd_metrics',        $q$update public.monthly_metrics set calls = 999$q$);
select pg_temp.try('upd_activity_vis',   $q$update public.activity_log set visible_to_client = true$q$);
select pg_temp.try('upd_report_final',   $q$update public.reports set status = 'final'$q$);
select pg_temp.try('del_requests',       $q$delete from public.client_requests$q$);
select pg_temp.try('del_uploads',        $q$delete from public.client_uploads$q$);
select pg_temp.try('del_activity',       $q$delete from public.activity_log$q$);
select pg_temp.try('del_metrics',        $q$delete from public.monthly_metrics$q$);
select pg_temp.try('del_clients',        $q$delete from public.clients$q$);
select pg_temp.try('del_profiles',       $q$delete from public.profiles$q$);
select pg_temp.try('del_objects_own',    $q$delete from storage.objects where name like 'aaaaaaaa-0000-4000-8000-00000000000a/%'$q$);
select pg_temp.try('upd_objects_own',    $q$update storage.objects set name = name || '.x' where name like 'aaaaaaaa-0000-4000-8000-00000000000a/%'$q$);

-- ---------------------------------------------------------------------------
-- Act as the admin.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

insert into outcome select 'admin_clients',     count(*)::text from public.clients where id in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b');
insert into outcome select 'admin_hidden_act',  count(*)::text from public.activity_log where not visible_to_client and title = 'hidden note';
insert into outcome select 'admin_drafts',      count(*)::text from public.reports where status = 'draft' and client_id in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b');
insert into outcome select 'admin_audit_notes', count(*)::text from public.baseline_audit_notes where notes = 'internal only';
insert into outcome select 'admin_tokens',      count(*)::text from public.upload_tokens where client_id in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b');
insert into outcome select 'admin_objects',     count(*)::text from storage.objects where name like 'aaaaaaaa-0000-4000-8000-00000000000a/%' or name like 'bbbbbbbb-0000-4000-8000-00000000000b/%';
select pg_temp.try('admin_ins_metrics', $q$insert into public.monthly_metrics (client_id, month, calls) values ('bbbbbbbb-0000-4000-8000-00000000000b', '2026-04-01', 12)$q$);
select pg_temp.try('admin_upd_request', $q$update public.client_requests set status = 'in_progress' where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$q$);
select pg_temp.try('admin_del_activity', $q$delete from public.activity_log where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and title = 'hidden note'$q$);
select pg_temp.try('admin_ins_obj', $q$insert into storage.objects (bucket_id, name) values ('reports', 'bbbbbbbb-0000-4000-8000-00000000000b/admin.pdf')$q$);

-- ---------------------------------------------------------------------------
-- Act as an anonymous (signed-out) visitor.
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.try('anon_read_clients',  $q$select 1 from public.clients$q$);
select pg_temp.try('anon_read_metrics',  $q$select count(*) from public.monthly_metrics_derived$q$);
select pg_temp.try('anon_ins_request',   $q$insert into public.client_requests (client_id, type, message) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'question', 'x')$q$);
insert into outcome select 'anon_objects', count(*)::text from storage.objects where name like 'aaaaaaaa-0000-4000-8000-00000000000a/%';

reset role;

-- ---------------------------------------------------------------------------
-- Assertions (as postgres).
-- ---------------------------------------------------------------------------
create function pg_temp.o(key text) returns text language sql as $$ select v from outcome where k = key $$;

-- Client A cannot read client B's rows in any table.
select is(pg_temp.o('clients_not_a'),       '0', 'A sees no other clients');
select is(pg_temp.o('clients_a'),           '1', 'A sees own client row');
select is(pg_temp.o('profiles_not_mine'),   '0', 'A sees only own profile');
select is(pg_temp.o('baseline_b'),          '0', 'A cannot read B baseline');
select is(pg_temp.o('baseline_derived_b'),  '0', 'A cannot read B baseline via derived view');
select is(pg_temp.o('metrics_b'),           '0', 'A cannot read B monthly_metrics');
select is(pg_temp.o('metrics_derived_b'),   '0', 'A cannot read B metrics via derived view');
select is(pg_temp.o('metrics_derived_a_total'), '13', 'derived total_actions = calls + directions + website clicks + bookings');
select is(pg_temp.o('reviews_b'),           '0', 'A cannot read B reviews');
select is(pg_temp.o('checklist_b'),         '0', 'A cannot read B checklist');
select is(pg_temp.o('activity_b'),          '0', 'A cannot read B activity');
select is(pg_temp.o('reports_b'),           '0', 'A cannot read B reports');
select is(pg_temp.o('uploads_b'),           '0', 'A cannot read B uploads');
select is(pg_temp.o('requests_b'),          '0', 'A cannot read B requests');

-- Hidden/draft/internal data stays hidden.
select is(pg_temp.o('activity_a_hidden'),   '0', 'A cannot read own hidden activity');
select is(pg_temp.o('activity_a_visible'),  '1', 'A reads own visible activity');
select is(pg_temp.o('reports_a_draft'),     '0', 'A cannot read own draft report');
select is(pg_temp.o('reports_a_final'),     '1', 'A reads own final report');
select is(pg_temp.o('audit_notes_any'),     '0', 'A cannot read any baseline_audit_notes');
select is(pg_temp.o('upload_tokens_any'),   '0', 'A cannot read any upload_tokens');
select is(pg_temp.o('upload_link_files_any'), '0', 'A cannot read upload_link_files');
select is(pg_temp.o('score_a'),             '23', 'completeness score: categories done (15) + photos in progress (7.5) = 23');
select is(pg_temp.o('score_b_as_a'),        '0', 'completeness_score leaks nothing about B to A');
select is(pg_temp.o('is_admin_a'),          'false', 'A is not admin');
select is(pg_temp.o('my_client_id_a'),      'aaaaaaaa-0000-4000-8000-00000000000a', 'my_client_id() resolves A');

-- Storage.
select is(pg_temp.o('obj_uploads_b'),       '0', 'A cannot read B upload objects');
select is(pg_temp.o('obj_uploads_a'),       '1', 'A reads own upload objects');
select is(pg_temp.o('obj_reports_b'),       '0', 'A cannot read B report files');
select is(pg_temp.o('obj_reports_a_final'), '1', 'A reads own final report file');
select is(pg_temp.o('obj_reports_a_draft'), '0', 'A cannot read own draft report file');
select is(pg_temp.o('ins_obj_b_folder'),    'denied', 'A cannot upload into B folder');
select is(pg_temp.o('ins_obj_own_folder'),  'allowed', 'A can upload into own folder');
select is(pg_temp.o('ins_obj_reports_own'), 'denied', 'A cannot write to reports bucket');

-- Inserts.
select is(pg_temp.o('ins_request_for_b'),   'denied', 'A cannot insert a request for B');
select is(pg_temp.o('ins_upload_for_b'),    'denied', 'A cannot insert an upload row for B');
select is(pg_temp.o('ins_upload_own_into_b_folder'), 'denied', 'A cannot point an upload row at B folder');
select is(pg_temp.o('ins_request_own_forced'), 'allowed', 'A can insert own request');
select is((select status::text from public.client_requests where id = 'cccccccc-0000-4000-8000-000000000001'),
          'received', 'client-supplied request status is forced to received');
select is((select created_by from public.client_requests where id = 'cccccccc-0000-4000-8000-000000000001'),
          '11111111-1111-4111-8111-111111111111'::uuid, 'request created_by forced to caller');
select is(pg_temp.o('ins_upload_own_forced'), 'allowed', 'A can insert own upload row');
select is((select status::text || '/' || source::text from public.client_uploads where id = 'cccccccc-0000-4000-8000-000000000002'),
          'new/portal', 'client-supplied upload status/source are forced to new/portal');
select is(pg_temp.o('ins_activity_own'),    'denied', 'A cannot insert activity');
select is(pg_temp.o('ins_metrics_own'),     'denied', 'A cannot insert metrics');
select is(pg_temp.o('ins_reviews_own'),     'denied', 'A cannot insert reviews');
select is(pg_temp.o('ins_checklist_own'),   'denied', 'A cannot insert checklist items');
select is(pg_temp.o('ins_report_own'),      'denied', 'A cannot insert reports');
select is(pg_temp.o('ins_audit_note_own'),  'denied', 'A cannot insert audit notes');
select is(pg_temp.o('ins_upload_token_own'), 'denied', 'A cannot insert upload tokens');
select is(pg_temp.o('ins_client'),          'denied', 'A cannot insert clients');
select is(pg_temp.o('ins_profile_admin'),   'denied', 'A cannot create an admin profile');
select is(pg_temp.o('rpc_rotate_token'),    'denied', 'A cannot call service-role-only functions');

-- Updates and deletes changed nothing.
select is((select count(*)::int from public.client_requests where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and status <> 'received'), 0, 'A could not change request status');
select is((select count(*)::int from public.client_uploads where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and status <> 'new'), 0, 'A could not change upload status');
select is((select role::text || '/' || client_id::text from public.profiles where user_id = '11111111-1111-4111-8111-111111111111'),
          'client/aaaaaaaa-0000-4000-8000-00000000000a', 'A could not change own role or client_id');
select is((select business_name from public.clients where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 'RLS Client A', 'A could not rename own business');
select is((select count(*)::int from public.monthly_metrics where calls = 999), 0, 'A could not update metrics');
select is((select count(*)::int from public.activity_log where title = 'hidden note' and visible_to_client), 0, 'A could not unhide activity');
select is((select count(*)::int from public.reports where month = '2026-03-01' and status = 'final' and client_id in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b')), 0, 'A could not finalise a draft report');
select is((select count(*)::int from public.client_requests where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 2, 'A could not delete requests');
select is((select count(*)::int from public.client_uploads where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 2, 'A could not delete uploads');
select is((select count(*)::int from public.activity_log where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 2, 'A could not delete activity');
select is((select count(*)::int from public.monthly_metrics where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 1, 'A could not delete metrics');
select is((select count(*)::int from public.clients where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 1, 'A could not delete own client row');
select is((select count(*)::int from public.profiles where user_id = '11111111-1111-4111-8111-111111111111'), 1, 'A could not delete own profile');
select is((select count(*)::int from storage.objects where name in ('aaaaaaaa-0000-4000-8000-00000000000a/seed.jpg', 'aaaaaaaa-0000-4000-8000-00000000000a/ok.jpg')), 2, 'A could not delete or rename own storage objects');

-- Admin can read and write everything.
select is(pg_temp.o('admin_clients'),     '2', 'admin reads all clients');
select is(pg_temp.o('admin_hidden_act'),  '2', 'admin reads hidden activity');
select is(pg_temp.o('admin_drafts'),      '2', 'admin reads draft reports');
select is(pg_temp.o('admin_audit_notes'), '2', 'admin reads audit notes');
select is(pg_temp.o('admin_tokens'),      '2', 'admin reads upload tokens');
select is(pg_temp.o('admin_objects'),     '7', 'admin reads all storage objects');
select is(pg_temp.o('admin_ins_metrics'), 'allowed', 'admin inserts metrics');
select is(pg_temp.o('admin_upd_request'), 'allowed', 'admin updates requests');
select is((select count(*)::int from public.client_requests where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and status = 'in_progress'), 1, 'admin request update applied');
select is(pg_temp.o('admin_del_activity'), 'allowed', 'admin deletes activity');
select is((select count(*)::int from public.activity_log where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 1, 'admin delete applied');
select is(pg_temp.o('admin_ins_obj'),     'allowed', 'admin writes storage objects');

-- Signed-out visitors get nothing.
select is(pg_temp.o('anon_read_clients'), 'denied', 'anon cannot read clients');
select is(pg_temp.o('anon_read_metrics'), 'denied', 'anon cannot read metrics');
select is(pg_temp.o('anon_ins_request'),  'denied', 'anon cannot insert requests');
select is(pg_temp.o('anon_objects'),      '0', 'anon cannot read storage objects');

-- monthly_metrics write precedence.
update public.monthly_metrics set locked = true where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a';
insert into public.monthly_metrics (client_id, month, calls, source) values ('aaaaaaaa-0000-4000-8000-00000000000a', '2026-03-01', 77, 'api')
  on conflict (client_id, month) do update set calls = excluded.calls, source = excluded.source;
select is((select calls from public.monthly_metrics where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 10, 'locked row ignores api upsert');
insert into public.monthly_metrics (client_id, month, calls, source) values ('aaaaaaaa-0000-4000-8000-00000000000a', '2026-03-01', 11, 'manual')
  on conflict (client_id, month) do update set calls = excluded.calls, source = excluded.source;
select is((select calls from public.monthly_metrics where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 11, 'locked row still accepts a manual correction');
insert into public.monthly_metrics (client_id, month, calls, source) values ('bbbbbbbb-0000-4000-8000-00000000000b', '2026-03-01', 55, 'api')
  on conflict (client_id, month) do update set calls = excluded.calls, source = excluded.source;
select is((select calls from public.monthly_metrics where client_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and month = '2026-03-01'), 55, 'api upsert overwrites an unlocked manual row');
select throws_ok($q$insert into public.monthly_metrics (client_id, month) values ('aaaaaaaa-0000-4000-8000-00000000000a', '2026-05-15')$q$,
                 '23514', null, 'month must be the first of the month');

-- Baseline default period = last full calendar month before start_date (2026-01-15).
select is((select period_start::text || '..' || period_end::text from public.baseline_snapshots where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
          '2025-12-01..2025-12-31', 'default baseline is the last full month before start_date');

-- One active upload token per client.
select throws_ok($q$insert into public.upload_tokens (client_id, token_hash) values ('aaaaaaaa-0000-4000-8000-00000000000a', repeat('c', 64))$q$,
                 '23505', null, 'only one active upload token per client');
select lives_ok($q$select public.rotate_upload_token('aaaaaaaa-0000-4000-8000-00000000000a', repeat('d', 64))$q$, 'rotate revokes the old token and adds a new one');
select is((select count(*)::int from public.upload_tokens where client_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and revoked_at is null), 1, 'still exactly one active token after rotate');

select * from finish();
rollback;
