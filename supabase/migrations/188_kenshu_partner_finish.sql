-- 188_kenshu_partner_finish.sql
--
-- #53 finish (the rest of the senior's first request):
--   1. Who may see amounts and the internal memo is set PER PARTNER (request_flow_access).
--      The old per-request switch (request_flows.show_amount_to_partners) still works as the default
--      for a partner that has no row of its own.
--   2. The contract party can read the 注文書 and 請求書 of its request (partner_documents, read only).
--      The bank details (bank_info) and the receipt files of an invoice are NOT part of it.
--   3. 登壇実績 (teaching record) follows the ACTUAL speaker: instructor_teaching_record (own list) and
--      instructor_teaching_counts (public count).
--   partner_requests() now also returns the memo (only when switched on for that partner).
-- Additive, safe to run more than once.

create schema if not exists private;

-- 1. Per-partner visibility ---------------------------------------------------------------------

create table if not exists public.request_flow_access (
  request_id uuid not null references public.training_requests(request_id) on delete cascade,
  partner_id uuid not null references public.requester_partners(partner_id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  show_amount boolean not null default false,
  show_note boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (request_id, partner_id)
);

alter table public.request_flow_access enable row level security;

drop policy if exists request_flow_access_owner_all on public.request_flow_access;
create policy request_flow_access_owner_all on public.request_flow_access
  for all to authenticated
  using (requester_id = (select auth.uid()))
  with check (
    requester_id = (select auth.uid())
    and exists (select 1 from public.training_requests tr
                 where tr.request_id = request_flow_access.request_id and tr.requester_id = (select auth.uid()))
    and exists (select 1 from public.requester_partners p
                 where p.partner_id = request_flow_access.partner_id and p.requester_id = (select auth.uid()))
  );

revoke all on public.request_flow_access from anon;
grant select, insert, update, delete on public.request_flow_access to authenticated;

-- partner_requests gets a new column (memo): the return type changes, so drop and create again.
drop function if exists public.partner_requests();
create function public.partner_requests()
returns table (
  request_id uuid,
  title text,
  description text,
  status text,
  publish_state text,
  preferred_format text,
  location text,
  participant_count integer,
  schedule_days jsonb,
  company_name text,
  partner_id uuid,
  partner_name text,
  my_role text,
  speaker_name text,
  show_amount boolean,
  money jsonb,
  proposals jsonb,
  created_at timestamptz,
  show_note boolean,
  memo text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.request_id, r.title, r.description, r.status, r.publish_state, r.preferred_format, r.location,
         r.participant_count, coalesce(r.schedule_days, '[]'::jsonb),
         coalesce(nullif(rp.company_name, ''), u.name),
         mp.partner_id, mp.name,
         case when mp.partner_id = f.contract_partner_id then 'contract' else 'via' end,
         coalesce(sp.name, nullif(f.speaker_name, '')),
         coalesce(a.show_amount, f.show_amount_to_partners, false),
         case when coalesce(a.show_amount, f.show_amount_to_partners, false) then jsonb_build_object(
           'budget', r.budget, 'budget_unit', r.budget_unit, 'budget_mode', r.budget_mode, 'budget_max', r.budget_max,
           'prep_amount', r.prep_amount, 'pretraining_amount', r.pretraining_amount, 'tax_mode', r.tax_mode,
           'transport_cost', r.transport_cost, 'lodging_cost', r.lodging_cost, 'prep_cost', r.prep_cost,
           'payment_terms', r.payment_terms) else null end,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'proposal_id', pp.proposal_id, 'lecturer_name', pp.lecturer_name, 'instructor_id', pp.instructor_id,
                     'note', pp.note, 'status', pp.status, 'created_at', pp.created_at) order by pp.created_at desc)
                    from public.partner_proposals pp
                   where pp.request_id = r.request_id and pp.proposer_id = auth.uid()), '[]'::jsonb),
         r.created_at,
         coalesce(a.show_note, false),
         case when coalesce(a.show_note, false) then n.internal_note else null end
    from public.request_flows f
    join public.training_requests r on r.request_id = f.request_id
    join public.users u on u.id = r.requester_id
    left join public.requester_profiles rp on rp.id = r.requester_id
    left join public.requester_partners sp on sp.partner_id = f.speaker_partner_id
    cross join lateral (
      select p.partner_id, p.name
        from public.requester_partners p
       where p.account_id = auth.uid()
         and p.requester_id = r.requester_id
         and (p.partner_id = f.contract_partner_id or p.partner_id = any (f.via_partner_ids))
       order by (p.partner_id = f.contract_partner_id) desc, p.created_at
       limit 1
    ) mp
    left join public.request_flow_access a on a.request_id = r.request_id and a.partner_id = mp.partner_id
    left join public.request_internal_notes n on n.request_id = r.request_id
   where auth.uid() is not null
     and r.publish_state <> 'draft'
   order by r.created_at desc;
