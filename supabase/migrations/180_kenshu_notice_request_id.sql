-- 180: Mine bell / LINE notices say WHICH 案件 they are about (#own finding 10/26).
-- The outbox row now also holds the request id (an opaque id, never a title or name). The app sends it
-- to Mine as "ref"; Mine turns it into a link that opens that 案件 in Kenshu Link.
--
-- RUN ORDER (important): first Mine's migration 149 and the Mine deploy, THEN this file, THEN deploy
-- Kenshu Link. If Kenshu Link sent "ref" before Mine accepts it, Mine would refuse those notices.
-- Safe to run more than once.
begin;

alter table public.mine_notice_outbox add column if not exists request_id uuid;

-- Same function, one optional extra argument. Drop the old two-argument version first
-- (two versions with defaults would make every call ambiguous).
drop function if exists public.kenshu_enqueue_notice(uuid, text);
create or replace function public.kenshu_enqueue_notice(p_kenshu_user uuid, p_code text, p_request_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.mine_notice_outbox (mine_user_id, event_code, request_id)
  select l.mine_user_id, p_code, p_request_id
  from public.mine_kenshu_account_links l
  where l.kenshu_user_id = p_kenshu_user;
exception when others then
  null; -- never block the real action
end;
$$;
revoke all on function public.kenshu_enqueue_notice(uuid, text, uuid) from public, anon, authenticated;

-- The claim function also returns the request id.
drop function if exists public.kenshu_notice_claim(integer);
create or replace function public.kenshu_notice_claim(p_limit integer default 20)
returns table (id bigint, event_id uuid, mine_user_id uuid, event_code text, attempts integer, request_id uuid)
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
  returning o.id, o.event_id, o.mine_user_id, o.event_code, o.attempts, o.request_id;
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
      perform public.kenshu_enqueue_notice(v_requester, 'applicant_replied', new.request_id);
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

-- Interview step and final choice.
create or replace function public.kenshu_notice_on_response_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_requester uuid;
begin
  begin
    select r.requester_id into v_requester from public.training_requests r where r.request_id = new.request_id;
    if new.interview_status is distinct from old.interview_status then
      if new.interview_status = 'requested' then
        perform public.kenshu_enqueue_notice(new.instructor_id, 'interview_requested', new.request_id);
      elsif new.interview_status = 'released' then
        perform public.kenshu_enqueue_notice(v_requester, 'name_released', new.request_id);
      elsif new.interview_status = 'declined' then
        perform public.kenshu_enqueue_notice(v_requester, 'interview_declined', new.request_id);
      end if;
    end if;
    if new.is_selected and not old.is_selected then
      perform public.kenshu_enqueue_notice(new.instructor_id, 'chosen', new.request_id);
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

-- "Not chosen" only when recruiting ends (pending -> accepted).
create or replace function public.kenshu_notice_on_request_closed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_other record;
begin
  begin
    if old.status = 'pending' and new.status = 'accepted' then
      for v_other in
        select ir.instructor_id from public.instructor_responses ir
         where ir.request_id = new.request_id and not ir.is_selected and ir.action in ('accept','quote')
      loop
        perform public.kenshu_enqueue_notice(v_other.instructor_id, 'not_chosen', new.request_id);
      end loop;
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

-- New request: direct request, invited instructors, or matching instructors.
create or replace function public.kenshu_notice_on_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_inst record;
begin
  begin
    if new.status = 'pending' and new.publish_state = 'published'
       and (case when tg_op = 'INSERT' then true else old.publish_state = 'draft' end) then
      if new.target_instructor_id is not null then
        perform public.kenshu_enqueue_notice(new.target_instructor_id, 'direct_request', new.request_id);
      elsif new.visibility = 'invited' then
        for v_inst in select ri.instructor_id from public.request_invites ri where ri.request_id = new.request_id
        loop
          perform public.kenshu_enqueue_notice(v_inst.instructor_id, 'new_match', new.request_id);
        end loop;
      else
        for v_inst in
          select distinct ip.id from public.instructor_profiles ip
          join public.instructor_expertise ie on ie.instructor_id = ip.id
          where ip.is_public = true and ie.subcategory_id = new.expertise_field
            and ip.id <> new.requester_id
        loop
          perform public.kenshu_enqueue_notice(v_inst.id, 'new_match', new.request_id);
        end loop;
      end if;
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

create or replace function public.kenshu_notice_on_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if exists (select 1 from public.training_requests tr
               where tr.request_id = new.request_id and tr.status = 'pending' and tr.publish_state = 'published') then
      perform public.kenshu_enqueue_notice(new.instructor_id, 'new_match', new.request_id);
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

commit;
