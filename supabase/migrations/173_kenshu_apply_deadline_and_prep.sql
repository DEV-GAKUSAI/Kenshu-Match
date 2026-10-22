-- 173: #45 応募締切 and #54 事前研修参加可否.
--  1) training_requests.apply_deadline (date, Japan time, optional). After that day no NEW application
--     can be made (insert / re-apply are refused). Existing applicants and edits of a quote are not affected.
--  2) instructor_responses.apply_prep: 'yes' | 'no' | 'discuss' (can the instructor join a prep session).
--  3) the public preview view also shows apply_deadline (new column at the end).
-- Additive, safe to run twice.

alter table public.training_requests add column if not exists apply_deadline date;
alter table public.instructor_responses add column if not exists apply_prep text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'instructor_responses_apply_prep_check') then
    alter table public.instructor_responses add constraint instructor_responses_apply_prep_check
      check (apply_prep is null or apply_prep in ('yes', 'no', 'discuss'));
  end if;
end $$;

create or replace function public.guard_apply_deadline()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_deadline date;
begin
  select tr.apply_deadline into v_deadline from public.training_requests tr where tr.request_id = new.request_id;
  if v_deadline is not null and (now() at time zone 'Asia/Tokyo')::date > v_deadline then
    raise exception 'deadline_passed' using hint = '応募の締切を過ぎています';
  end if;
  return new;
end;
$$;
drop trigger if exists instructor_responses_guard_deadline on public.instructor_responses;
create trigger instructor_responses_guard_deadline before insert on public.instructor_responses
  for each row execute function public.guard_apply_deadline();

-- Re-apply: same as 166, plus the deadline check and the prep answer.
drop function if exists public.reapply_instructor_response(uuid, numeric, text, text, text, text, text, text);
create or replace function public.reapply_instructor_response(
  p_response_id uuid,
  p_price numeric,
  p_tax text,
  p_message text,
  p_all_days text,
  p_role text,
  p_experience text,
  p_materials text,
  p_prep text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp public.instructor_responses%rowtype;
  v_status text;
  v_deadline date;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_resp from public.instructor_responses where response_id = p_response_id for update;
  if not found or v_resp.instructor_id <> auth.uid() then raise exception 'not_found'; end if;
  select status, apply_deadline into v_status, v_deadline from public.training_requests where request_id = v_resp.request_id;
  if v_status is distinct from 'pending' or v_resp.is_selected or v_resp.action <> 'withdrawn' then
    raise exception 'not_reapplicable';
  end if;
  if v_deadline is not null and (now() at time zone 'Asia/Tokyo')::date > v_deadline then
    raise exception 'deadline_passed';
  end if;
  if p_price is not null and (p_price < 1 or p_price <> trunc(p_price)) then raise exception 'bad_price'; end if;
  if p_tax is not null and p_tax not in ('included', 'excluded') then raise exception 'bad_tax'; end if;
  if p_message is not null and char_length(p_message) > 2000 then raise exception 'bad_message'; end if;
  if p_all_days is not null and p_all_days not in ('all', 'partial', 'none') then raise exception 'bad_apply'; end if;
  if p_materials is not null and p_materials not in ('existing', 'create', 'either') then raise exception 'bad_apply'; end if;
  if p_prep is not null and p_prep not in ('yes', 'no', 'discuss') then raise exception 'bad_apply'; end if;
  if (p_role is not null and char_length(p_role) > 100) or (p_experience is not null and char_length(p_experience) > 1000) then
    raise exception 'bad_apply';
  end if;

  insert into public.instructor_response_changes (response_id, kind, old_price, new_price, old_message, new_message)
  values (v_resp.response_id, 'reapplied', null, p_price, v_resp.message, p_message);

  update public.instructor_responses
     set action = case when p_price is null then 'accept' else 'quote' end,
         quote_price = p_price,
         quote_tax_mode = case when p_price is null then null else p_tax end,
         message = p_message,
         apply_all_days = p_all_days,
         apply_role = p_role,
         apply_experience = p_experience,
         apply_materials = p_materials,
         apply_prep = p_prep,
         requester_seen_at = null
   where response_id = v_resp.response_id;
end;
$$;
revoke all on function public.reapply_instructor_response(uuid, numeric, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.reapply_instructor_response(uuid, numeric, text, text, text, text, text, text, text) to authenticated;

-- Public preview view: same as 168, plus apply_deadline at the end.
create or replace view public.open_requests_public_preview as
 select request_id, title, description, requester_type, preferred_format, budget, location, preferred_schedule,
    expertise_field, participant_count, created_at, budget_unit, tax_mode, transport_cost, lodging_cost, prep_cost,
    payment_terms, schedule_days, all_days_required, req_skills, req_prep, detail_option_ids, detail_other_tools,
    role_slots, apply_deadline
   from public.training_requests tr
  where status = 'pending' and target_instructor_id is null and publish_state = 'published';
