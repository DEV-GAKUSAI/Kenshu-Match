-- 148_kenshu_survey_bulk_import.sql
--
-- 研修アンケート: bulk import of results that were collected outside Kenshu
-- Link (paper, a customer's own survey, past trainings). Builds on 138.
-- Additive: one new table, two new columns on the answers table, two new
-- functions, one changed rule and two small function updates (marked below).
-- Safe to run more than once.
--
-- How it works
--   * The company (for its own request) or admin uploads a file in the fixed
--     template (5 questions, 1-4, comment, 参加者 / 依頼企業, optional name).
--     The app checks the file and shows a preview; only after "confirm" it
--     calls import_training_survey_answers with the rows.
--   * All rows or none: one wrong row stops the whole import.
--   * Imported answers go in the same table (source = 'import', with a batch)
--     and count in the same averages. They never use the link limit.
--   * The same file cannot be imported twice for one survey (file hash).
--   * undo_training_survey_import hides every answer of a batch at once.
--   * Imported answers have no person behind them (no reviewer_id, no link).
--   * A company can import only from the first day of the training (the same
--     rule as the links: training_surveys.opens_at). Admin is not held back.

-- ============================================================
-- Batches
-- ============================================================

create table if not exists public.training_survey_import_batches (
    batch_id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references public.training_surveys(survey_id) on delete cascade,
    imported_by uuid not null references public.users(id) on delete restrict,
    file_hash text not null,
    file_name text,
    row_count integer not null,
    created_at timestamptz not null default now(),
    undone_at timestamptz,
    undone_by uuid references public.users(id) on delete set null,
    constraint tsib_row_count_check check (row_count between 1 and 500),
    constraint tsib_hash_length check (char_length(file_hash) between 16 and 128),
    constraint tsib_name_length check (char_length(file_name) <= 200)
);
-- the same file only once while it is active (after an undo it can be imported again)
create unique index if not exists tsib_one_active_file
  on public.training_survey_import_batches (survey_id, file_hash) where undone_at is null;
create index if not exists tsib_survey_idx on public.training_survey_import_batches (survey_id);

alter table public.training_survey_import_batches enable row level security;
revoke all on public.training_survey_import_batches from anon, authenticated;
grant select on public.training_survey_import_batches to authenticated;

drop policy if exists training_survey_import_batches_select on public.training_survey_import_batches;
create policy training_survey_import_batches_select on public.training_survey_import_batches
  for select to authenticated using (
    exists (select 1 from public.training_surveys s
            where s.survey_id = training_survey_import_batches.survey_id
              and s.requester_id = (select auth.uid()))
    or (select private.current_user_role()) = 'ADMIN');

-- ============================================================
-- Answers: where an answer came from
-- ============================================================

alter table public.training_survey_answers
  add column if not exists source text not null default 'link',
  add column if not exists batch_id uuid references public.training_survey_import_batches(batch_id) on delete restrict;

alter table public.training_survey_answers drop constraint if exists tsa_source_check;
alter table public.training_survey_answers
  add constraint tsa_source_check check (source in ('link', 'import'));

-- Changed rule: an answer is either from a link / the logged-in company (as
-- before) or imported (no person, no link, belongs to a batch).
alter table public.training_survey_answers drop constraint if exists tsa_role_shape;
alter table public.training_survey_answers
  add constraint tsa_role_shape check (
    (source = 'link' and batch_id is null and (
        (role = 'HIRER' and reviewer_id is not null and link_id is null)
        or (role = 'PARTICIPANT' and reviewer_id is null and link_id is not null)))
    or (source = 'import' and batch_id is not null and reviewer_id is null and link_id is null)
  );

-- Changed rule: the one-company-answer limit is for the real (link) answer only.
drop index if exists public.tsa_one_hirer_per_survey;
create unique index if not exists tsa_one_hirer_per_survey
  on public.training_survey_answers (survey_id) where role = 'HIRER' and source = 'link';

create index if not exists tsa_batch_idx on public.training_survey_answers (batch_id) where batch_id is not null;

-- ============================================================
-- Import (company for its own request, or admin)
-- ============================================================
-- p_rows: a JSON array of up to 500 objects:
--   {"role": "PARTICIPANT" | "HIRER", "q1".."q5": 1-4, "comment": text|null, "name": text|null}
-- Returns {"batch_id": ..., "imported": n}. Errors (all or nothing):
--   not_logged_in, request_not_found, request_not_accepted, instructor_not_found,
--   not_open (before the first training day, company only), no_rows, too_many_rows,
--   bad_row (detail: row=<n> field=<name>), bad_file_hash, duplicate_file

create or replace function public.import_training_survey_answers(
  p_request_id uuid,
  p_rows jsonb,
  p_file_hash text,
  p_file_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean;
  v_req record;
  v_survey public.training_surveys;
  v_instructor uuid;
  v_batch uuid;
  v_n integer;
  v_row jsonb;
  v_i integer;
  v_q integer;
  v_k text;
  v_role text;
  v_comment text;
  v_name text;
begin
  if v_uid is null then raise exception 'not_logged_in'; end if;
  v_is_admin := coalesce((select private.current_user_role()), '') = 'ADMIN';

  select * into v_req from public.training_requests where request_id = p_request_id;
  if not found or (v_req.requester_id <> v_uid and not v_is_admin) then raise exception 'request_not_found'; end if;
  if v_req.status not in ('accepted', 'completed') then raise exception 'request_not_accepted'; end if;

  if p_file_hash is null or char_length(p_file_hash) < 16 or char_length(p_file_hash) > 128 then
    raise exception 'bad_file_hash';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'no_rows'; end if;
  v_n := jsonb_array_length(p_rows);
  if v_n = 0 then raise exception 'no_rows'; end if;
  if v_n > 500 then raise exception 'too_many_rows'; end if;

  -- the survey is made on first use, like prepare_training_survey
  select * into v_survey from public.training_surveys where request_id = p_request_id;
  if not found then
    v_instructor := v_req.target_instructor_id;
    if v_instructor is null then
      select r.instructor_id into v_instructor
        from public.instructor_responses r
       where r.request_id = p_request_id and r.is_selected limit 1;
    end if;
    if v_instructor is null then raise exception 'instructor_not_found'; end if;
    insert into public.training_surveys (request_id, instructor_id, requester_id, max_links)
    values (p_request_id, v_instructor, v_req.requester_id,
            case when v_req.participant_count is null then 0 else ceil(v_req.participant_count * 1.2)::integer end)
    returning * into v_survey;
  end if;

  if not v_is_admin and v_survey.opens_at is not null and v_survey.opens_at > now() then
    raise exception 'not_open';
  end if;

  -- check every row first (nothing is written until all rows are fine)
  for v_i in 0 .. v_n - 1 loop
    v_row := p_rows -> v_i;
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'bad_row' using detail = format('row=%s field=row', v_i + 1);
    end if;
    v_role := v_row ->> 'role';
    if v_role is null or v_role not in ('PARTICIPANT', 'HIRER') then
      raise exception 'bad_row' using detail = format('row=%s field=role', v_i + 1);
    end if;
    foreach v_k in array array['q1', 'q2', 'q3', 'q4', 'q5'] loop
      if coalesce(jsonb_typeof(v_row -> v_k), '') <> 'number' or (v_row ->> v_k) !~ '^[1-4]$' then
        raise exception 'bad_row' using detail = format('row=%s field=%s', v_i + 1, v_k);
      end if;
    end loop;
    v_comment := nullif(btrim(v_row ->> 'comment'), '');
    if char_length(v_comment) > 1000 then
      raise exception 'bad_row' using detail = format('row=%s field=comment', v_i + 1);
    end if;
    v_name := nullif(btrim(v_row ->> 'name'), '');
    if char_length(v_name) > 40 then
      raise exception 'bad_row' using detail = format('row=%s field=name', v_i + 1);
    end if;
  end loop;

  begin
    insert into public.training_survey_import_batches (survey_id, imported_by, file_hash, file_name, row_count)
    values (v_survey.survey_id, v_uid, p_file_hash, left(nullif(btrim(p_file_name), ''), 200), v_n)
    returning batch_id into v_batch;
  exception when unique_violation then
    raise exception 'duplicate_file';
  end;

  insert into public.training_survey_answers
    (survey_id, role, source, batch_id, q1, q2, q3, q4, q5, comment, is_anonymous, display_name)
  select v_survey.survey_id,
         e ->> 'role',
         'import',
         v_batch,
         (e ->> 'q1')::smallint, (e ->> 'q2')::smallint, (e ->> 'q3')::smallint,
         (e ->> 'q4')::smallint, (e ->> 'q5')::smallint,
         nullif(btrim(e ->> 'comment'), ''),
         nullif(btrim(e ->> 'name'), '') is null,
         nullif(btrim(e ->> 'name'), '')
    from jsonb_array_elements(p_rows) as e;

  return jsonb_build_object('batch_id', v_batch, 'imported', v_n);
end;
$$;

-- ============================================================
-- Undo a whole import (the importer or admin)
-- ============================================================

create or replace function public.undo_training_survey_import(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean;
  v_batch public.training_survey_import_batches;
begin
  if v_uid is null then raise exception 'not_logged_in'; end if;
  v_is_admin := coalesce((select private.current_user_role()), '') = 'ADMIN';

  select b.* into v_batch
    from public.training_survey_import_batches b
    join public.training_surveys s on s.survey_id = b.survey_id
   where b.batch_id = p_batch_id
     and (s.requester_id = v_uid or v_is_admin)
   for update of b;
  if not found then raise exception 'batch_not_found'; end if;
  if v_batch.undone_at is not null then return; end if;

  update public.training_survey_import_batches
     set undone_at = now(), undone_by = v_uid
   where batch_id = p_batch_id;
  update public.training_survey_answers set is_hidden = true where batch_id = p_batch_id;
end;
$$;

-- ============================================================
-- Two small updates to functions from 138
-- ============================================================

-- The company's own answer: an imported 依頼企業 row must not count as "already answered".
create or replace function public.submit_training_survey_hirer_answer(
  p_request_id uuid,
  p_q1 integer, p_q2 integer, p_q3 integer, p_q4 integer, p_q5 integer,
  p_comment text default null,
  p_is_anonymous boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req record;
  v_survey public.training_surveys;
  v_instructor uuid;
  v_comment text := nullif(btrim(p_comment), '');
begin
  if v_uid is null then raise exception 'not_logged_in'; end if;
  if p_q1 is null or p_q2 is null or p_q3 is null or p_q4 is null or p_q5 is null
     or least(p_q1, p_q2, p_q3, p_q4, p_q5) < 1 or greatest(p_q1, p_q2, p_q3, p_q4, p_q5) > 4 then
    raise exception 'answers_required';
  end if;
  if char_length(v_comment) > 1000 then raise exception 'comment_too_long'; end if;

  select * into v_req from public.training_requests where request_id = p_request_id;
  if not found or v_req.requester_id <> v_uid then raise exception 'request_not_found'; end if;
  if v_req.status <> 'completed' then raise exception 'request_not_completed'; end if;

  select * into v_survey from public.training_surveys where request_id = p_request_id;
  if not found then
    v_instructor := v_req.target_instructor_id;
    if v_instructor is null then
      select r.instructor_id into v_instructor
        from public.instructor_responses r
       where r.request_id = p_request_id and r.is_selected limit 1;
    end if;
    if v_instructor is null then raise exception 'instructor_not_found'; end if;
    insert into public.training_surveys (request_id, instructor_id, requester_id, max_links)
    values (p_request_id, v_instructor, v_uid,
            case when v_req.participant_count is null then 0 else ceil(v_req.participant_count * 1.2)::integer end)
    returning * into v_survey;
  end if;

  if exists (select 1 from public.training_survey_answers
              where survey_id = v_survey.survey_id and role = 'HIRER' and source = 'link') then
    return jsonb_build_object('state', 'used');
  end if;

  insert into public.training_survey_answers
    (survey_id, role, reviewer_id, q1, q2, q3, q4, q5, comment, is_anonymous)
  values
    (v_survey.survey_id, 'HIRER', v_uid, p_q1, p_q2, p_q3, p_q4, p_q5, v_comment, coalesce(p_is_anonymous, true));

  return jsonb_build_object('state', 'ok');
end;
$$;

-- Admin: an answer of an undone import cannot be shown again by accident.
create or replace function public.admin_set_survey_answer_hidden(p_answer_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select private.current_user_role()), '') <> 'ADMIN' then raise exception 'admin_only'; end if;
  if coalesce(p_hidden, true) = false and exists (
       select 1 from public.training_survey_answers a
         join public.training_survey_import_batches b on b.batch_id = a.batch_id
        where a.answer_id = p_answer_id and b.undone_at is not null) then
    raise exception 'batch_undone';
  end if;
  update public.training_survey_answers set is_hidden = coalesce(p_hidden, true) where answer_id = p_answer_id;
  if not found then raise exception 'answer_not_found'; end if;
end;
$$;

revoke all on function public.import_training_survey_answers(uuid, jsonb, text, text) from public, anon;
revoke all on function public.undo_training_survey_import(uuid) from public, anon;
grant execute on function public.import_training_survey_answers(uuid, jsonb, text, text) to authenticated;
grant execute on function public.undo_training_survey_import(uuid) to authenticated;
grant execute on function public.submit_training_survey_hirer_answer(uuid, integer, integer, integer, integer, integer, text, boolean) to authenticated;
grant execute on function public.admin_set_survey_answer_hidden(uuid, boolean) to authenticated;

-- ============================================================
-- Rating summary: show how many answers were imported (a new last column)
-- ============================================================

create or replace view public.instructor_survey_summary as
 select s.instructor_id,
        count(a.answer_id)::integer as answer_count,
        round(avg((a.q1 + a.q2 + a.q3 + a.q4 + a.q5) / 5.0), 2) as overall_avg,
        round(avg(a.q1), 2) as q1_avg,
        round(avg(a.q2), 2) as q2_avg,
        round(avg(a.q3), 2) as q3_avg,
        round(avg(a.q4), 2) as q4_avg,
        round(avg(a.q5), 2) as q5_avg,
        (count(a.answer_id) filter (where a.role = 'PARTICIPANT'))::integer as participant_count,
        round(avg((a.q1 + a.q2 + a.q3 + a.q4 + a.q5) / 5.0) filter (where a.role = 'PARTICIPANT'), 2) as participant_avg,
        (count(a.answer_id) filter (where a.role = 'HIRER'))::integer as hirer_count,
        round(avg((a.q1 + a.q2 + a.q3 + a.q4 + a.q5) / 5.0) filter (where a.role = 'HIRER'), 2) as hirer_avg,
        (select count(*) from public.training_survey_links l
           join public.training_surveys s2 on s2.survey_id = l.survey_id
          where s2.instructor_id = s.instructor_id)::integer as links_issued,
        (count(a.answer_id) filter (where a.source = 'import'))::integer as imported_count
   from public.training_surveys s
   join public.training_survey_answers a on a.survey_id = s.survey_id and not a.is_hidden
   join public.instructor_profiles ip on ip.id = s.instructor_id
   join public.users u on u.id = s.instructor_id
  where ip.is_public = true and u.status = 'ACTIVE'
  group by s.instructor_id;

grant select on public.instructor_survey_summary to anon, authenticated;
