-- 151_kenshu_admin_dashboard_stats.sql
--
-- 管理者ダッシュボード: one admin-only function that returns the summary numbers
-- shown on /admin (users by role, requests by status, survey answers, reports).
-- Read only, additive, safe to run more than once.

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select private.current_user_role()), '') <> 'ADMIN' then raise exception 'admin_only'; end if;
  return jsonb_build_object(
    'instructors', (select count(*) from public.users where role = 'INSTRUCTOR'),
    'companies',   (select count(*) from public.users where role in ('COMPANY', 'INDIVIDUAL')),
    'requests',    (select count(*) from public.training_requests),
    'requests_pending',   (select count(*) from public.training_requests where status = 'pending'),
    'requests_accepted',  (select count(*) from public.training_requests where status = 'accepted'),
    'requests_completed', (select count(*) from public.training_requests where status = 'completed'),
    'answers',     (select count(*) from public.training_survey_answers),
    'reported',    (select count(*) from public.training_survey_answers where reported_at is not null and not is_hidden)
  );
end;
$$;

revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;
