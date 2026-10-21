-- 152_kenshu_request_money.sql
--
-- #41 案件の金額 / #44 登壇料・経費・支払条件
--
-- The request form asked for one number ("想定予算（時間あたり）") and the pages
-- showed it as a bare "予算 ¥100,000". This adds what the price means:
--   budget_unit   hour | day | total      (default hour = how old requests were)
--   tax_mode      included | excluded | unspecified
--   transport_cost / lodging_cost   company | included | none | unspecified
--   prep_cost     included | extra | unspecified   (準備・事前打合せ)
--   payment_terms free text (支払条件)
-- An instructor's quote uses the unit of the request (copied by a trigger) and
-- carries its own tax_mode. Old rows keep working (defaults). Additive and safe
-- to run more than once.

alter table public.training_requests
  add column if not exists budget_unit text not null default 'hour',
  add column if not exists tax_mode text not null default 'unspecified',
  add column if not exists transport_cost text not null default 'unspecified',
  add column if not exists lodging_cost text not null default 'unspecified',
  add column if not exists prep_cost text not null default 'unspecified',
  add column if not exists payment_terms text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_requests_budget_unit_check') then
    alter table public.training_requests add constraint training_requests_budget_unit_check
      check (budget_unit in ('hour', 'day', 'total'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_requests_tax_mode_check') then
    alter table public.training_requests add constraint training_requests_tax_mode_check
      check (tax_mode in ('included', 'excluded', 'unspecified'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_requests_transport_cost_check') then
    alter table public.training_requests add constraint training_requests_transport_cost_check
      check (transport_cost in ('company', 'included', 'none', 'unspecified'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_requests_lodging_cost_check') then
    alter table public.training_requests add constraint training_requests_lodging_cost_check
      check (lodging_cost in ('company', 'included', 'none', 'unspecified'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_requests_prep_cost_check') then
    alter table public.training_requests add constraint training_requests_prep_cost_check
      check (prep_cost in ('included', 'extra', 'unspecified'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_requests_payment_terms_len') then
    alter table public.training_requests add constraint training_requests_payment_terms_len
      check (payment_terms is null or char_length(payment_terms) <= 300);
  end if;
end $$;

-- A quote carries the unit of its request and its own tax mode.
alter table public.instructor_responses
  add column if not exists quote_unit text,
  add column if not exists quote_tax_mode text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'instructor_responses_quote_unit_check') then
    alter table public.instructor_responses add constraint instructor_responses_quote_unit_check
      check (quote_unit is null or quote_unit in ('hour', 'day', 'total'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'instructor_responses_quote_tax_check') then
    alter table public.instructor_responses add constraint instructor_responses_quote_tax_check
      check (quote_tax_mode is null or quote_tax_mode in ('included', 'excluded'));
  end if;
end $$;

-- Existing quotes were all "per hour".
update public.instructor_responses set quote_unit = 'hour' where quote_price > 0 and quote_unit is null;

-- New quotes copy the unit of their request.
create or replace function private.instructor_responses_set_quote_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quote_price is not null then
    select r.budget_unit into new.quote_unit from public.training_requests r where r.request_id = new.request_id;
    if new.quote_unit is null then new.quote_unit := 'hour'; end if;
  else
    new.quote_unit := null;
    new.quote_tax_mode := null;
  end if;
  return new;
end;
$$;

drop trigger if exists instructor_responses_set_quote_unit on public.instructor_responses;
create trigger instructor_responses_set_quote_unit
  before insert on public.instructor_responses
  for each row execute function private.instructor_responses_set_quote_unit();

-- The public preview shows the same money information (new columns at the end).
create or replace view public.open_requests_public_preview as
 select request_id,
    title,
    description,
    requester_type,
    preferred_format,
    budget,
    location,
    preferred_schedule,
    expertise_field,
    participant_count,
    created_at,
    budget_unit,
    tax_mode,
    transport_cost,
    lodging_cost,
    prep_cost,
    payment_terms
   from public.training_requests tr
  where status = 'pending' and target_instructor_id is null;
