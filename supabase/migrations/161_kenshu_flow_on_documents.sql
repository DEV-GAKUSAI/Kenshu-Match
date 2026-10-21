-- 161_kenshu_flow_on_documents.sql
--
-- #53 step 2: the order (注文書) and the invoice (請求書) show the contract party and
-- the actual speaker of the request's flow (migration 160). The names are copied into
-- the document when it is issued / submitted (and again when it is re-issued), so the
-- instructor can read them on the document without reading the company's private flow.
-- No flow set = nothing changes. Additive, safe to run more than once.

alter table public.request_orders
  add column if not exists party_name text,
  add column if not exists speaker_name text;
alter table public.request_invoices
  add column if not exists party_name text,
  add column if not exists speaker_name text;

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
  new.party_name := v_party;
  new.speaker_name := v_speaker;
  return new;
end;
$$;

drop trigger if exists request_orders_copy_flow_names on public.request_orders;
create trigger request_orders_copy_flow_names
  before insert or update on public.request_orders
  for each row execute function private.copy_flow_names();

drop trigger if exists request_invoices_copy_flow_names on public.request_invoices;
create trigger request_invoices_copy_flow_names
  before insert or update on public.request_invoices
  for each row execute function private.copy_flow_names();
