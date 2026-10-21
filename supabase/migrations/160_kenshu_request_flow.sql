-- 160_kenshu_request_flow.sql
--
-- #53 商流管理 (step 1: register partners and set the flow of each request)
-- A company can register 関係先 (partner companies and instructors) and, per request,
-- set: 発注・請求の相手 (contract party), 間に入る関係先 (intermediaries), and
-- 実際の登壇講師 (the speaker). Private to the company that owns the request.
-- Not yet: orders/invoices between the parties, partner accounts, sharing settings.
-- Additive, safe to run more than once.

create table if not exists public.requester_partners (
  partner_id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  kind text not null default 'company' check (kind in ('company', 'instructor')),
  contact text check (contact is null or char_length(contact) <= 300),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists requester_partners_owner_idx on public.requester_partners (requester_id, created_at desc);

create table if not exists public.request_flows (
  request_id uuid primary key references public.training_requests(request_id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  contract_partner_id uuid references public.requester_partners(partner_id) on delete set null,
  via_partner_ids uuid[] not null default '{}' check (cardinality(via_partner_ids) <= 5),
  speaker_partner_id uuid references public.requester_partners(partner_id) on delete set null,
  speaker_name text check (speaker_name is null or char_length(speaker_name) <= 100),
  updated_at timestamptz not null default now()
);

alter table public.requester_partners enable row level security;
alter table public.request_flows enable row level security;

drop policy if exists requester_partners_owner_all on public.requester_partners;
create policy requester_partners_owner_all on public.requester_partners
  for all to authenticated
  using (requester_id = (select auth.uid()))
  with check (requester_id = (select auth.uid()));

drop policy if exists request_flows_owner_all on public.request_flows;
create policy request_flows_owner_all on public.request_flows
  for all to authenticated
  using (requester_id = (select auth.uid()))
  with check (
    requester_id = (select auth.uid())
    and exists (select 1 from public.training_requests tr
                 where tr.request_id = request_flows.request_id and tr.requester_id = (select auth.uid()))
    and (contract_partner_id is null or exists (select 1 from public.requester_partners p
                 where p.partner_id = request_flows.contract_partner_id and p.requester_id = (select auth.uid())))
    and (speaker_partner_id is null or exists (select 1 from public.requester_partners p
                 where p.partner_id = request_flows.speaker_partner_id and p.requester_id = (select auth.uid())))
  );

revoke all on public.requester_partners, public.request_flows from anon;
grant select, insert, update, delete on public.requester_partners, public.request_flows to authenticated;
