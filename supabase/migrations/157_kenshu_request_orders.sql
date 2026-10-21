-- 157_kenshu_request_orders.sql
--
-- #51 発注管理・注文書の出力
-- After the company has decided an instructor, it issues an order (注文書) tied to
-- that decided response. The order copies the title, schedule and money terms
-- from the request and the decided quote, and the company can add a note and
-- payment terms. The instructor confirms or declines it. While it is not
-- confirmed the company can change it (every change is kept in
-- request_order_changes). Only the two parties can read an order.
-- Additive, safe to run more than once.

create table if not exists public.request_orders (
  order_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.training_requests(request_id) on delete cascade,
  response_id uuid not null unique references public.instructor_responses(response_id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete restrict,
  instructor_id uuid not null references public.users(id) on delete restrict,
  order_no text not null,
  title text not null,
  schedule_text text,
  amount numeric,
  amount_unit text,
  tax_mode text,
  transport_cost text,
  lodging_cost text,
  prep_cost text,
  payment_terms text check (payment_terms is null or char_length(payment_terms) <= 300),
  note text check (note is null or char_length(note) <= 2000),
  status text not null default 'issued' check (status in ('issued', 'confirmed', 'declined')),
  revision integer not null default 1,
  issued_at timestamptz not null default now(),
  responded_at timestamptz
);

create table if not exists public.request_order_changes (
  change_id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.request_orders(order_id) on delete cascade,
  revision integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.request_orders enable row level security;
alter table public.request_order_changes enable row level security;

drop policy if exists request_orders_party_select on public.request_orders;
create policy request_orders_party_select on public.request_orders
  for select to authenticated using (requester_id = (select auth.uid()) or instructor_id = (select auth.uid()));

drop policy if exists request_order_changes_party_select on public.request_order_changes;
create policy request_order_changes_party_select on public.request_order_changes
  for select to authenticated using (
    exists (select 1 from public.request_orders o
             where o.order_id = request_order_changes.order_id
               and (o.requester_id = (select auth.uid()) or o.instructor_id = (select auth.uid())))
  );

revoke all on public.request_orders, public.request_order_changes from anon;
grant select on public.request_orders, public.request_order_changes to authenticated;

-- Issue (or change) the order of a decided response. Company only.
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
  if not v_resp.is_selected or v_req.status not in ('accepted', 'completed') then raise exception 'not_decided'; end if;
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

-- The instructor confirms or declines an issued order.
create or replace function public.respond_order(p_order_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.request_orders%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_o from public.request_orders where order_id = p_order_id for update;
  if not found or v_o.instructor_id <> auth.uid() then raise exception 'not_found'; end if;
  if v_o.status <> 'issued' then raise exception 'not_editable'; end if;
  update public.request_orders
     set status = case when p_accept then 'confirmed' else 'declined' end, responded_at = now()
   where order_id = p_order_id;
end;
$$;

revoke all on function public.issue_order(uuid, text, text) from public, anon;
revoke all on function public.respond_order(uuid, boolean) from public, anon;
grant execute on function public.issue_order(uuid, text, text) to authenticated;
grant execute on function public.respond_order(uuid, boolean) to authenticated;
