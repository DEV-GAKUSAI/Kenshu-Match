-- One Mine person receives a dedicated Kenshu instructor identity. Mine and
-- Kenshu use different Supabase projects, so the Mine UUID is intentionally
-- not a foreign key. Tokens are signed by Mine and every nonce is consumed
-- once here before a Kenshu session is created.
create table if not exists public.mine_kenshu_account_links (
  mine_user_id uuid primary key,
  kenshu_user_id uuid not null unique references public.users(id) on delete cascade,
  mine_email text not null,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.mine_kenshu_sso_nonces (
  token_digest text primary key,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default clock_timestamp()
);

alter table public.mine_kenshu_account_links enable row level security;
alter table public.mine_kenshu_sso_nonces enable row level security;

revoke all on public.mine_kenshu_account_links from public, anon, authenticated;
revoke all on public.mine_kenshu_sso_nonces from public, anon, authenticated;
grant select, insert, update, delete on public.mine_kenshu_account_links to service_role;
grant select, insert, update, delete on public.mine_kenshu_sso_nonces to service_role;

create index if not exists mine_kenshu_sso_nonces_expires_idx
  on public.mine_kenshu_sso_nonces (expires_at);