$$;

revoke all on function public.partner_requests() from public, anon;
grant execute on function public.partner_requests() to authenticated;

-- 2. The contract party reads its documents (read only) ---------------------------------------------

-- Returns {"orders": [...], "invoices": [...]} of the request, or null when the caller is not the
-- contract party's account. Left out on purpose: invoice bank details and receipt files, and ids of people.
create or replace function public.partner_documents(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1
      from public.request_flows f
      join public.training_requests r on r.request_id = f.request_id
      join public.requester_partners p on p.partner_id = f.contract_partner_id
     where f.request_id = p_request_id
       and r.publish_state <> 'draft'
       and p.account_id = v_uid
       and p.requester_id = r.requester_id
  ) then
    return null;
  end if;
  return jsonb_build_object(
    'orders', coalesce((select jsonb_agg(to_jsonb(o) - 'requester_id' - 'instructor_id' - 'response_id' order by o.issued_at)
                          from public.request_orders o where o.request_id = p_request_id), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i) - 'requester_id' - 'instructor_id' - 'response_id' - 'bank_info' - 'receipts' order by i.issued_at)
                            from public.request_invoices i where i.request_id = p_request_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.partner_documents(uuid) from public, anon;
grant execute on function public.partner_documents(uuid) to authenticated;

-- 3. 登壇実績 follows the actual speaker ------------------------------------------------------------

-- (lecturer, completed request) pairs.
--  * A request whose 商流 names a speaker (and that has no several roles): only a speaker who is linked
--    to a Kenshu Link lecturer gets the entry. The decided lecturer (the contract party) does not.
--  * Every other completed request: the decided lecturer(s), or the target lecturer of a direct request.
create or replace function private.teaching_rows()
returns table (instructor_id uuid, request_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with named as (
    select r.request_id,
           (case when jsonb_typeof(r.role_slots) = 'array' then jsonb_array_length(r.role_slots) else 0 end) as slots,
           sp.instructor_id as speaker_instructor,
           (f.speaker_partner_id is not null or nullif(f.speaker_name, '') is not null) as has_speaker
      from public.training_requests r
      left join public.request_flows f on f.request_id = r.request_id
      left join public.requester_partners sp on sp.partner_id = f.speaker_partner_id
     where r.status = 'completed'
  )
  select distinct t.instructor_id, t.request_id
    from (
      select n.speaker_instructor as instructor_id, n.request_id
        from named n
       where n.slots = 0 and n.has_speaker and n.speaker_instructor is not null
      union all
      select resp.instructor_id, resp.request_id
        from public.instructor_responses resp
        join named n on n.request_id = resp.request_id
        join public.training_requests r on r.request_id = resp.request_id
       where not (n.slots = 0 and n.has_speaker)
         and (resp.is_selected
              or (r.target_instructor_id is not null and resp.instructor_id = r.target_instructor_id
                  and resp.action in ('accept', 'quote')))
    ) t
   where t.instructor_id is not null;
$$;
revoke all on function private.teaching_rows() from public, anon, authenticated;

-- The lecturer's own list: title and date only.
create or replace function public.instructor_teaching_record()
returns table (request_id uuid, title text, taught_on text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.request_id, r.title,
         coalesce((select min(d.value ->> 'date')
                     from jsonb_array_elements(case when jsonb_typeof(r.schedule_days) = 'array' then r.schedule_days else '[]'::jsonb end) as d(value)
                    where coalesce(d.value ->> 'date', '') <> ''),
                  to_char(r.created_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD')) as taught_on
    from private.teaching_rows() t
    join public.training_requests r on r.request_id = t.request_id
   where t.instructor_id = auth.uid()
   order by 3 desc, r.created_at desc;
$$;

-- The public count per lecturer (also for visitors who are not logged in: the lecturer pages are public).
create or replace function public.instructor_teaching_counts(p_ids uuid[])
returns table (instructor_id uuid, taught integer)
language sql
stable
security definer
set search_path = ''
as $$
  select t.instructor_id, count(*)::integer
    from private.teaching_rows() t
   where t.instructor_id = any (coalesce(p_ids, '{}'::uuid[]))
   group by t.instructor_id;
$$;

revoke all on function public.instructor_teaching_record() from public, anon;
grant execute on function public.instructor_teaching_record() to authenticated;
revoke all on function public.instructor_teaching_counts(uuid[]) from public;
grant execute on function public.instructor_teaching_counts(uuid[]) to anon, authenticated;
