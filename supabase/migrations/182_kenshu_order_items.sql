-- 182: review sheet #51 — 注文書 line items (明細) and quantity.
--  * request_orders.main_qty: 数量 (hours / days) of the main 登壇料 line; empty for a 総額 price.
--  * request_orders.items: extra lines [{name, qty, unit_price}] (交通費, 資料費 …), max 20.
--  * issue_order gets two more arguments (the old 3-argument version stays, nothing is dropped).
-- Amounts are limited like quotes (10,000,000 yen, see 181). Safe to run twice.

begin;

alter table public.request_orders add column if not exists main_qty numeric;
alter table public.request_orders add column if not exists items jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'request_orders_main_qty_range') then
    alter table public.request_orders add constraint request_orders_main_qty_range
      check (main_qty is null or (main_qty > 0 and main_qty <= 100000)) not valid;
  end if;
end $$;

create or replace function public.issue_order(p_response_id uuid, p_payment_terms text, p_note text, p_main_qty numeric, p_items jsonb)
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
  v_item jsonb;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_resp from public.instructor_responses where response_id = p_response_id;
  if not found then raise exception 'not_found'; end if;
  select * into v_req from public.training_requests where request_id = v_resp.request_id;
  if v_req.requester_id <> auth.uid() then raise exception 'not_found'; end if;
  if not v_resp.is_selected
     or not (v_req.status in ('accepted', 'completed')
             or (v_req.status = 'pending' and jsonb_typeof(v_req.role_slots) = 'array' and jsonb_array_length(v_req.role_slots) > 0)) then
    raise exception 'not_decided';
  end if;
  if p_payment_terms is not null and char_length(p_payment_terms) > 300 then raise exception 'too_long'; end if;
  if p_note is not null and char_length(p_note) > 2000 then raise exception 'too_long'; end if;
  if p_main_qty is not null and (p_main_qty <= 0 or p_main_qty > 100000) then raise exception 'bad_items'; end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 20 then raise exception 'bad_items'; end if;
  for v_item in select * from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or char_length(coalesce(v_item->>'name', '')) not between 1 and 50
       or coalesce((v_item->>'qty')::numeric, 0) <= 0 or (v_item->>'qty')::numeric > 100000
       or coalesce((v_item->>'unit_price')::numeric, -1) < 0 or (v_item->>'unit_price')::numeric > 10000000
       or (v_item->>'unit_price')::numeric <> trunc((v_item->>'unit_price')::numeric) then
      raise exception 'bad_items';
    end if;
  end loop;

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
       set payment_terms = p_payment_terms, note = p_note, main_qty = p_main_qty, items = v_items,
           status = 'issued', revision = v_old.revision + 1,
           issued_at = now(), responded_at = null,
           amount = coalesce(v_resp.quote_price, v_req.budget), amount_unit = coalesce(v_resp.quote_unit, v_req.budget_unit),
           tax_mode = coalesce(v_resp.quote_tax_mode, nullif(v_req.tax_mode, 'unspecified')),
           transport_cost = v_req.transport_cost, lodging_cost = v_req.lodging_cost, prep_cost = v_req.prep_cost,
           title = v_req.title, schedule_text = v_days
     where order_id = v_old.order_id;
    return v_old.order_id;
  end if;

  insert into public.request_orders (request_id, response_id, requester_id, instructor_id, order_no, title, schedule_text,
                                     amount, amount_unit, tax_mode, transport_cost, lodging_cost, prep_cost, payment_terms, note,
                                     main_qty, items)
  values (v_req.request_id, v_resp.response_id, v_req.requester_id, v_resp.instructor_id,
          'PO-' || to_char(now() at time zone 'Asia/Tokyo', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)),
          v_req.title, v_days,
          coalesce(v_resp.quote_price, v_req.budget), coalesce(v_resp.quote_unit, v_req.budget_unit),
          coalesce(v_resp.quote_tax_mode, nullif(v_req.tax_mode, 'unspecified')),
          v_req.transport_cost, v_req.lodging_cost, v_req.prep_cost, p_payment_terms, p_note,
          p_main_qty, v_items)
  returning order_id into v_id;
  return v_id;
end;
$$;

revoke all on function public.issue_order(uuid, text, text, numeric, jsonb) from public, anon;
grant execute on function public.issue_order(uuid, text, text, numeric, jsonb) to authenticated;

commit;
