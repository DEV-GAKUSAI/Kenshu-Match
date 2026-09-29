-- Remembers which instructor_expertise rows were added automatically from a
-- person's Mine skills. On the next Mine handoff only those rows may be
-- removed (when the Mine skill is gone); expertise the instructor added by
-- hand in Kenshu Link is never listed here and is never touched.
create table if not exists public.mine_kenshu_synced_expertise (
  kenshu_user_id uuid not null references public.users(id) on delete cascade,
  subcategory_id uuid not null references public.training_subcategories(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (kenshu_user_id, subcategory_id)
);

alter table public.mine_kenshu_synced_expertise enable row level security;
revoke all on public.mine_kenshu_synced_expertise from public, anon, authenticated;
grant select, insert, update, delete on public.mine_kenshu_synced_expertise to service_role;
