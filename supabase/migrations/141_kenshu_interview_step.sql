-- Interview step for 公募 requests, and the full name for the company.
--
-- 公募 request:  applicant (accept / quote)
--   -> company picks 「面談に進む」 (interview_status = requested)
--   -> the instructor releases the full name (released) or declines (declined)
--   -> only then the company can 確定 (is_selected). Email and phone stay hidden until 確定, as before.
-- Direct request (sent to one instructor): the full name is released when the
-- instructor accepts or sends a quote.
--
-- The full name is copied from users.name (the name Mine sent when the instructor
-- connected). The four new columns can be changed only by the functions below and
-- the trigger, never directly by a browser. Safe to run more than once.

alter table public.instructor_responses
  add column if not exists interview_status text,
  add column if not exists interview_requested_at timestamptz,
  add column if not exists released_name text,
  add column if not exists name_released_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'instructor_responses_interview_status_check') then
    alter table public.instructor_responses
      add constraint instructor_responses_interview_status_check
      check (interview_status is null or interview_status in ('requested', 'released', 'declined'));
  end if;
end $$;

-- Existing data: already chosen instructors count as released, and instructors
-- who answered a direct request show their name.
update public.instructor_responses r
   set interview_status = 'released',
       released_name = coalesce(r.released_name, u.name),
       name_released_at = coalesce(r.name_released_at, now())
  from public.users u
 where u.id = r.instructor_id and r.is_selected and r.interview_status is null;

update public.instructor_responses r
   set released_name = u.name, name_released_at = now()
  from public.users u, public.training_requests tr
 where u.id = r.instructor_id and tr.request_id = r.request_id
   and tr.target_instructor_id is not null
   and r.action in ('accept', 'quote') and r.released_name is null;

create or replace function public.instructor_responses_interview_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_system boolean := coalesce(current_setting('kenshu.interview_write', true), '') = '1';
begin
  if not v_system then
    if tg_op = 'INSERT' then
      if new.interview_status is not null or new.interview_requested_at is not null
         or new.released_name is not null or new.name_released_at is not null then
        raise exception 'interview columns are set by the system only' using errcode = '42501';
      end if;
    elsif new.interview_status is distinct from old.interview_status
       or new.interview_requested_at is distinct from old.interview_requested_at
       or new.released_name is distinct from old.released_name
       or new.name_released_at is distinct from old.name_released_at then
      raise exception 'interview columns are set by the system only' using errcode = '42501';
    end if;
  end if;

  select tr.target_instructor_id into v_target
    from public.training_requests tr where tr.request_id = new.request_id;

  -- Direct request: the name is released when the instructor accepts or quotes.
  if v_target is not null and new.action in ('accept', 'quote') and new.released_name is null then
    select u.name into new.released_name from public.users u where u.id = new.instructor_id;
    new.name_released_at := now();
  end if;

  -- 公募 request: an instructor can be chosen only after releasing the name.
  if v_target is null and new.is_selected
     and (tg_op = 'INSERT' or not old.is_selected)
     and new.interview_status is distinct from 'released' then
    raise exception 'interview step required before choosing' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists instructor_responses_interview_guard on public.instructor_responses;
create trigger instructor_responses_interview_guard
  before insert or update on public.instructor_responses
  for each row execute function public.instructor_responses_interview_guard();

-- Company: pick an applicant for an interview.
create or replace function public.request_interview(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.instructor_responses%rowtype;
begin
  if v_uid is null then raise exception 'login required' using errcode = '28000'; end if;
  select * into v_row from public.instructor_responses where response_id = p_response_id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.training_requests tr
     where tr.request_id = v_row.request_id and tr.requester_id = v_uid
       and tr.status = 'pending' and tr.target_instructor_id is null
  ) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_row.action not in ('accept', 'quote') or v_row.interview_status is not null then
    raise exception 'not allowed in this state' using errcode = 'P0001';
  end if;
  perform set_config('kenshu.interview_write', '1', true);
  update public.instructor_responses
     set interview_status = 'requested', interview_requested_at = now()
   where response_id = p_response_id;
  perform set_config('kenshu.interview_write', '', true);
end;
$$;

-- Instructor: release the full name to the company.
create or replace function public.release_instructor_name(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.instructor_responses%rowtype;
begin
  if v_uid is null then raise exception 'login required' using errcode = '28000'; end if;
  select * into v_row from public.instructor_responses where response_id = p_response_id and instructor_id = v_uid;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if v_row.interview_status is distinct from 'requested'
     or not exists (select 1 from public.training_requests tr where tr.request_id = v_row.request_id and tr.status = 'pending') then
    raise exception 'not allowed in this state' using errcode = 'P0001';
  end if;
  perform set_config('kenshu.interview_write', '1', true);
  update public.instructor_responses
     set interview_status = 'released',
         released_name = (select u.name from public.users u where u.id = v_uid),
         name_released_at = now()
   where response_id = p_response_id;
  perform set_config('kenshu.interview_write', '', true);
end;
$$;

-- Instructor: decline the interview. Nothing is released.
create or replace function public.decline_interview(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.instructor_responses%rowtype;
begin
  if v_uid is null then raise exception 'login required' using errcode = '28000'; end if;
  select * into v_row from public.instructor_responses where response_id = p_response_id and instructor_id = v_uid;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if v_row.interview_status is distinct from 'requested' then
    raise exception 'not allowed in this state' using errcode = 'P0001';
  end if;
  perform set_config('kenshu.interview_write', '1', true);
  update public.instructor_responses set interview_status = 'declined' where response_id = p_response_id;
  perform set_config('kenshu.interview_write', '', true);
end;
$$;

revoke all on function public.request_interview(uuid), public.release_instructor_name(uuid), public.decline_interview(uuid) from public, anon;
grant execute on function public.request_interview(uuid), public.release_instructor_name(uuid), public.decline_interview(uuid) to authenticated;
