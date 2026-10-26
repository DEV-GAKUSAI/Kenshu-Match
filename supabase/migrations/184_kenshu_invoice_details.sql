-- 184: review sheet #52 — invoice details: 支払期限, 振込先, 登録番号, 領収書 (receipt files).
--  * request_invoices.due_date / bank_info (json) / registration_no (T + 13 digits) / receipts (json list).
--  * a private storage bucket 'invoice-receipts' (PDF/JPG/PNG, 4 MB each). No storage policies on purpose:
--    only the app server (service role) reads and writes it, after checking who the file belongs to.
--  * submit_invoice gets four more arguments (the 5-argument version stays; the new one wraps it).
-- Safe to run twice.

begin;

alter table public.request_invoices add column if not exists due_date date;
alter table public.request_invoices add column if not exists bank_info jsonb;
alter table public.request_invoices add column if not exists registration_no text;
alter table public.request_invoices add column if not exists receipts jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'request_invoices_registration_no_format') then
    alter table public.request_invoices add constraint request_invoices_registration_no_format
      check (registration_no is null or registration_no ~ '^T[0-9]{13}$') not valid;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-receipts', 'invoice-receipts', false, 4194304, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 4194304, allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

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
  v_bank jsonb := nullif(coalesce(p_bank, 'null'::jsonb), 'null'::jsonb);
  v_reg text := nullif(btrim(coalesce(p_registration_no, '')), '');
  v_receipts jsonb := coalesce(p_receipts, '[]'::jsonb);
  v_item jsonb;
  v_key text;
begin
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
     set due_date = p_due_date, bank_info = v_bank, registration_no = v_reg, receipts = v_receipts
   where invoice_id = v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_invoice(uuid, numeric, text, text, numeric, date, jsonb, text, jsonb) from public, anon;
grant execute on function public.submit_invoice(uuid, numeric, text, text, numeric, date, jsonb, text, jsonb) to authenticated;

commit;
