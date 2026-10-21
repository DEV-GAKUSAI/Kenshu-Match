-- 159_kenshu_invoice_quantity.sql
--
-- #52 follow-up: an invoice for a price "per hour" or "per day" needs the number of
-- hours / days to show a total. The instructor can add it when submitting.
-- Additive, safe to run more than once.

alter table public.request_invoices
  add column if not exists quantity numeric check (quantity is null or (quantity > 0 and quantity <= 9999));

create or replace function public.submit_invoice(p_response_id uuid, p_extra numeric, p_extra_note text, p_note text, p_quantity numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_quantity is not null and (p_quantity <= 0 or p_quantity > 9999) then raise exception 'bad_amount'; end if;
  v_id := public.submit_invoice(p_response_id, p_extra, p_extra_note, p_note);
  update public.request_invoices set quantity = p_quantity where invoice_id = v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_invoice(uuid, numeric, text, text, numeric) from public, anon;
grant execute on function public.submit_invoice(uuid, numeric, text, text, numeric) to authenticated;
