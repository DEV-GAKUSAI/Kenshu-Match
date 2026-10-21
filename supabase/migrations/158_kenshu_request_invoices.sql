-- 158_kenshu_request_invoices.sql
--
-- #52 請求管理・請求書の出力
-- After the training the decided instructor submits an invoice (請求書) for the
-- decided response. The amount comes from the order or the decided quote; the
-- instructor can add extra expenses (交通費など) with a note. The company confirms
-- it, returns it for correction, or marks it paid. Until it is paid the instructor
-- can correct and re-submit it (each earlier version is kept in
-- request_invoice_changes). Only the two parties can read an invoice.
-- Additive, safe to run more than once.

create table if not exists public.request_invoices (
  invoice_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.training_requests(request_id) on delete cascade,
  response_id uuid not null unique references public.instructor_responses(response_id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete restrict,
  instructor_id uuid not null references public.users(id) on delete restrict,
  invoice_no text not null,
  title text not null,
  base_amount numeric,
  amount_unit text,
  tax_mode text,
  extra_amount numeric check (extra_amount is null or extra_amount >= 0),
  extra_note text check (extra_note is null or char_length(extra_note) <= 500),
  note text check (note is null or char_length(note) <= 2000),
  status text not null default 'submitted' check (status in ('submitted', 'confirmed', 'returned', 'paid')),
  return_reason text check (return_reason is null or char_length(return_reason) <= 500),
  revision integer not null default 1,
  issued_at timestamptz not null default now(),
  responded_at timestamptz
);

create table if not exists public.request_invoice_changes (
  change_id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.request_invoices(invoice_id) on delete cascade,
  revision integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.request_invoices enable row level security;
alter table public.request_invoice_changes enable row level security;

drop policy if exists request_invoices_party_select on public.request_invoices;
create policy request_invoices_party_select on public.request_invoices
  for select to authenticated using (requester_id = (select auth.uid()) or instructor_id = (select auth.uid()));

drop policy if exists request_invoice_changes_party_select on public.request_invoice_changes;
create policy request_invoice_changes_party_select on public.request_invoice_changes
  for select to authenticated using (
    exists (select 1 from public.request_invoices i
             where i.invoice_id = request_invoice_changes.invoice_id
               and (i.requester_id = (select auth.uid()) or i.instructor_id = (select auth.uid())))
  );

revoke all on public.request_invoices, public.request_invoice_changes from anon;
grant select on public.request_invoices, public.request_invoice_changes to authenticated;

-- The decided instructor submits (or corrects) the invoice.
create or replace function public.submit_invoice(p_response_id uuid, p_extra numeric, p_extra_note text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp public.instructor_responses%rowtype;
  v_req public.training_requests%rowtype;
  v_ord public.request_orders%rowtype;
  v_old public.request_invoices%rowtype;
  v_base numeric;
  v_unit text;
  v_tax text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_resp from public.instructor_responses where response_id = p_response_id;
  if not found or v_resp.instructor_id <> auth.uid() then raise exception 'not_found'; end if;
  select * into v_req from public.training_requests where request_id = v_resp.request_id;
  if not v_resp.is_selected or v_req.status not in ('accepted', 'completed') then raise exception 'not_decided'; end if;
  if p_extra is not null and (p_extra < 0 or p_extra <> trunc(p_extra)) then raise exception 'bad_amount'; end if;
  if p_extra_note is not null and char_length(p_extra_note) > 500 then raise exception 'too_long'; end if;
  if p_note is not null and char_length(p_note) > 2000 then raise exception 'too_long'; end if;

  select * into v_ord from public.request_orders where response_id = p_response_id;
  if found and v_ord.status = 'confirmed' then
    v_base := v_ord.amount; v_unit := v_ord.amount_unit; v_tax := v_ord.tax_mode;
  else
    v_base := coalesce(v_resp.quote_price, v_req.budget);
    v_unit := coalesce(v_resp.quote_unit, v_req.budget_unit);
    v_tax := coalesce(v_resp.quote_tax_mode, nullif(v_req.tax_mode, 'unspecified'));
  end if;

  select * into v_old from public.request_invoices where response_id = p_response_id for update;
  if found then
    if v_old.status in ('confirmed', 'paid') then raise exception 'not_editable'; end if;
    insert into public.request_invoice_changes (invoice_id, revision, snapshot) values (v_old.invoice_id, v_old.revision, to_jsonb(v_old));
    update public.request_invoices
       set base_amount = v_base, amount_unit = v_unit, tax_mode = v_tax, extra_amount = p_extra, extra_note = p_extra_note, note = p_note,
           status = 'submitted', return_reason = null, revision = v_old.revision + 1, issued_at = now(), responded_at = null, title = v_req.title
     where invoice_id = v_old.invoice_id;
    return v_old.invoice_id;
  end if;

  insert into public.request_invoices (request_id, response_id, requester_id, instructor_id, invoice_no, title,
                                       base_amount, amount_unit, tax_mode, extra_amount, extra_note, note)
  values (v_req.request_id, v_resp.response_id, v_req.requester_id, v_resp.instructor_id,
          'INV-' || to_char(now() at time zone 'Asia/Tokyo', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)),
          v_req.title, v_base, v_unit, v_tax, p_extra, p_extra_note, p_note)
  returning invoice_id into v_id;
  return v_id;
end;
$$;

-- The company confirms, returns (with a reason) or marks the invoice paid.
create or replace function public.respond_invoice(p_invoice_id uuid, p_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i public.request_invoices%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_i from public.request_invoices where invoice_id = p_invoice_id for update;
  if not found or v_i.requester_id <> auth.uid() then raise exception 'not_found'; end if;
  if p_action not in ('confirm', 'return', 'paid') then raise exception 'bad_action'; end if;
  if p_reason is not null and char_length(p_reason) > 500 then raise exception 'too_long'; end if;
  if v_i.status = 'paid' then raise exception 'not_editable'; end if;
  if p_action = 'paid' and v_i.status <> 'confirmed' then raise exception 'not_editable'; end if;
  if p_action = 'confirm' and v_i.status <> 'submitted' then raise exception 'not_editable'; end if;
  if p_action = 'return' and v_i.status not in ('submitted', 'confirmed') then raise exception 'not_editable'; end if;
  update public.request_invoices
     set status = case p_action when 'confirm' then 'confirmed' when 'paid' then 'paid' else 'returned' end,
         return_reason = case when p_action = 'return' then p_reason else null end,
         responded_at = now()
   where invoice_id = p_invoice_id;
end;
$$;

revoke all on function public.submit_invoice(uuid, numeric, text, text) from public, anon;
revoke all on function public.respond_invoice(uuid, text, text) from public, anon;
grant execute on function public.submit_invoice(uuid, numeric, text, text) to authenticated;
grant execute on function public.respond_invoice(uuid, text, text) to authenticated;
