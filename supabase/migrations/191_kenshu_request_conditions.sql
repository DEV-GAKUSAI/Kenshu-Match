-- 191_kenshu_request_conditions.sql
--
-- #59 / #60 (the senior's 10/23 notes): required vs welcome conditions on a request, and the lecturer's
-- answers to them, so the company can see 確認済み / 未確認 / 不一致 per condition.
--  * training_requests.req_conditions: list of {key, level, years?}. key is one of years, materials, mock,
--    kickoff, prep_training, daily; level is must or nice. (全日程対応 keeps its own column all_days_required.)
--  * instructor_responses.condition_answers: {key: yes|no|talk} for the new items years, mock, kickoff, daily.
--    (教材・事前研修・全日程 are answered with the apply columns that already exist.)
--  * set_response_condition_answers: the decided-or-not owner saves the answers. A separate small function, so
--    the three application functions stay untouched.
--  * The public preview view gets req_conditions at the end.
-- Additive, safe to run more than once.

alter table public.training_requests add column if not exists req_conditions jsonb not null default '[]'::jsonb;
alter table public.instructor_responses add column if not exists condition_answers jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_requests_req_conditions_check') then
    alter table public.training_requests add constraint training_requests_req_conditions_check
      check (jsonb_typeof(req_conditions) = 'array' and jsonb_array_length(req_conditions) <= 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'instructor_responses_condition_answers_check') then
    alter table public.instructor_responses add constraint instructor_responses_condition_answers_check
      check (jsonb_typeof(condition_answers) = 'object');
  end if;
end $$;

-- Public preview (logged-out visitors): same as 185, new column at the end.
create or replace view public.open_requests_public_preview
 as
 select request_id, title, description, requester_type, preferred_format, budget, location,
        preferred_schedule, expertise_field, participant_count, created_at, budget_unit, tax_mode,
        transport_cost, lodging_cost, prep_cost, payment_terms, schedule_days, all_days_required,
        req_skills, req_prep, detail_option_ids, detail_other_tools, role_slots, apply_deadline,
        budget_mode, budget_max, prep_amount, pretraining_amount, req_conditions
   from public.training_requests tr
  where status = 'pending' and target_instructor_id is null and publish_state = 'published'
    and visibility = 'public';

create or replace function public.set_response_condition_answers(p_response_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp public.instructor_responses%rowtype;
  v_status text;
  v_key text;
  v_val jsonb;
  v_clean jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'bad_answers'; end if;
  select * into v_resp from public.instructor_responses where response_id = p_response_id for update;
  if not found or v_resp.instructor_id <> auth.uid() then raise exception 'not_found'; end if;
  select status into v_status from public.training_requests where request_id = v_resp.request_id;
  -- Same rule as changing a quote: before the decision, on an application that is still open.
  if v_status is distinct from 'pending' or v_resp.is_selected or v_resp.action not in ('accept', 'quote') then
    raise exception 'not_editable';
  end if;
  for v_key, v_val in select * from jsonb_each(p_answers) loop
    if v_key not in ('years', 'mock', 'kickoff', 'daily') then raise exception 'bad_answers'; end if;
    if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('yes', 'no', 'talk') then raise exception 'bad_answers'; end if;
    v_clean := v_clean || jsonb_build_object(v_key, v_val);
  end loop;
  update public.instructor_responses set condition_answers = v_clean where response_id = v_resp.response_id;
end;
$$;

revoke all on function public.set_response_condition_answers(uuid, jsonb) from public, anon;
grant execute on function public.set_response_condition_answers(uuid, jsonb) to authenticated;
