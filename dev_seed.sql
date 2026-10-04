-- DEVELOPMENT ONLY. Never run against production. Real users always start with clean data.
-- Usage (SQL editor, as postgres):  select public.dev_seed('<auth user uuid>');
create or replace function public.dev_seed(p_user uuid) returns void language plpgsql as $$
declare c record;
begin
  for c in select * from (values
    ('Google','Frontend Developer','saved'),('Microsoft','SDE Intern','offer'),
    ('Atlassian','React Engineer','applied'),('Razorpay','Frontend Developer','interview'),
    ('Zoho','Web Developer','screening'),('TCS','Associate Engineer','rejected'),
    ('Infosys','Systems Engineer','applied')) v(company, title, status)
  loop
    insert into public.applications (user_id, company_name, job_title, status, application_date)
    values (p_user, c.company, c.title, c.status::application_status,
            case when c.status = 'saved' then null else current_date - (random()*30)::int end);
  end loop;
end $$;
