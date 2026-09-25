-- =============================================================================
-- Mission Found client portal — Phase 1 schema
--
-- Security model in one paragraph:
--   * RLS is on for every table. Policies are written per command, per role.
--   * Two SECURITY DEFINER helpers (is_admin, my_client_id) read `profiles`
--     without going through RLS. Policies call these instead of sub-selecting
--     `profiles` directly, which avoids the classic "policy on profiles that
--     queries profiles" infinite-recursion bug.
--   * Clients can only SELECT rows for their own client_id, and can only
--     INSERT into client_uploads and client_requests. They never UPDATE or
--     DELETE anything. Triggers force status/created_by on client inserts so
--     a client can't pick their own status.
--   * Admin (profiles.role = 'admin') gets full access.
--   * The service role (used only in /api serverless functions) bypasses RLS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.client_status        as enum ('onboarding', 'active', 'paused', 'cancelled');
create type public.user_role            as enum ('client', 'admin');
create type public.baseline_period_type as enum ('single_month', 'three_month_avg');
create type public.metric_source        as enum ('manual', 'csv', 'api');
create type public.checklist_item       as enum (
  'categories', 'services', 'description', 'hours', 'special_hours', 'photos',
  'logo_cover', 'products', 'attributes', 'service_areas', 'q_and_a',
  'booking_website_links'
);
create type public.checklist_status     as enum ('todo', 'in_progress', 'done');
create type public.activity_type        as enum (
  'post', 'photo', 'review_reply', 'profile_update', 'q_and_a', 'fix', 'note', 'request_done'
);
create type public.report_status        as enum ('draft', 'final');
create type public.upload_source        as enum ('portal', 'upload_link');
create type public.upload_status        as enum ('new', 'used', 'not_used');
create type public.request_type         as enum ('hours_change', 'services_change', 'photos_or_info', 'question', 'other');
create type public.request_status       as enum ('received', 'in_progress', 'done');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  business_name    text not null check (char_length(business_name) between 1 and 200),
  trade            text,
  city             text,
  owner_name       text,
  email            text,
  phone            text,
  gbp_location_id  text,            -- "locations/123..." once Google access is granted
  start_date       date not null,
  status           public.client_status not null default 'onboarding',
  plan             text not null default 'standard',
  founding_client  boolean not null default false,
  created_at       timestamptz not null default now()
);

create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- Deleting a client also removes their users' portal access.
  client_id  uuid references public.clients (id) on delete cascade,
  role       public.user_role not null default 'client',
  created_at timestamptz not null default now(),
  constraint client_role_needs_client check (role <> 'client' or client_id is not null)
);
create index profiles_client_id_idx on public.profiles (client_id);

-- Metric columns are shared by baseline_snapshots and monthly_metrics so the
-- two compare directly. All values are MONTHLY totals.
-- messages:    Google discontinued GBP chat/messaging in 2024. Historical only.
-- photo_views: not exposed by the current Business Profile Performance API.
-- Both are nullable and excluded from every derived total.
create table public.baseline_snapshots (
  id                          uuid primary key default gen_random_uuid(),
  client_id                   uuid not null unique references public.clients (id) on delete cascade,
  period_type                 public.baseline_period_type not null default 'single_month',
  period_start                date not null,
  period_end                  date not null,
  search_impressions_mobile   integer check (search_impressions_mobile >= 0),
  search_impressions_desktop  integer check (search_impressions_desktop >= 0),
  maps_impressions_mobile     integer check (maps_impressions_mobile >= 0),
  maps_impressions_desktop    integer check (maps_impressions_desktop >= 0),
  calls                       integer check (calls >= 0),
  website_clicks              integer check (website_clicks >= 0),
  direction_requests          integer check (direction_requests >= 0),
  bookings                    integer check (bookings >= 0),
  messages                    integer check (messages >= 0),
  photo_views                 integer check (photo_views >= 0),
  top_search_terms            jsonb not null default '[]'::jsonb check (jsonb_typeof(top_search_terms) = 'array'),
  profile_completeness_score  integer check (profile_completeness_score between 0 and 100),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint baseline_period_order check (period_end >= period_start)
);

