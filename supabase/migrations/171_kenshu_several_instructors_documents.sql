-- 171: #42 step 4: orders / invoices / 商流 with several chosen instructors.
--  * An order (注文書) can be issued to a decided instructor right after the decision, even while
--    other role slots are still open (request still 'pending' but has role slots). Invoices still
--    need the request to be accepted/completed (after the training).
--  * The 商流 form has one 実際の登壇講師 for the whole request. For a request with role slots that
--    field is ignored: documents list no speaker name (each document belongs to the instructor it is
--    addressed to) and the survey is not moved to a flow speaker. Contract party and intermediaries
--    stay shared by all instructors of the request.
-- Safe to run twice.

begin;

create or replace function public.issue_order(p_response_id uuid, p_payment_terms text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp public.instructor_responses%rowtype;
  v_req public.training_requests%rowtype;
  v_old public.request_orders%rowtype;
  v_id uuid;
  v_days text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_resp from public.instructor_responses where response_id = p_response_id;
  if not found then raise exception 'not_found'; end if;
  select * into v_req from public.training_requests where request_id = v_resp.request_id;
  if v_req.requester_id <> auth.uid() then raise exception 'not_found'; end if;
  -- decided instructors of a request with role slots can get their order while other slots are still open
  if not v_resp.is_selected
     or not (v_req.status in ('accepted', 'completed')
             or (v_req.status = 'pending' and jsonb_typeof(v_req.role_slots) = 'array' and jsonb_array_length(v_req.role_slots) > 0)) then
    raise exception 'not_decided';
  end if;
  if p_payment_terms is not null and char_length(p_payment_terms) > 300 then raise exception 'too_long'; end if;
  if p_note is not null and char_length(p_note) > 2000 then raise exception 'too_long'; end if;

  v_days := coalesce(
    (select string_agg(
        coalesce(d->>'date', '日付未定') || ' ' || coalesce(nullif(d->>'start', ''), '?') || '〜' || coalesce(nullif(d->>'end', ''), '?')
        || case when coalesce(d->>'place', '') <> '' then ' ' || (d->>'place') else '' end, E'\n')
       from jsonb_array_elements(v_req.schedule_days) d),
    v_req.preferred_schedule);

  select * into v_old from public.request_orders where response_id = p_response_id for update;
  if found then
    if v_old.status = 'confirmed' then raise exception 'already_confirmed'; end if;
    insert into public.request_order_changes (order_id, revision, snapshot) values (v_old.order_id, v_old.revision, to_jsonb(v_old));
    update public.request_orders
       set payment_terms = p_payment_terms, note = p_note, status = 'issued', revision = v_old.revision + 1,
           issued_at = now(), responded_at = null,
           amount = coalesce(v_resp.quote_price, v_req.budget), amount_unit = coalesce(v_resp.quote_unit, v_req.budget_unit),
           tax_mode = coalesce(v_resp.quote_tax_mode, nullif(v_req.tax_mode, 'unspecified')),
           transport_cost = v_req.transport_cost, lodging_cost = v_req.lodging_cost, prep_cost = v_req.prep_cost,
           title = v_req.title, schedule_text = v_days
     where order_id = v_old.order_id;
    return v_old.order_id;
  end if;

  insert into public.request_orders (request_id, response_id, requester_id, instructor_id, order_no, title, schedule_text,
                                     amount, amount_unit, tax_mode, transport_cost, lodging_cost, prep_cost, payment_terms, note)
  values (v_req.request_id, v_resp.response_id, v_req.requester_id, v_resp.instructor_id,
          'PO-' || to_char(now() at time zone 'Asia/Tokyo', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)),
          v_req.title, v_days,
          coalesce(v_resp.quote_price, v_req.budget), coalesce(v_resp.quote_unit, v_req.budget_unit),
          coalesce(v_resp.quote_tax_mode, nullif(v_req.tax_mode, 'unspecified')),
          v_req.transport_cost, v_req.lodging_cost, v_req.prep_cost, p_payment_terms, p_note)
  returning order_id into v_id;
  return v_id;
end;
$$;


create or replace function private.copy_flow_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_party text;
  v_speaker text;
begin
  if tg_op = 'UPDATE' and new.revision = old.revision then
    return new;
  end if;
  select cp.name, coalesce(sp.name, nullif(f.speaker_name, ''))
    into v_party, v_speaker
    from public.request_flows f
    left join public.requester_partners cp on cp.partner_id = f.contract_partner_id
    left join public.requester_partners sp on sp.partner_id = f.speaker_partner_id
   where f.request_id = new.request_id;
  -- several instructors (role slots): no single speaker for the request
  if exists (select 1 from public.training_requests tr
              where tr.request_id = new.request_id
                and jsonb_typeof(tr.role_slots) = 'array' and jsonb_array_length(tr.role_slots) > 0) then
    v_speaker := null;
  end if;
  new.party_name := v_party;
  new.speaker_name := v_speaker;
  return new;
end;
$$;

create or replace function private.survey_use_flow_speaker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_speaker uuid;
begin
  if new.request_id is null then
    return new;
  end if;
  if exists (select 1 from public.training_requests tr
              where tr.request_id = new.request_id
                and jsonb_typeof(tr.role_slots) = 'array' and jsonb_array_length(tr.role_slots) > 0) then
    return new;
  end if;
  select sp.instructor_id into v_speaker
    from public.request_flows f
    join public.requester_partners sp on sp.partner_id = f.speaker_partner_id
   where f.request_id = new.request_id and sp.instructor_id is not null;
  if v_speaker is not null then
    new.instructor_id := v_speaker;
  end if;
  return new;
end;
$$;

revoke all on function public.issue_order(uuid, text, text) from public, anon;
grant execute on function public.issue_order(uuid, text, text) to authenticated;

commit;
