-- Job Trail: schema, enums, indexes, triggers, functions.
-- Run in order: 001 -> 002 -> 003 (Supabase SQL editor or `supabase db push`).
create extension if not exists pgcrypto;

create type application_status as enum ('saved','applied','screening','interview','offer','rejected');
create type reminder_type      as enum ('follow_up','interview','deadline','custom');
create type interview_type     as enum ('phone','video','technical','hr','final','other');
create type interview_status   as enum ('scheduled','completed','cancelled');
create type work_mode          as enum ('remote','hybrid','onsite');

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, professional_title text, location text,
  experience_level text, primary_field text,
  desired_role text, preferred_location text, work_mode work_mode,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- resumes (metadata only; files live in Storage) ----------
create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  original_filename text, storage_path text, file_type text, file_size integer,
  parsed_text text,
  parsed_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text, company text, source_url text, raw_text text not null,
  location text, salary text,
  text_hash text not null,
  extracted_skills   jsonb not null default '[]'::jsonb,
  extracted_keywords jsonb not null default '[]'::jsonb,
  analysis jsonb,                       -- validated AI extraction (null until analyzed)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  job_description_id uuid references public.job_descriptions(id) on delete set null,
  parent_version_id uuid references public.resume_versions(id) on delete set null,
  version_name text not null,
  content text not null,
  changes jsonb not null default '[]'::jsonb,   -- [{original_text, suggested_text, reason}]
  file_path text,
  ats_score numeric(5,2) check (ats_score between 0 and 100),
  target_company text, target_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_name text not null, company_logo_url text,
  job_title text not null, job_url text, location text, salary text,
  work_mode work_mode,
  status application_status not null default 'saved',
  application_date date,
  job_description_id uuid references public.job_descriptions(id) on delete set null,
  resume_id uuid references public.resumes(id) on delete set null,
  resume_version_id uuid references public.resume_versions(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  old_status application_status, new_status application_status,
  description text,
  created_at timestamptz not null default now()
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  interview_type interview_type not null default 'other',
  scheduled_at timestamptz not null,
  duration integer check (duration is null or duration > 0),   -- minutes
  meeting_url text, location text, notes text,
  status interview_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  type reminder_type not null default 'custom',
  title text not null, description text,
  due_at timestamptz not null,
  completed boolean not null default false, completed_at timestamptz,
  snoozed_until timestamptz,
  effective_due_at timestamptz generated always as (coalesce(snoozed_until, due_at)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  resume_version_id uuid references public.resume_versions(id) on delete set null,
  job_description_id uuid not null references public.job_descriptions(id) on delete cascade,
  ats_score numeric(5,2) not null check (ats_score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  matched_skills jsonb not null default '[]'::jsonb, missing_skills jsonb not null default '[]'::jsonb,
  matched_keywords jsonb not null default '[]'::jsonb, missing_keywords jsonb not null default '[]'::jsonb,
  experience_match jsonb, education_match jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  bullet_suggestions jsonb not null default '[]'::jsonb,
  raw_ai_response jsonb,               -- schema-validated model output, never raw text
  input_hash text not null,            -- sha256(resume text + JD text): cache key
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null, entity_type text, entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Extra tables backing the assistant's conversation_id
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New conversation',
  resume_id uuid references public.resumes(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  job_description_id uuid references public.job_descriptions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------- indexes ----------
create index on public.resumes (user_id, created_at desc);
create index on public.resume_versions (user_id);
create index on public.resume_versions (resume_id);
create index on public.job_descriptions (user_id);
create index on public.job_descriptions (user_id, text_hash);
create index on public.applications (user_id);
create index on public.applications (user_id, status);
create index on public.applications (user_id, application_date);
create index on public.application_events (application_id, created_at);
create index on public.interviews (user_id, scheduled_at);
create index on public.interviews (application_id);
create index on public.reminders (user_id, due_at);
create index on public.reminders (user_id, completed, effective_due_at);
create index on public.ai_analyses (user_id);
create index on public.ai_analyses (user_id, resume_id, job_description_id, input_hash);
create index on public.activity_logs (user_id, created_at desc);
create index on public.chat_messages (conversation_id, created_at);
create index on public.chat_conversations (user_id, updated_at desc);

-- ---------- updated_at triggers ----------
do $$ declare t text; begin
  foreach t in array array['profiles','resumes','job_descriptions','resume_versions','applications',
                           'interviews','reminders','chat_conversations'] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop; end $$;

-- ---------- ownership integrity ----------
-- RLS stops users reading other people's rows, but a foreign key alone would still let
-- user A point a row at user B's UUID. This trigger rejects any reference whose parent
-- belongs to someone else. TG_ARGV entries look like 'column:parent_table'.
create or replace function public.enforce_same_owner() returns trigger language plpgsql as $$
declare a text; col text; tbl text; ref uuid; owner uuid;
begin
  foreach a in array tg_argv loop
    col := split_part(a, ':', 1); tbl := split_part(a, ':', 2);
    ref := nullif(to_jsonb(new)->>col, '')::uuid;
    if ref is not null then
      execute format('select user_id from public.%I where id = $1', tbl) into owner using ref;
      if owner is distinct from new.user_id then
        raise exception 'INVALID_REFERENCE: % does not belong to the current user', col using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end $$;

create trigger own_refs before insert or update on public.resume_versions for each row execute function
  public.enforce_same_owner('resume_id:resumes','job_description_id:job_descriptions','parent_version_id:resume_versions');
create trigger own_refs before insert or update on public.applications for each row execute function
  public.enforce_same_owner('resume_id:resumes','resume_version_id:resume_versions','job_description_id:job_descriptions');
create trigger own_refs before insert or update on public.application_events for each row execute function public.enforce_same_owner('application_id:applications');
create trigger own_refs before insert or update on public.interviews for each row execute function public.enforce_same_owner('application_id:applications');
create trigger own_refs before insert or update on public.reminders for each row execute function public.enforce_same_owner('application_id:applications');
create trigger own_refs before insert or update on public.ai_analyses for each row execute function
  public.enforce_same_owner('resume_id:resumes','resume_version_id:resume_versions','job_description_id:job_descriptions');
create trigger own_refs before insert or update on public.chat_conversations for each row execute function
  public.enforce_same_owner('resume_id:resumes','application_id:applications','job_description_id:job_descriptions');
create trigger own_refs before insert or update on public.chat_messages for each row execute function public.enforce_same_owner('conversation_id:chat_conversations');

-- ---------- application audit trail (single source of truth) ----------
-- Whatever path changes a status (PUT, PATCH, RPC, SQL), an event + activity log are written
-- in the same transaction. Nothing can move a card without leaving a timeline entry.
create or replace function public.applications_before_write() returns trigger language plpgsql as $$
begin
  if new.status = 'applied' and new.application_date is null then new.application_date := current_date; end if;
  return new;
end $$;
create trigger before_write before insert or update of status on public.applications
  for each row execute function public.applications_before_write();

create or replace function public.audit_application() returns trigger language plpgsql as $$
declare note text := nullif(current_setting('app.status_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into application_events (application_id, user_id, event_type, new_status, description)
      values (new.id, new.user_id, 'created', new.status, 'Application created');
    insert into activity_logs (user_id, activity_type, entity_type, entity_id, metadata)
      values (new.user_id, 'application_created', 'application', new.id,
              jsonb_build_object('company', new.company_name, 'status', new.status));
  elsif new.status is distinct from old.status then
    insert into application_events (application_id, user_id, event_type, old_status, new_status, description)
      values (new.id, new.user_id, 'status_changed', old.status, new.status,
              coalesce(note, format('Moved from %s to %s', old.status, new.status)));
    insert into activity_logs (user_id, activity_type, entity_type, entity_id, metadata)
      values (new.user_id, 'application_status_changed', 'application', new.id,
              jsonb_build_object('company', new.company_name, 'from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger audit after insert or update of status on public.applications
  for each row execute function public.audit_application();

-- ---------- RPC: status change (atomic) ----------
create or replace function public.change_application_status(p_id uuid, p_status application_status, p_note text default null)
returns public.applications language plpgsql security invoker set search_path = public as $$
declare r public.applications;
begin
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.applications set status = p_status where id = p_id and user_id = auth.uid() returning * into r;
  if not found then raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002'; end if;
  return r;
end $$;

-- ---------- RPC: analytics (aggregated in the database) ----------
-- p_days NULL = all time. Returns counts; the API derives rates with safe division.
--   submitted  = status <> 'saved'
--   responded  = submitted and status in (screening, interview, offer, rejected)
--   interviewed / offered = reached that stage at any point (current status or event history)
create or replace function public.analytics_overview(p_days integer default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with base as (
    select a.id, a.status, a.job_title, a.company_name,
           coalesce(a.application_date, a.created_at::date) as d,
           (a.status in ('interview','offer') or exists (select 1 from application_events e
              where e.application_id = a.id and e.new_status = 'interview')) as interviewed,
           (a.status = 'offer' or exists (select 1 from application_events e
              where e.application_id = a.id and e.new_status = 'offer')) as offered
    from applications a
    where a.user_id = auth.uid()
      and (p_days is null or coalesce(a.application_date, a.created_at::date) >= current_date - p_days)
  ), sub as (select * from base where status <> 'saved')
  select jsonb_build_object(
    'totalApplications',  (select count(*) from base),
    'submitted',          (select count(*) from sub),
    'activeApplications', (select count(*) from base where status in ('applied','screening','interview')),
    'responded',          (select count(*) from sub where status in ('screening','interview','offer','rejected')),
    'interviews',         (select count(*) from sub where interviewed),
    'offers',             (select count(*) from sub where offered),
    'rejections',         (select count(*) from base where status = 'rejected'),
    'applicationsOverTime', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'count', c) order by d)
                              from (select d, count(*) c from base group by d) t), '[]'::jsonb),
    'applicationsByStatus', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'count', c))
                              from (select status, count(*) c from base group by status) t), '[]'::jsonb),
    'applicationsByRole',   coalesce((select jsonb_agg(jsonb_build_object('role', job_title, 'count', c) order by c desc)
                              from (select job_title, count(*) c from base group by job_title order by c desc limit 10) t), '[]'::jsonb),
    'applicationsByCompany',coalesce((select jsonb_agg(jsonb_build_object('company', company_name, 'count', c) order by c desc)
                              from (select company_name, count(*) c from base group by company_name order by c desc limit 10) t), '[]'::jsonb)
  );
$$;

revoke all on function public.change_application_status(uuid, application_status, text) from public, anon;
revoke all on function public.analytics_overview(integer) from public, anon;
grant execute on function public.change_application_status(uuid, application_status, text) to authenticated;
grant execute on function public.analytics_overview(integer) to authenticated;