-- Admin-only notes from the onboarding audit. No client policy exists.
create table public.baseline_audit_notes (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete cascade,
  notes      text not null,
  created_at timestamptz not null default now()
);
create index baseline_audit_notes_client_idx on public.baseline_audit_notes (client_id);

-- Write rules (enforced by trg_monthly_metrics_write below):
--   * Every writer (manual table edits, Phase 2 CSV import, GBP sync) upserts
--     on (client_id, month).
--   * source='api' overwrites rows that came from csv or manual entry.
--   * locked = true freezes a row against csv/api writes. A manual edit by an
--     admin still applies, so a human can always correct a number.
create table public.monthly_metrics (
  id                          uuid primary key default gen_random_uuid(),
  client_id                   uuid not null references public.clients (id) on delete cascade,
  month                       date not null check (month = date_trunc('month', month)::date),
  source                      public.metric_source not null default 'manual',
  locked                      boolean not null default false,
  search_impressions_mobile   integer check (search_impressions_mobile >= 0),
  search_impressions_desktop  integer check (search_impressions_desktop >= 0),
  maps_impressions_mobile     integer check (maps_impressions_mobile >= 0),
  maps_impressions_desktop    integer check (maps_impressions_desktop >= 0),
  calls                       integer check (calls >= 0),
  website_clicks              integer check (website_clicks >= 0),
  direction_requests          integer check (direction_requests >= 0),
  bookings                    integer check (bookings >= 0),
  messages                    integer check (messages >= 0),
  photo_views                 integer check (photo_views >= 0),
  -- [{ "term": "plumber near me", "impressions": 120, "is_threshold": false },
  --  { "term": "water heater repair", "impressions": 15, "is_threshold": true }]
  -- is_threshold = true means Google only said "<15"; impressions holds 15.
  top_search_terms            jsonb not null default '[]'::jsonb check (jsonb_typeof(top_search_terms) = 'array'),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (client_id, month)
);

create table public.reviews_snapshot (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients (id) on delete cascade,
  month               date not null check (month = date_trunc('month', month)::date),
  total_reviews       integer check (total_reviews >= 0),
  average_rating      numeric(2,1) check (average_rating between 0 and 5),
  new_reviews         integer check (new_reviews >= 0),
  reviews_responded   integer check (reviews_responded >= 0),
  avg_response_hours  numeric(6,1) check (avg_response_hours >= 0),
  updated_at          timestamptz not null default now(),
  unique (client_id, month)
);

create table public.completeness_checklist (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  item         public.checklist_item not null,
  status       public.checklist_status not null default 'todo',
  detail       text,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (client_id, item)
);

create table public.activity_log (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete cascade,
  date              date not null default current_date,
  type              public.activity_type not null,
  title             text not null check (char_length(title) between 1 and 200),
  detail            text,
  visible_to_client boolean not null default false,
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index activity_log_client_date_idx on public.activity_log (client_id, date desc);

-- Populated in Phase 3. Files live in the private `reports` bucket.
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  month        date not null check (month = date_trunc('month', month)::date),
  generated_at timestamptz not null default now(),
  summary_text text,
  storage_path text check (storage_path is null or storage_path like client_id::text || '/%'),
  status       public.report_status not null default 'draft',
  unique (client_id, month)
);

create table public.client_uploads (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete cascade,
  storage_path      text not null unique,
  original_filename text check (char_length(original_filename) <= 255),
  content_type      text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  size_bytes        bigint not null check (size_bytes > 0 and size_bytes <= 15728640),  -- 15 MB
  caption           text check (char_length(caption) <= 200),
  source            public.upload_source not null default 'portal',
  status            public.upload_status not null default 'new',
  uploaded_at       timestamptz not null default now(),
  -- A row can only ever point into its own client's folder.
  constraint upload_path_in_client_folder check (storage_path like client_id::text || '/%')
);
create index client_uploads_client_idx on public.client_uploads (client_id, uploaded_at desc);

