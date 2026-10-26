-- #42/#48 follow-up: deciding several instructors for one request (メイン・サブ・アシスタント).
-- The live database still has the old rule "only one decided response per request"
-- (idx_instructor_responses_one_selected_per_request), so the second instructor could not be decided
-- ("duplicate key value violates unique constraint"). Role slots now limit the number per role
-- (trigger guard_role_slot_decision), so the old rule is replaced by one that only applies to
-- requests WITHOUT role slots (role_slot_id is null): there still only one instructor can be decided.

do $$
begin
  -- It may be a plain unique index or a unique constraint; drop whichever exists.
  if exists (
    select 1 from pg_constraint
     where conname = 'idx_instructor_responses_one_selected_per_request'
       and conrelid = 'public.instructor_responses'::regclass
  ) then
    alter table public.instructor_responses drop constraint idx_instructor_responses_one_selected_per_request;
  end if;
end $$;

drop index if exists public.idx_instructor_responses_one_selected_per_request;

create unique index if not exists idx_instructor_responses_one_selected_no_slot
  on public.instructor_responses (request_id)
  where is_selected and role_slot_id is null;
