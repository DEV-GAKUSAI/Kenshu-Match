-- 169: applicant selection stage (#48 in the senior's sheet): 応募 / 書類確認 / 面談 / 条件調整 / 決定 / 見送り,
-- managed separately from the request state (募集中 / 募集終了 ...).
-- 応募 (default), 面談 (from the interview step) and 決定 (is_selected) come from data the app already has.
-- The company sets the three manual stages here: 'screening' (書類確認), 'negotiation' (条件調整), 'passed' (見送り).
-- Only the company that owns the request can change it (the instructor cannot).
-- Additive, safe to run twice.

begin;

alter table public.instructor_responses
  add column if not exists stage text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'instructor_responses_stage_check') then
    alter table public.instructor_responses add constraint instructor_responses_stage_check
      check (stage is null or stage in ('screening', 'negotiation', 'passed'));
  end if;
end $$;

-- Changing the stage is only allowed through set_response_stage() below.
create or replace function public.guard_response_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stage is distinct from old.stage
     and coalesce(current_setting('kenshu.stage_rpc', true), '') <> 'on'
     and auth.uid() is not null then
    raise exception 'stage_locked';
  end if;
  return new;
end;
$$;
drop trigger if exists instructor_responses_guard_stage on public.instructor_responses;
create trigger instructor_responses_guard_stage before update of stage on public.instructor_responses
  for each row execute function public.guard_response_stage();

create or replace function public.set_response_stage(p_response_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp public.instructor_responses%rowtype;
  v_req public.training_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_stage is not null and p_stage not in ('screening', 'negotiation', 'passed') then raise exception 'bad_stage'; end if;
  select * into v_resp from public.instructor_responses where response_id = p_response_id for update;
  if not found then raise exception 'not_found'; end if;
  select * into v_req from public.training_requests where request_id = v_resp.request_id;
  if not found or v_req.requester_id <> auth.uid() then raise exception 'not_found'; end if;
  if v_resp.is_selected or v_resp.action not in ('accept', 'quote') then raise exception 'not_changeable'; end if;
  perform set_config('kenshu.stage_rpc', 'on', true);
  update public.instructor_responses set stage = p_stage where response_id = p_response_id;
end;
$$;

revoke all on function public.set_response_stage(uuid, text) from public, anon;
grant execute on function public.set_response_stage(uuid, text) to authenticated;

commit;