-- Per-client secret photo links. Only a SHA-256 hash of the token is stored;
-- the raw token exists once, in the /api/upload-link/create response.
create table public.upload_tokens (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
-- At most one active (un-revoked) token per client.
create unique index upload_tokens_one_active_per_client
  on public.upload_tokens (client_id) where revoked_at is null;

-- Server-side bookkeeping for upload-link uploads: one row per signed upload
-- URL. /api/upload-link/complete only records files that were signed here for
-- the same token, and the rows double as the per-token daily rate limit.
-- Service role only — no client or admin UI reads this.
create table public.upload_link_files (
  id                uuid primary key default gen_random_uuid(),
  token_id          uuid not null references public.upload_tokens (id) on delete cascade,
  client_id         uuid not null references public.clients (id) on delete cascade,
  storage_path      text not null unique,
  original_filename text,
  content_type      text not null,
  size_bytes        bigint not null,
  caption           text,
  signed_at         timestamptz not null default now(),
  completed_at      timestamptz
);
create index upload_link_files_token_day_idx on public.upload_link_files (token_id, signed_at);

create table public.client_requests (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  type        public.request_type not null,
  message     text not null check (char_length(btrim(message)) between 1 and 2000),
  status      public.request_status not null default 'received',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  -- Set by /api/request-notify so a request only ever emails Devon once.
  notified_at timestamptz
);
create index client_requests_client_idx on public.client_requests (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions used by policies
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER + empty search_path: runs as the table owner (bypassing
-- RLS on profiles) and can't be hijacked by objects in the caller's schemas.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.my_client_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.client_id from public.profiles p
  where p.user_id = auth.uid() and p.role = 'client';
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.my_client_id() from public;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.my_client_id() to authenticated, service_role;

-- True when the current statement comes from a signed-in non-admin user.
-- current_user is the API role (anon/authenticated/service_role) because this
-- is SECURITY INVOKER; table-editor and migration sessions run as postgres.
create or replace function public.is_client_caller()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('authenticated', 'anon') and not public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- Profile completeness score (0–100) — the ONE place this is computed.
-- Weights (sum = 100). A "done" item earns its full weight, "in_progress"
-- earns half, "todo" or a missing checklist row earns nothing.
--   categories 15   photos 15          services 10   description 10
--   hours 10        service_areas 10   special_hours 5   logo_cover 5
--   products 5      attributes 5       q_and_a 5     booking_website_links 5
-- SECURITY INVOKER: a client calling it only sees their own checklist rows,
-- so asking for another client's score returns 0, not their data.
-- ---------------------------------------------------------------------------
create or replace function public.completeness_score(p_client_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with weights(item, weight) as (
    values
      ('categories'::public.checklist_item, 15), ('photos', 15),
      ('services', 10), ('description', 10), ('hours', 10), ('service_areas', 10),
      ('special_hours', 5), ('logo_cover', 5), ('products', 5), ('attributes', 5),
      ('q_and_a', 5), ('booking_website_links', 5)
  )
  select coalesce(round(sum(
           case c.status when 'done' then w.weight
                         when 'in_progress' then w.weight / 2.0
                         else 0 end
         ))::integer, 0)
  from weights w
  left join public.completeness_checklist c
    on c.item = w.item and c.client_id = p_client_id;
$$;
grant execute on function public.completeness_score(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Derived metrics — the ONE place totals are defined.
--   total_views   = search + maps impressions, mobile + desktop
--   total_actions = calls + direction requests + website clicks + bookings
-- messages and photo_views are deliberately excluded (see table comment).
-- NULL in any component makes the total NULL, so the UI shows "—" instead of
-- a misleadingly low number.
-- security_invoker = true: the view runs with the caller's RLS.
-- ---------------------------------------------------------------------------
create view public.monthly_metrics_derived
with (security_invoker = true) as
select
  m.*,
  m.search_impressions_mobile + m.search_impressions_desktop
    + m.maps_impressions_mobile + m.maps_impressions_desktop   as total_views,
  m.calls + m.direction_requests + m.website_clicks + m.bookings as total_actions
from public.monthly_metrics m;

create view public.baseline_snapshots_derived
with (security_invoker = true) as
select
  b.*,
  b.search_impressions_mobile + b.search_impressions_desktop
    + b.maps_impressions_mobile + b.maps_impressions_desktop   as total_views,
  b.calls + b.direction_requests + b.website_clicks + b.bookings as total_actions
from public.baseline_snapshots b;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_baseline_touch   before update on public.baseline_snapshots     for each row execute function public.touch_updated_at();
create trigger trg_reviews_touch    before update on public.reviews_snapshot       for each row execute function public.touch_updated_at();
create trigger trg_checklist_touch  before update on public.completeness_checklist for each row execute function public.touch_updated_at();
create trigger trg_requests_touch   before update on public.client_requests        for each row execute function public.touch_updated_at();

-- monthly_metrics write precedence (see table comment). Returning NULL from a
-- BEFORE UPDATE trigger skips that row, so an upsert against a locked row is
-- a silent no-op for automated writers rather than an error that would abort
-- a whole CSV import or sync run.
create or replace function public.monthly_metrics_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.locked and new.source in ('csv', 'api') then
    return null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_monthly_metrics_write before update on public.monthly_metrics
  for each row execute function public.monthly_metrics_write();

-- Default baseline period = the last full calendar month before start_date
-- (or the three full months before it for a three_month_avg baseline).
create or replace function public.baseline_default_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_start date;
begin
  if new.period_start is null or new.period_end is null then
    select c.start_date into v_start from public.clients c where c.id = new.client_id;
    new.period_end := (date_trunc('month', v_start) - interval '1 day')::date;
    new.period_start := case new.period_type
      when 'three_month_avg' then (date_trunc('month', v_start) - interval '3 months')::date
      else (date_trunc('month', v_start) - interval '1 month')::date
    end;
  end if;
  return new;
end;
$$;
create trigger trg_baseline_default_period before insert on public.baseline_snapshots
  for each row execute function public.baseline_default_period();

-- Client inserts: force status and ownership fields. RLS WITH CHECK runs after
-- BEFORE triggers, so the policies below double-check the forced values.
create or replace function public.client_requests_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_client_caller() then
    new.status      := 'received';
    new.created_by  := auth.uid();
    new.created_at  := now();
    new.updated_at  := now();
    new.notified_at := null;
  end if;
  new.message := btrim(new.message);
  return new;
end;
$$;
create trigger trg_client_requests_before_insert before insert on public.client_requests
  for each row execute function public.client_requests_before_insert();

create or replace function public.client_uploads_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_client_caller() then
    new.status      := 'new';
    new.source      := 'portal';
    new.uploaded_at := now();
  end if;
  return new;
end;
$$;
create trigger trg_client_uploads_before_insert before insert on public.client_uploads
  for each row execute function public.client_uploads_before_insert();

-- ---------------------------------------------------------------------------
-- Service-role-only functions used by /api (atomic multi-step operations)
-- ---------------------------------------------------------------------------
-- Revoke any active token for the client and store the new hash, atomically.
create or replace function public.rotate_upload_token(p_client_id uuid, p_token_hash text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.upload_tokens set revoked_at = now()
    where client_id = p_client_id and revoked_at is null;
  insert into public.upload_tokens (client_id, token_hash)
    values (p_client_id, p_token_hash)
    returning id into v_id;
  return v_id;
end;
$$;

-- Reserve signed-upload slots for a token, enforcing the daily file limit.
-- The advisory lock serialises concurrent requests for the same token so two
-- parallel calls can't both squeeze under the limit.
create or replace function public.reserve_upload_link_files(
  p_token_id uuid,
  p_client_id uuid,
  p_files jsonb,         -- [{storage_path, original_filename, content_type, size_bytes, caption}]
  p_daily_limit integer
)
returns integer          -- files still allowed today after this reservation
language plpgsql
set search_path = ''
as $$
declare
  v_used integer;
  v_new  integer := jsonb_array_length(p_files);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_token_id::text, 0));
  select count(*) into v_used from public.upload_link_files
    where token_id = p_token_id and signed_at > now() - interval '24 hours';
  if v_used + v_new > p_daily_limit then
    raise exception 'daily_limit_exceeded' using errcode = 'P0001';
  end if;
  insert into public.upload_link_files
    (token_id, client_id, storage_path, original_filename, content_type, size_bytes, caption)
  select p_token_id, p_client_id, f->>'storage_path', f->>'original_filename',
         f->>'content_type', (f->>'size_bytes')::bigint, nullif(f->>'caption', '')
  from jsonb_array_elements(p_files) f;
  return p_daily_limit - v_used - v_new;
end;
$$;

revoke all on function public.rotate_upload_token(uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_upload_link_files(uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.rotate_upload_token(uuid, text) to service_role;
grant execute on function public.reserve_upload_link_files(uuid, uuid, jsonb, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Privileges. Supabase grants table privileges to anon/authenticated by
-- default and relies on RLS; we additionally strip anon entirely (nothing in
-- the portal is readable without signing in) and TRUNCATE, which bypasses RLS.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.clients                enable row level security;
alter table public.profiles               enable row level security;
alter table public.baseline_snapshots     enable row level security;
alter table public.baseline_audit_notes   enable row level security;
alter table public.monthly_metrics        enable row level security;
alter table public.reviews_snapshot       enable row level security;
alter table public.completeness_checklist enable row level security;
alter table public.activity_log           enable row level security;
alter table public.reports                enable row level security;
alter table public.client_uploads         enable row level security;
alter table public.upload_tokens          enable row level security;
alter table public.upload_link_files      enable row level security;
alter table public.client_requests        enable row level security;

-- Admin: full access on every table (one explicit policy per table).
create policy admin_all on public.clients                for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.profiles               for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.baseline_snapshots     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.baseline_audit_notes   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.monthly_metrics        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.reviews_snapshot       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.completeness_checklist for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.activity_log           for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.reports                for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.client_uploads         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.upload_tokens          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.client_requests        for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- upload_link_files: no policies at all -> service role only.

-- Client: read own rows.
create policy client_select_own on public.clients
  for select to authenticated using (id = public.my_client_id());
create policy client_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());
create policy client_select_own on public.baseline_snapshots
  for select to authenticated using (client_id = public.my_client_id());
create policy client_select_own on public.monthly_metrics
  for select to authenticated using (client_id = public.my_client_id());
create policy client_select_own on public.reviews_snapshot
  for select to authenticated using (client_id = public.my_client_id());
create policy client_select_own on public.completeness_checklist
  for select to authenticated using (client_id = public.my_client_id());
create policy client_select_visible on public.activity_log
  for select to authenticated using (client_id = public.my_client_id() and visible_to_client);
create policy client_select_final on public.reports
  for select to authenticated using (client_id = public.my_client_id() and status = 'final');
create policy client_select_own on public.client_uploads
  for select to authenticated using (client_id = public.my_client_id());
create policy client_select_own on public.client_requests
  for select to authenticated using (client_id = public.my_client_id());
-- baseline_audit_notes, upload_tokens: no client policy -> invisible to clients.

-- Client: the only two inserts allowed.
create policy client_insert_own on public.client_uploads
  for insert to authenticated
  with check (
    client_id = public.my_client_id()
    and source = 'portal'
    and status = 'new'
    and storage_path like client_id::text || '/%'
  );
create policy client_insert_own on public.client_requests
  for insert to authenticated
  with check (
    client_id = public.my_client_id()
    and status = 'received'
    and created_by = auth.uid()
  );
-- No client UPDATE or DELETE policies anywhere.

-- ---------------------------------------------------------------------------
-- Storage buckets (private) and object policies
-- Limits live on the bucket (enforced by Supabase Storage) and are re-checked
-- in /api for upload-link uploads.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('client-uploads', 'client-uploads', false, 15728640,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('reports', 'reports', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Folder layout: {client_id}/{file}. storage.foldername(name)[1] is the client_id.
create policy "mf admin all client-uploads" on storage.objects
  for all to authenticated
  using (bucket_id = 'client-uploads' and public.is_admin())
  with check (bucket_id = 'client-uploads' and public.is_admin());

create policy "mf admin all reports" on storage.objects
  for all to authenticated
  using (bucket_id = 'reports' and public.is_admin())
  with check (bucket_id = 'reports' and public.is_admin());

create policy "mf client read own uploads" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'client-uploads'
    and (storage.foldername(name))[1] = public.my_client_id()::text
  );

create policy "mf client upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'client-uploads'
    and (storage.foldername(name))[1] = public.my_client_id()::text
  );

-- A client can download a report file only once its row is final.
create policy "mf client read own final reports" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = public.my_client_id()::text
    and exists (
      select 1 from public.reports r
      where r.storage_path = storage.objects.name
        and r.client_id = public.my_client_id()
        and r.status = 'final'
    )
  );
