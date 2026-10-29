-- 195_kenshu_fee_payments.sql
--
-- #65 料金設定 stage 1 (TEST MODE ONLY): records for the ¥1,100 (tax included) fee, paid by card on Stripe's hosted page.
--  * fee_settings: one row holding the amount. The browser never sends the amount; the server reads it from here.
--  * fee_payments: one row per payment attempt. Written only by the server (service role); a person can read their own rows,
--    an ADMIN can read all.
--  * stripe_events: remembers every Stripe event id so the same message is never processed twice. No one can read it from the browser.
-- Nothing here changes how "apply" or "contact" work today (that is stage 2). Additive, safe to run more than once.

create table if not exists public.fee_settings (
  id boolean primary key default true check (id),
  amount_yen integer not null check (amount_yen > 0),
  currency text not null default 'jpy' check (currency = 'jpy'),
  updated_at timestamptz not null default now()
);

insert into public.fee_settings (id, amount_yen) values (true, 1100) on conflict (id) do nothing;

alter table public.fee_settings enable row level security;

drop policy if exists fee_settings_read on public.fee_settings;
create policy fee_settings_read on public.fee_settings for select to authenticated using (true);

revoke all on public.fee_settings from anon;
grant select on public.fee_settings to authenticated;

create table if not exists public.fee_payments (
  payment_id uuid primary key default gen_random_uuid(),
  payer_id uuid not null references public.users(id) on delete restrict,
  -- 'test' = the admin test button (stage 1). 'apply' / 'contact' are used from stage 2.
  kind text not null check (kind in ('test', 'apply', 'contact')),
  amount_yen integer not null check (amount_yen > 0),
  currency text not null default 'jpy' check (currency = 'jpy'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'mismatch')),
  -- what the fee was for (stage 2). No foreign keys yet on purpose.
  request_id uuid,
  instructor_id uuid,
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists fee_payments_payer_idx on public.fee_payments (payer_id, created_at desc);

alter table public.fee_payments enable row level security;

drop policy if exists fee_payments_own_or_admin_select on public.fee_payments;
create policy fee_payments_own_or_admin_select on public.fee_payments
  for select to authenticated using (
    payer_id = (select auth.uid()) or (select private.current_user_role()) = 'ADMIN'
  );

-- No insert/update/delete policy: only the server (service role) writes.
revoke all on public.fee_payments from anon;
revoke insert, update, delete on public.fee_payments from authenticated;
grant select on public.fee_payments to authenticated;

create table if not exists public.stripe_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;
