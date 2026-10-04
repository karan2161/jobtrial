-- Row Level Security. On every user-owned table a user only sees/changes their own rows.
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Full CRUD on own rows
do $$ declare t text; begin
  foreach t in array array['resumes','job_descriptions','resume_versions','applications','interviews',
                           'reminders','ai_analyses','chat_conversations','chat_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_rows on public.%I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop; end $$;

-- Append-only audit tables: read + insert, never update/delete by users
do $$ declare t text; begin
  foreach t in array array['application_events','activity_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_select on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
  end loop; end $$;
