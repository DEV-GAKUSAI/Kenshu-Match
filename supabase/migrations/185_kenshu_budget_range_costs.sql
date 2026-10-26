-- 185: review sheet #44 — budget as a range or 応相談, and yen amounts for 準備・事前打合せ費 / 事前研修費.
--  * training_requests.budget_mode: fixed (as before) | range (budget = lower, budget_max = upper) | negotiable (no amount).
--  * training_requests.prep_amount (only when prep_cost = 'extra') and pretraining_amount: optional whole yen.
--  * issue_order gets a 6th argument p_amount: needed when the lecturer sent no quote and the budget is a range / 応相談.
--  * request_invoices.items: the order's extra rows, copied at submit. submit_invoice refuses when there is no amount yet.
--  * the public preview view shows the new columns (added at the end).
-- Old rows stay 'fixed' with no extra amounts. Safe to run twice.

begin;

alter table public.training_requests add column if not exists budget_mode text not null default 'fixed';
alter table public.training_requests add column if not exists budget_max numeric;
alter table public.training_requests add column if not exists prep_amount numeric;
alter table public.training_requests add column if not exists pretraining_amount numeric;
alter table public.request_invoices add column if not exists items jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_requests_budget_mode_shape') then
    alter table public.training_requests add constraint training_requests_budget_mode_shape check (
      (budget_mode = 'fixed' and budget_max is null)
      or (budget_mode = 'range' and budget is not null and budget > 0 and budget_max is not null and budget_max > budget and budget_max <= 10000000)
      or (budget_mode = 'negotiable' and budget is null and budget_max is null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_requests_extra_amounts_shape') then
    alter table public.training_requests add constraint training_requests_extra_amounts_shape check (
      (prep_amount is null or (prep_cost = 'extra' and prep_amount >= 1 and prep_amount <= 10000000 and prep_amount = trunc(prep_amount)))
      and (pretraining_amount is null or (pretraining_amount >= 1 and pretraining_amount <= 10000000 and pretraining_amount = trunc(pretraining_amount)))
    );
  end if;
end $$;

-- Public preview (logged-out visitors): same as 174, new columns at the end.
create or replace view public.open_requests_public_preview
 as
 select request_id, title, description, requester_type, preferred_format, budget, location,
        preferred_schedule, expertise_field, participant_count, created_at, budget_unit, tax_mode,
        transport_cost, lodging_cost, prep_cost, payment_terms, schedule_days, all_days_required,
        req_skills, req_prep, detail_option_ids, detail_other_tools, role_slots, apply_deadline,
        budget_mode, budget_max, prep_amount, pretraining_amount
   from public.training_requests tr
  where status = 'pending' and target_instructor_id is null and publish_state = 'published'
    and visibility = 'public';

-- issue_order with an amount (the 5-argument version stays; this one wraps it).
create or replace function public.issue_order(
  p_response_id uuid, p_payment_terms text, p_note text, p_main_qty numeric, p_items jsonb, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp public.instructor_responses%rowtype;
  v_req public.training_requests%rowtype;
  v_needs boolean;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_resp from public.instructor_responses where response_id = p_response_id;
  if not found then raise exception 'not_found'; end if;
  select * into v_req from public.training_requests where request_id = v_resp.request_id;
  if v_req.requester_id <> auth.uid() then raise exception 'not_found'; end if;
  if p_amount is not null and (p_amount < 1 or p_amount > 10000000 or p_amount <> trunc(p_amount)) then raise exception 'bad_amount'; end if;

  -- The amount is typed on the order only when nothing else decides it.
  v_needs := v_resp.quote_price is null and v_req.budget_mode <> 'fixed';
  if v_needs and p_amount is null then raise exception 'amount_required'; end if;

  v_id := public.issue_order(p_response_id, p_payment_terms, p_note, p_main_qty, p_items);
  if v_needs then
    update public.request_orders set amount = p_amount where order_id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.issue_order(uuid, text, text, numeric, jsonb, numeric) from public, anon;
grant execute on function public.issue_order(uuid, text, text, numeric, jsonb, numeric) to authenticated;

-- submit_invoice (9 arguments, from 184) again: refuses without an amount, copies the order's extra rows.
create or replace function public.submit_invoice(
  p_response_id uuid, p_extra numeric, p_extra_note text, p_note text, p_quantity numeric,
  p_due_date date, p_bank jsonb, p_registration_no text, p_receipts jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_resp public.instructor_responses%rowtype;
  v_req public.training_requests%rowtype;
  v_ord public.request_orders%rowtype;
  v_confirmed boolean := false;
  v_bank jsonb := nullif(coalesce(p_bank, 'null'::jsonb), 'null'::jsonb);
  v_reg text := nullif(btrim(coalesce(p_registration_no, '')), '');
  v_receipts jsonb := coalesce(p_receipts, '[]'::jsonb);
  v_item jsonb;
  v_key text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_resp from public.instructor_responses where response_id = p_response_id;
  if not found or v_resp.instructor_id <> auth.uid() then raise exception 'not_found'; end if;
  select * into v_req from public.training_requests where request_id = v_resp.request_id;
  select * into v_ord from public.request_orders where response_id = p_response_id;
  v_confirmed := found and v_ord.status = 'confirmed';
  if not v_confirmed and v_resp.quote_price is null and v_req.budget_mode <> 'fixed' then raise exception 'no_amount'; end if;

  if p_due_date is not null and (p_due_date < (now() at time zone 'Asia/Tokyo')::date or p_due_date > (now() at time zone 'Asia/Tokyo')::date + 730) then
    raise exception 'bad_date';
  end if;
  if v_reg is not null and v_reg !~ '^T[0-9]{13}$' then raise exception 'bad_reg_no'; end if;

  if v_bank is not null then
    if jsonb_typeof(v_bank) <> 'object' then raise exception 'bad_bank'; end if;
    for v_key in select * from jsonb_object_keys(v_bank) loop
      if v_key not in ('bank', 'branch', 'type', 'number', 'holder') then raise exception 'bad_bank'; end if;
    end loop;
    if char_length(coalesce(v_bank->>'bank', '')) not between 1 and 50
       or char_length(coalesce(v_bank->>'branch', '')) not between 1 and 50
       or coalesce(v_bank->>'type', '') not in ('普通', '当座', '貯蓄')
       or coalesce(v_bank->>'number', '') !~ '^[0-9]{4,10}$'
       or char_length(coalesce(v_bank->>'holder', '')) not between 1 and 60 then
      raise exception 'bad_bank';
    end if;
  end if;

  if jsonb_typeof(v_receipts) <> 'array' or jsonb_array_length(v_receipts) > 5 then raise exception 'bad_receipts'; end if;
  for v_item in select * from jsonb_array_elements(v_receipts) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'path', '') not like 'receipts/' || p_response_id::text || '/%'
       or char_length(v_item->>'path') > 200
       or char_length(coalesce(v_item->>'name', '')) not between 1 and 100
       or coalesce(v_item->>'type', '') not in ('application/pdf', 'image/jpeg', 'image/png')
       or coalesce((v_item->>'size')::numeric, 0) not between 1 and 4194304 then
      raise exception 'bad_receipts';
    end if;
  end loop;

  v_id := public.submit_invoice(p_response_id, p_extra, p_extra_note, p_note, p_quantity);
  update public.request_invoices
     set due_date = p_due_date, bank_info = v_bank, registration_no = v_reg, receipts = v_receipts,
         items = case when v_confirmed then coalesce(v_ord.items, '[]'::jsonb) else '[]'::jsonb end
   where invoice_id = v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_invoice(uuid, numeric, text, text, numeric, date, jsonb, text, jsonb) from public, anon;
grant execute on function public.submit_invoice(uuid, numeric, text, text, numeric, date, jsonb, text, jsonb) to authenticated;

commit;
