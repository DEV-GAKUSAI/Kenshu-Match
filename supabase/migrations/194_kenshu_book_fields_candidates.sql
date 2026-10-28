-- 194_kenshu_book_fields_candidates.sql
--
-- #57 (sheet row 68): 自社の講師台帳 gets its own fields, a favourite mark, and a candidate list per request.
--
--  * requester_instructor_book: 得意領域 (研修分野 ids), 過去単価 (amount + unit), 登壇実績 (text), お気に入り.
--  * request_candidates: which ledger entries a company picked as candidates for one request (company only).
--
-- Everything stays private to the company. Additive, safe to run more than once.

alter table public.requester_instructor_book
  add column if not exists strength_field_ids uuid[] not null default '{}',
  add column if not exists past_rate_amount integer,
  add column if not exists past_rate_unit text,
  add column if not exists speaking_record text,
  add column if not exists is_favorite boolean not null default false;

alter table public.requester_instructor_book
  drop constraint if exists requester_book_strengths_count,
  drop constraint if exists requester_book_past_rate_range,
  drop constraint if exists requester_book_past_rate_unit_check,
  drop constraint if exists requester_book_past_rate_pair,
  drop constraint if exists requester_book_speaking_len;

alter table public.requester_instructor_book
  add constraint requester_book_strengths_count check (cardinality(strength_field_ids) <= 20),
  add constraint requester_book_past_rate_range check (past_rate_amount is null or past_rate_amount between 0 and 10000000),
  add constraint requester_book_past_rate_unit_check check (past_rate_unit is null or past_rate_unit in ('hour', 'day', 'total')),
  -- an amount needs its unit, and a unit needs an amount
  add constraint requester_book_past_rate_pair check ((past_rate_amount is null) = (past_rate_unit is null)),
  add constraint requester_book_speaking_len check (speaking_record is null or char_length(speaking_record) <= 1000);

create index if not exists requester_book_favorite_idx
  on public.requester_instructor_book (requester_id, is_favorite) where is_favorite;

-- Candidates of one request ---------------------------------------------------

create table if not exists public.request_candidates (
  request_id uuid not null references public.training_requests(request_id) on delete cascade,
  entry_id uuid not null references public.requester_instructor_book(entry_id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, entry_id)
);

create index if not exists request_candidates_requester_idx on public.request_candidates (requester_id, request_id);

alter table public.request_candidates enable row level security;

drop policy if exists request_candidates_owner_select on public.request_candidates;
create policy request_candidates_owner_select on public.request_candidates
  for select to authenticated using (requester_id = (select auth.uid()));

-- Only the owner of both the request and the ledger entry can add a candidate.
drop policy if exists request_candidates_owner_insert on public.request_candidates;
create policy request_candidates_owner_insert on public.request_candidates
  for insert to authenticated with check (
    requester_id = (select auth.uid())
    and exists (
      select 1 from public.training_requests r
       where r.request_id = request_candidates.request_id and r.requester_id = (select auth.uid())
    )
    and exists (
      select 1 from public.requester_instructor_book b
       where b.entry_id = request_candidates.entry_id and b.requester_id = (select auth.uid())
    )
  );

drop policy if exists request_candidates_owner_delete on public.request_candidates;
create policy request_candidates_owner_delete on public.request_candidates
  for delete to authenticated using (requester_id = (select auth.uid()));

revoke all on public.request_candidates from anon;
grant select, insert, delete on public.request_candidates to authenticated;
