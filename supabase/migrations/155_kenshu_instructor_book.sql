-- 155_kenshu_instructor_book.sql
--
-- #55 自社内の講師評価・選定メモ / #57 既存講師台帳と候補リスト
--
-- A private book for each company: for a registered instructor (instructor_id) or
-- for a person who is not on Kenshu Link (external_name / external_contact) it
-- keeps a list (candidate / regular), a private rating and a private note.
-- Only the owner can see or change a row; instructors and other companies never can.
-- Additive, safe to run more than once.

create table if not exists public.requester_instructor_book (
  entry_id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  instructor_id uuid references public.users(id) on delete cascade,
  external_name text,
  external_contact text,
  list_kind text not null default 'candidate' check (list_kind in ('candidate', 'regular')),
  rating smallint check (rating is null or rating between 1 and 5),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requester_book_one_target check (
    (instructor_id is not null and external_name is null)
    or (instructor_id is null and external_name is not null and char_length(btrim(external_name)) between 1 and 80)
  ),
  constraint requester_book_external_contact_len check (external_contact is null or char_length(external_contact) <= 200)
);

create unique index if not exists requester_book_unique_instructor
  on public.requester_instructor_book (requester_id, instructor_id) where instructor_id is not null;
create index if not exists requester_book_requester_idx
  on public.requester_instructor_book (requester_id, list_kind, updated_at desc);

alter table public.requester_instructor_book enable row level security;

drop policy if exists requester_book_owner_select on public.requester_instructor_book;
create policy requester_book_owner_select on public.requester_instructor_book
  for select to authenticated using (requester_id = (select auth.uid()));

drop policy if exists requester_book_owner_insert on public.requester_instructor_book;
create policy requester_book_owner_insert on public.requester_instructor_book
  for insert to authenticated with check (
    requester_id = (select auth.uid())
    and (select private.current_user_role()) in ('COMPANY', 'INDIVIDUAL')
  );

drop policy if exists requester_book_owner_update on public.requester_instructor_book;
create policy requester_book_owner_update on public.requester_instructor_book
  for update to authenticated using (requester_id = (select auth.uid())) with check (requester_id = (select auth.uid()));

drop policy if exists requester_book_owner_delete on public.requester_instructor_book;
create policy requester_book_owner_delete on public.requester_instructor_book
  for delete to authenticated using (requester_id = (select auth.uid()));

revoke all on public.requester_instructor_book from anon;
grant select, insert, update, delete on public.requester_instructor_book to authenticated;

create or replace function private.requester_book_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists requester_book_touch on public.requester_instructor_book;
create trigger requester_book_touch
  before update on public.requester_instructor_book
  for each row execute function private.requester_book_touch();
