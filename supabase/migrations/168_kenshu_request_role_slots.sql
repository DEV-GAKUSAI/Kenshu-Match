-- 168: role slots (募集職種・募集人数・複数名決定) for open requests (#42 in the senior's sheet).
-- A request can list roles, each with a headcount: [{"id":"<text>","name":"メイン講師","headcount":1}, ...].
-- No roles = the old single-instructor request (nothing changes for it).
-- While slots are open the request stays 'pending' (still recruiting); decided instructors are
-- marked is_selected with the slot they fill (instructor_responses.role_slot_id).
-- The request becomes 'accepted' when every slot is full, or when the company closes recruiting.
-- "Not chosen" notices go out when the request becomes 'accepted' (not after the first pick).
-- Additive, safe to run twice.

begin;

alter table public.training_requests
  add column if not exists role_slots jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_requests_role_slots_check') then
    alter table public.training_requests add constraint training_requests_role_slots_check
      check (jsonb_typeof(role_slots) = 'array' and jsonb_array_length(role_slots) <= 10);
  end if;
end $$;

alter table public.instructor_responses
  add column if not exists role_slot_id text;

-- Guard: deciding an instructor into a role that does not exist, or is already full, is refused.
create or replace function public.guard_role_slot_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_slots jsonb;
  v_slot jsonb;
  v_taken integer;
begin
  if new.is_selected and not old.is_selected then
    select tr.role_slots into v_slots from public.training_requests tr where tr.request_id = new.request_id;
    if v_slots is not null and jsonb_array_length(v_slots) > 0 then
      if new.role_slot_id is null then
        raise exception 'role_required' using hint = '職種を選んでください';
      end if;
      select s into v_slot from jsonb_array_elements(v_slots) s where s ->> 'id' = new.role_slot_id limit 1;
      if v_slot is null then
        raise exception 'bad_role' using hint = '職種が見つかりません';
      end if;
      select count(*) into v_taken from public.instructor_responses ir
       where ir.request_id = new.request_id and ir.is_selected and ir.role_slot_id = new.role_slot_id
         and ir.response_id <> new.response_id;
      if v_taken >= coalesce((v_slot ->> 'headcount')::integer, 1) then
        raise exception 'role_full' using hint = 'この職種の募集人数はすでに決定済みです';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists instructor_responses_guard_role_slot on public.instructor_responses;
create trigger instructor_responses_guard_role_slot before update of is_selected on public.instructor_responses
  for each row execute function public.guard_role_slot_decision();

-- Public preview list: also shows the roles (new column at the end).
create or replace view public.open_requests_public_preview as
 select request_id,
    title,
    description,
    requester_type,
    preferred_format,
    budget,
    location,
    preferred_schedule,
    expertise_field,
    participant_count,
    created_at,
    budget_unit,
    tax_mode,
    transport_cost,
    lodging_cost,
    prep_cost,
    payment_terms,
    schedule_days,
    all_days_required,
    req_skills,
    req_prep,
    detail_option_ids,
    detail_other_tools,
    role_slots
   from public.training_requests tr
  where status = 'pending' and target_instructor_id is null and publish_state = 'published';

-- Notices: "chosen" still goes out at each decision, but "not chosen" only when recruiting ends
-- (request pending -> accepted), so the other applicants are not told after the first pick.
create or replace function public.kenshu_notice_on_response_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_requester uuid;
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
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

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
        perform public.kenshu_enqueue_notice(v_other.instructor_id, 'not_chosen');
      end loop;
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists kenshu_notice_request_closed on public.training_requests;
create trigger kenshu_notice_request_closed after update of status on public.training_requests
  for each row when (old.status is distinct from new.status)
  execute function public.kenshu_notice_on_request_closed();

commit;
