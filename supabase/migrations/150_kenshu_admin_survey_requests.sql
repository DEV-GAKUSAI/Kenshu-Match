-- 150_kenshu_admin_survey_requests.sql
--
-- 研修アンケート管理 (admin): the admin page could not read training_requests
-- (row level security), so the list of requests to import onto was empty and
-- surveys showed an id instead of the title. This adds one admin-only function
-- that returns just what the page needs: request id, title, status and date of
-- accepted / completed requests. Additive, safe to run more than once.

create or replace function public.admin_survey_requests()
returns table (request_id uuid, title text, status text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select private.current_user_role()), '') <> 'ADMIN' then raise exception 'admin_only'; end if;
  return query
    select r.request_id, r.title, r.status::text, r.created_at
      from public.training_requests r
     where r.status in ('accepted', 'completed')
     order by r.created_at desc
     limit 500;
end;
$$;

revoke all on function public.admin_survey_requests() from public, anon;
grant execute on function public.admin_survey_requests() to authenticated;
