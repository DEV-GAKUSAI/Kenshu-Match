-- 187_kenshu_partner_accounts.sql
--
-- #53 partner company accounts (the senior's answer 10/23: partner companies log in to Kenshu Link).
-- A partner company is an ordinary COMPANY account. The company that owns a request links a partner
-- record to the partner's own account with a one-time invitation code. The partner then sees only the
-- basics of the requests where it is the contract party or sits in between, and can propose a lecturer.
--
--   * requester_partners.account_id        the partner's own account (set only by the functions below)
--   * partner_invites                      one-time codes (7 days), no direct access from the app
--   * request_flows.show_amount_to_partners  default off; the company switches it on per request
--   * partner_proposals                    lecturer proposals from a partner (read-only for the app)
--   * functions (all security definer, logged-in users only):
--       create_partner_invite / get_partner_invite / accept_partner_invite
--       unlink_partner / leave_partner
--       partner_my_links / partner_requests
--       partner_propose_lecturer / partner_withdraw_proposal / decide_partner_proposal
--
-- Existing row-level rules are NOT loosened: a partner reads only through partner_requests().
-- Internal memos (request_internal_notes) are never part of it. Additive, safe to run more than once.

create schema if not exists private;

-- 1. Link column + guard (the link can only be set by the functions below) -------------------------

alter table public.requester_partners
  add column if not exists account_id uuid references public.users(id) on delete set null;
create index if not exists requester_partners_account_idx
  on public.requester_partners (account_id) where account_id is not null;

create or replace function private.guard_partner_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('kenshu.partner_link', true), '') = 'on' then
    return new;
  end if;
  -- removing a link is always fine (also the automatic clean-up when an account is deleted)
  if new.account_id is not null
     and (tg_op = 'INSERT' or new.account_id is distinct from old.account_id) then
    raise exception 'account_link_forbidden';
  end if;
  return new;
end;
$$;

drop trigger if exists requester_partners_guard_account on public.requester_partners;
create trigger requester_partners_guard_account
  before insert or update on public.requester_partners
  for each row execute function private.guard_partner_account();

alter table public.request_flows
  add column if not exists show_amount_to_partners boolean not null default false;

-- 2. Invitation codes --------------------------------------------------------------------------------

