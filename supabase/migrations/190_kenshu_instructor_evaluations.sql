-- 190_kenshu_instructor_evaluations.sql
--
-- #55 (the senior's 10/23 note): the company evaluates each lecturer PER REQUEST after the training:
-- 専門性・教え方・準備・連絡・運営協力 (1–5 each), 再依頼意向 (yes / maybe / no), a comment, who evaluated and when.
--  * One evaluation per decided lecturer reply (response_id), so a request with several lecturers has one each.
--  * Private to the company that owns the request. Lecturers and other companies never see it.
--  * Only for a completed request, and only for the lecturer who was decided (or the one a direct request was sent to).
-- Additive, safe to run more than once.

create table if not exists public.request_instructor_evaluations (
  evaluation_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.training_requests(request_id) on delete cascade,
  response_id uuid not null references public.instructor_responses(response_id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  instructor_id uuid not null references public.users(id) on delete cascade,
  expertise smallint not null check (expertise between 1 and 5),
  teaching smallint not null check (teaching between 1 and 5),
  preparation smallint not null check (preparation between 1 and 5),
  communication smallint not null check (communication between 1 and 5),
  cooperation smallint not null check (cooperation between 1 and 5),
  reuse text not null check (reuse in ('yes', 'maybe', 'no')),
  comment text check (comment is null or char_length(comment) <= 1000),
  evaluator_name text not null check (char_length(btrim(evaluator_name)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_instructor_evaluations_one_per_reply unique (response_id)
);

create index if not exists request_instructor_evaluations_requester_idx
  on public.request_instructor_evaluations (requester_id, instructor_id);

alter table public.request_instructor_evaluations enable row level security;

drop policy if exists request_evaluations_owner_select on public.request_instructor_evaluations;
create policy request_evaluations_owner_select on public.request_instructor_evaluations
  for select to authenticated using (requester_id = (select auth.uid()));

drop policy if exists request_evaluations_owner_insert on public.request_instructor_evaluations;
create policy request_evaluations_owner_insert on public.request_instructor_evaluations
  for insert to authenticated with check (
    requester_id = (select auth.uid())
    and (select private.current_user_role()) in ('COMPANY', 'INDIVIDUAL')
  );

drop policy if exists request_evaluations_owner_update on public.request_instructor_evaluations;
create policy request_evaluations_owner_update on public.request_instructor_evaluations
  for update to authenticated using (requester_id = (select auth.uid())) with check (requester_id = (select auth.uid()));

revoke all on public.request_instructor_evaluations from anon;
grant select, insert, update on public.request_instructor_evaluations to authenticated;

-- The rules that RLS alone cannot say: the request is completed, the reply belongs to it, and that lecturer was decided.
create or replace function private.guard_instructor_evaluation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req_owner uuid;
  v_req_status text;
  v_req_target uuid;
  v_resp_request uuid;
  v_resp_instructor uuid;
  v_resp_selected boolean;
begin
  select requester_id, status, target_instructor_id into v_req_owner, v_req_status, v_req_target
    from public.training_requests where request_id = new.request_id;
  select request_id, instructor_id, is_selected into v_resp_request, v_resp_instructor, v_resp_selected
    from public.instructor_responses where response_id = new.response_id;

  if v_req_owner is null or v_resp_request is null then raise exception 'not_evaluable'; end if;
  if v_req_owner <> new.requester_id or v_resp_request <> new.request_id or v_resp_instructor <> new.instructor_id then
    raise exception 'not_evaluable';
  end if;
  if v_req_status <> 'completed' then raise exception 'not_completed'; end if;
  -- (a public request has no target, so compare with coalesce: NULL must count as "not the target")
  if not (v_resp_selected or coalesce(v_req_target = v_resp_instructor, false)) then raise exception 'not_decided'; end if;

  if tg_op = 'UPDATE' then
    if new.request_id <> old.request_id or new.response_id <> old.response_id
       or new.requester_id <> old.requester_id or new.instructor_id <> old.instructor_id then
      raise exception 'not_evaluable';
    end if;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists guard_instructor_evaluation on public.request_instructor_evaluations;
create trigger guard_instructor_evaluation
  before insert or update on public.request_instructor_evaluations
  for each row execute function private.guard_instructor_evaluation();
