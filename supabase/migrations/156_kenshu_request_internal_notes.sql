-- 156_kenshu_request_internal_notes.sql
--
-- #46 公開範囲と社内項目 (internal part) / #47 担当者
-- Internal-only items of a request: person in charge and an internal memo. They are
-- kept in their own table (not on training_requests) because instructors can read
-- training_requests rows; this table can only be read and changed by the company
-- that owns the request. Additive, safe to run more than once.

create table if not exists public.request_internal_notes (
  request_id uuid primary key references public.training_requests(request_id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  owner_name text check (owner_name is null or char_length(owner_name) <= 80),
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  updated_at timestamptz not null default now()
);

alter table public.request_internal_notes enable row level security;

drop policy if exists request_internal_notes_owner_all on public.request_internal_notes;
create policy request_internal_notes_owner_all on public.request_internal_notes
  for all to authenticated
  using (requester_id = (select auth.uid()))
  with check (
    requester_id = (select auth.uid())
    and exists (select 1 from public.training_requests tr
                 where tr.request_id = request_internal_notes.request_id and tr.requester_id = (select auth.uid()))
  );

revoke all on public.request_internal_notes from anon;
grant select, insert, update, delete on public.request_internal_notes to authenticated;