create table if not exists public.partner_invites (
  invite_id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.requester_partners(partner_id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists partner_invites_partner_idx on public.partner_invites (partner_id, created_at desc);

create table if not exists public.partner_invite_fails (
  user_id uuid not null references public.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists partner_invite_fails_idx on public.partner_invite_fails (user_id, at desc);

alter table public.partner_invites enable row level security;
alter table public.partner_invite_fails enable row level security;
revoke all on public.partner_invites, public.partner_invite_fails from anon, authenticated;

-- 8 characters from an alphabet without 0/O/1/I/L (about 1e12 combinations).
create or replace function private.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_code text := '';
  i integer;
begin
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
  end loop;
  return v_code;
end;
$$;

create or replace function public.create_partner_invite(p_partner_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.requester_partners%rowtype;
  v_code text;
  v_tries integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_p from public.requester_partners where partner_id = p_partner_id and requester_id = v_uid;
  if not found then raise exception 'not_found'; end if;
  if v_p.kind <> 'company' then raise exception 'not_a_company'; end if;
  -- one active code per partner: a new one cancels the old one
  update public.partner_invites i set expires_at = now()
   where i.partner_id = p_partner_id and i.used_at is null and i.expires_at > now();
  loop
    v_code := private.new_invite_code();
    begin
      insert into public.partner_invites (partner_id, requester_id, code, expires_at)
      values (p_partner_id, v_uid, v_code, now() + interval '7 days');
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries > 5 then raise; end if;
    end;
  end loop;
  return query select v_code, now() + interval '7 days';
end;
$$;

create or replace function public.get_partner_invite(p_partner_id uuid)
returns table (code text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.code, i.expires_at
    from public.partner_invites i
   where i.partner_id = p_partner_id
     and i.requester_id = auth.uid()
     and i.used_at is null
     and i.expires_at > now()
   order by i.created_at desc
   limit 1;
$$;

create or replace function public.accept_partner_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv public.partner_invites%rowtype;
  v_company text;
  v_partner text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select u.role into v_role from public.users u where u.id = v_uid;
  if v_role is distinct from 'COMPANY' then raise exception 'not_company'; end if;

  if (select count(*) from public.partner_invite_fails f where f.user_id = v_uid and f.at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  select * into v_inv from public.partner_invites where code = v_code for update;
  if not found or char_length(v_code) <> 8 then
    insert into public.partner_invite_fails (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  if v_inv.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'code_used'); end if;
  if v_inv.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'code_expired'); end if;
  if v_inv.requester_id = v_uid then return jsonb_build_object('ok', false, 'reason', 'own_code'); end if;

  perform set_config('kenshu.partner_link', 'on', true);
  update public.requester_partners set account_id = v_uid where partner_id = v_inv.partner_id;
  perform set_config('kenshu.partner_link', 'off', true);
  update public.partner_invites set used_at = now(), used_by = v_uid where invite_id = v_inv.invite_id;

  select coalesce(nullif(rp.company_name, ''), u.name), p.name
    into v_company, v_partner
    from public.requester_partners p
    join public.users u on u.id = p.requester_id
    left join public.requester_profiles rp on rp.id = p.requester_id
   where p.partner_id = v_inv.partner_id;
  return jsonb_build_object('ok', true, 'company_name', v_company, 'partner_name', v_partner);
end;
$$;

create or replace function public.unlink_partner(p_partner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.requester_partners where partner_id = p_partner_id and requester_id = auth.uid()) then
    raise exception 'not_found';
  end if;
  update public.requester_partners set account_id = null where partner_id = p_partner_id;
end;
$$;

create or replace function public.leave_partner(p_partner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.requester_partners where partner_id = p_partner_id and account_id = auth.uid()) then
    raise exception 'not_found';
  end if;
  update public.requester_partners set account_id = null where partner_id = p_partner_id;
end;
$$;

-- Proposals table (needed by partner_requests below)
create table if not exists public.partner_proposals (
  proposal_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.training_requests(request_id) on delete cascade,
  partner_id uuid not null references public.requester_partners(partner_id) on delete cascade,
  proposer_id uuid not null references public.users(id) on delete cascade,
  lecturer_name text not null check (char_length(lecturer_name) between 1 and 100),
  instructor_id uuid references public.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'accepted', 'passed', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists partner_proposals_request_idx on public.partner_proposals (request_id, created_at desc);
create index if not exists partner_proposals_proposer_idx on public.partner_proposals (proposer_id, created_at desc);

alter table public.partner_proposals enable row level security;
drop policy if exists partner_proposals_read on public.partner_proposals;
create policy partner_proposals_read on public.partner_proposals
  for select to authenticated
  using (
    proposer_id = (select auth.uid())
    or exists (select 1 from public.training_requests r
                where r.request_id = partner_proposals.request_id and r.requester_id = (select auth.uid()))
  );
revoke all on public.partner_proposals from anon, authenticated;
grant select on public.partner_proposals to authenticated;

-- 3. What the partner sees ------------------------------------------------------------------------

-- The companies that linked me as their partner.
create or replace function public.partner_my_links()
returns table (partner_id uuid, company_name text, partner_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.partner_id,
         coalesce(nullif(rp.company_name, ''), u.name) as company_name,
         p.name as partner_name
    from public.requester_partners p
    join public.users u on u.id = p.requester_id
    left join public.requester_profiles rp on rp.id = p.requester_id
   where p.account_id = auth.uid()
   order by p.created_at desc;
$$;

-- Requests where one of my partner records is the contract party or sits in between.
-- Amounts are included only when the company switched them on for that request. No memos.
create or replace function public.partner_requests()
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
  created_at timestamptz
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
         f.show_amount_to_partners,
         case when f.show_amount_to_partners then jsonb_build_object(
           'budget', r.budget, 'budget_unit', r.budget_unit, 'budget_mode', r.budget_mode, 'budget_max', r.budget_max,
           'prep_amount', r.prep_amount, 'pretraining_amount', r.pretraining_amount, 'tax_mode', r.tax_mode,
           'transport_cost', r.transport_cost, 'lodging_cost', r.lodging_cost, 'prep_cost', r.prep_cost,
           'payment_terms', r.payment_terms) else null end,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'proposal_id', pp.proposal_id, 'lecturer_name', pp.lecturer_name, 'instructor_id', pp.instructor_id,
                     'note', pp.note, 'status', pp.status, 'created_at', pp.created_at) order by pp.created_at desc)
                    from public.partner_proposals pp
                   where pp.request_id = r.request_id and pp.proposer_id = auth.uid()), '[]'::jsonb),
         r.created_at
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
   where auth.uid() is not null
     and r.publish_state <> 'draft'
   order by r.created_at desc;
$$;

-- 4. Lecturer proposals ---------------------------------------------------------------------------

create or replace function public.partner_propose_lecturer(
  p_request_id uuid, p_name text, p_instructor_id uuid default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_partner uuid;
  v_status text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select mp.partner_id, r.status into v_partner, v_status
    from public.request_flows f
    join public.training_requests r on r.request_id = f.request_id
    cross join lateral (
      select p.partner_id from public.requester_partners p
       where p.account_id = v_uid and p.requester_id = r.requester_id
         and (p.partner_id = f.contract_partner_id or p.partner_id = any (f.via_partner_ids))
       limit 1) mp
   where f.request_id = p_request_id and r.publish_state <> 'draft';
  if v_partner is null then raise exception 'not_found'; end if;
  if v_status in ('cancelled', 'completed') then raise exception 'request_closed'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 100 then raise exception 'bad_name'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'bad_note'; end if;
  if p_instructor_id is not null
     and not exists (select 1 from public.instructor_profiles ip where ip.id = p_instructor_id) then
    raise exception 'not_an_instructor';
  end if;
  if (select count(*) from public.partner_proposals pp
       where pp.request_id = p_request_id and pp.proposer_id = v_uid and pp.status = 'new') >= 10 then
    raise exception 'too_many';
  end if;
  insert into public.partner_proposals (request_id, partner_id, proposer_id, lecturer_name, instructor_id, note)
  values (p_request_id, v_partner, v_uid, v_name, p_instructor_id, v_note)
  returning proposal_id into v_id;
  return v_id;
end;
$$;

create or replace function public.partner_withdraw_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.partner_proposals set status = 'withdrawn', decided_at = now()
   where proposal_id = p_proposal_id and proposer_id = auth.uid() and status = 'new';
  if not found then raise exception 'not_found'; end if;
end;
$$;

-- The company adopts (採用) or passes on (見送る) a proposal.
-- Adopting sets the request's 登壇講師 in the 商流, unless the request has several roles
-- (then it is only marked as adopted). Returns 'speaker_set' or 'noted'.
create or replace function public.decide_partner_proposal(p_proposal_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pp public.partner_proposals%rowtype;
  v_req public.training_requests%rowtype;
  v_speaker uuid;
  v_slots integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_pp from public.partner_proposals where proposal_id = p_proposal_id for update;
  if not found then raise exception 'not_found'; end if;
  select * into v_req from public.training_requests where request_id = v_pp.request_id;
  if not found or v_req.requester_id <> v_uid then raise exception 'not_found'; end if;
  if v_pp.status <> 'new' then raise exception 'already_decided'; end if;

  if not p_accept then
    update public.partner_proposals set status = 'passed', decided_at = now() where proposal_id = p_proposal_id;
    return 'noted';
  end if;

  v_slots := case when jsonb_typeof(v_req.role_slots) = 'array' then jsonb_array_length(v_req.role_slots) else 0 end;
  -- an earlier adopted proposal of this request is replaced
  update public.partner_proposals set status = 'passed', decided_at = now()
   where request_id = v_pp.request_id and status = 'accepted';
  update public.partner_proposals set status = 'accepted', decided_at = now() where proposal_id = p_proposal_id;
  if v_slots > 0 then return 'noted'; end if;

  if v_pp.instructor_id is not null then
    select partner_id into v_speaker from public.requester_partners
     where requester_id = v_uid and kind = 'instructor' and instructor_id = v_pp.instructor_id
     order by created_at limit 1;
    if v_speaker is null then
      insert into public.requester_partners (requester_id, name, kind, note, instructor_id)
      values (v_uid, v_pp.lecturer_name, 'instructor', '関係先からの提案で追加', v_pp.instructor_id)
      returning partner_id into v_speaker;
    end if;
    insert into public.request_flows (request_id, requester_id, speaker_partner_id, speaker_name)
    values (v_pp.request_id, v_uid, v_speaker, null)
    on conflict (request_id) do update set speaker_partner_id = excluded.speaker_partner_id, speaker_name = null, updated_at = now();
  else
    insert into public.request_flows (request_id, requester_id, speaker_partner_id, speaker_name)
    values (v_pp.request_id, v_uid, null, v_pp.lecturer_name)
    on conflict (request_id) do update set speaker_partner_id = null, speaker_name = excluded.speaker_name, updated_at = now();
  end if;
  return 'speaker_set';
end;
$$;

-- 5. Permissions --------------------------------------------------------------------------------------

revoke all on function public.create_partner_invite(uuid), public.get_partner_invite(uuid),
  public.accept_partner_invite(text), public.unlink_partner(uuid), public.leave_partner(uuid),
  public.partner_my_links(), public.partner_requests(),
  public.partner_propose_lecturer(uuid, text, uuid, text), public.partner_withdraw_proposal(uuid),
  public.decide_partner_proposal(uuid, boolean) from public, anon;
grant execute on function public.create_partner_invite(uuid), public.get_partner_invite(uuid),
  public.accept_partner_invite(text), public.unlink_partner(uuid), public.leave_partner(uuid),
  public.partner_my_links(), public.partner_requests(),
  public.partner_propose_lecturer(uuid, text, uuid, text), public.partner_withdraw_proposal(uuid),
  public.decide_partner_proposal(uuid, boolean) to authenticated;
