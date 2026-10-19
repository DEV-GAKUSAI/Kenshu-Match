-- Kenshu Link -> Mine notices (bell + LINE), step 4.
--
-- Database triggers drop a small row in an outbox whenever something happens
-- that a person should hear about. The app then sends the rows to Mine's
-- notification hub (signed). Only people with a Mine link get a row, and the
-- row holds only the person and a fixed event code -- never names or titles.
-- A failure here can never block the real action (errors are swallowed).
begin;

create table if not exists public.mine_notice_outbox (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid(),
  mine_user_id uuid not null,
  event_code text not null check (event_code in (
    'new_match','direct_request','applicant_replied','interview_requested',
    'name_released','interview_declined','chosen','not_chosen')),
  created_at timestamptz not null default now(),
  next_at timestamptz not null default now(),
  attempts integer not null default 0,
  sent_at timestamptz,
  error text
);
create index if not exists mine_notice_outbox_due_idx on public.mine_notice_outbox (next_at) where sent_at is null;
alter table public.mine_notice_outbox enable row level security;
revoke all on public.mine_notice_outbox from public, anon, authenticated;
grant all on public.mine_notice_outbox to service_role;

create or replace function public.kenshu_enqueue_notice(p_kenshu_user uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.mine_notice_outbox (mine_user_id, event_code)
  select l.mine_user_id, p_code
  from public.mine_kenshu_account_links l
  where l.kenshu_user_id = p_kenshu_user;
exception when others then
  null; -- never block the real action
end;
$$;
revoke all on function public.kenshu_enqueue_notice(uuid, text) from public, anon, authenticated;

-- Take up to p_limit due rows and lease them for 2 minutes.
create or replace function public.kenshu_notice_claim(p_limit integer default 20)
returns table (id bigint, event_id uuid, mine_user_id uuid, event_code text, attempts integer)
language sql security definer set search_path = '' as $$
  with due as (
    select o.id from public.mine_notice_outbox o
    where o.sent_at is null and o.attempts < 6 and o.next_at <= now()
    order by o.id limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  update public.mine_notice_outbox o
     set attempts = o.attempts + 1, next_at = now() + interval '2 minutes'
    from due where o.id = due.id
  returning o.id, o.event_id, o.mine_user_id, o.event_code, o.attempts;
$$;
revoke all on function public.kenshu_notice_claim(integer) from public, anon, authenticated;
grant execute on function public.kenshu_notice_claim(integer) to service_role;

-- Answers to a request / quote.
create or replace function public.kenshu_notice_on_response()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_requester uuid;
begin
  begin
    if new.action in ('accept','quote') then
      select r.requester_id into v_requester from public.training_requests r where r.request_id = new.request_id;
      perform public.kenshu_enqueue_notice(v_requester, 'applicant_replied');
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists kenshu_notice_response_ins on public.instructor_responses;
create trigger kenshu_notice_response_ins after insert on public.instructor_responses
  for each row execute function public.kenshu_notice_on_response();

-- Interview step and final choice.
create or replace function public.kenshu_notice_on_response_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_requester uuid; v_other record;
begin
  begin
    select r.requester_id into v_requester from public.training_requests r where r.request_id = new.request_id;
    if new.interview_status is distinct from old.interview_status then
      if new.interview_status = 'requested' then
        perform public.kenshu_enqueue_notice(new.instructor_id, 'interview_requested');
      elsif new.interview_status = 'released' then
        perform public.kenshu_enqueue_notice(v_requester, 'name_released');
      elsif new.interview_status = 'declined' then
        perform public.kenshu_enqueue_notice(v_requester, 'interview_declined');
      end if;
    end if;
    if new.is_selected and not old.is_selected then
      perform public.kenshu_enqueue_notice(new.instructor_id, 'chosen');
      for v_other in
        select ir.instructor_id from public.instructor_responses ir
        where ir.request_id = new.request_id and ir.response_id <> new.response_id
          and ir.action in ('accept','quote')
      loop
        perform public.kenshu_enqueue_notice(v_other.instructor_id, 'not_chosen');
      end loop;
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists kenshu_notice_response_upd on public.instructor_responses;
create trigger kenshu_notice_response_upd after update on public.instructor_responses
  for each row execute function public.kenshu_notice_on_response_update();

-- New requests: direct -> that instructor; open -> public instructors with the same field.
create or replace function public.kenshu_notice_on_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_inst record;
begin
  begin
    if new.status = 'pending' then
      if new.target_instructor_id is not null then
        perform public.kenshu_enqueue_notice(new.target_instructor_id, 'direct_request');
      else
        for v_inst in
          select distinct ip.id from public.instructor_profiles ip
          join public.instructor_expertise ie on ie.instructor_id = ip.id
          where ip.is_public = true and ie.subcategory_id = new.expertise_field
            and ip.id <> new.requester_id
        loop
          perform public.kenshu_enqueue_notice(v_inst.id, 'new_match');
        end loop;
      end if;
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists kenshu_notice_request_ins on public.training_requests;
create trigger kenshu_notice_request_ins after insert on public.training_requests
  for each row execute function public.kenshu_notice_on_request();

commit;
