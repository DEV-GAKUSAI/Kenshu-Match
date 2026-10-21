-- 149_kenshu_past_trainings.sql
--
-- 研修アンケート: trainings that were never in Kenshu Link (sheet #38, case
-- "evaluations of past trainings"). Builds on 138 and 148.
-- Additive: one new table, one new column on training_surveys (and its request
-- column may now be empty), two new functions. Safe to run more than once.
--
-- How it works
--   * Only admin creates a "past training" (title, the day it was held, the
--     instructor, optional company name). No company can register one, so
--     nobody can put results on an instructor they never worked with.
--   * The record gets its own survey (training_surveys.past_training_id
--     instead of request_id), so the existing answers table, the averages,
--     the comments view, undo and the admin screen all work unchanged.
--   * Results are imported with admin_import_past_training_answers: the same
--     rows and the same checks as import_training_survey_answers (all rows or
--     none, 500 rows, file hash, one batch that can be undone with
--     undo_training_survey_import). Imported answers count in the rating.
--   * Past trainings never appear in any request list.

-- ============================================================
-- Past trainings
-- ============================================================

create table if not exists public.past_trainings (
    past_training_id uuid primary key default gen_random_uuid(),
    instructor_id uuid not null references public.users(id) on delete restrict,
    title text not null,
    held_on date not null,
    company_name text,
    created_by uuid not null references public.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint past_trainings_title_check check (char_length(btrim(title)) between 1 and 120),
    constraint past_trainings_company_check check (company_name is null or char_length(company_name) <= 80)
);

create index if not exists past_trainings_instructor_idx on public.past_trainings (instructor_id);

alter table public.past_trainings enable row level security;
revoke all on public.past_trainings from anon, authenticated;
grant select on public.past_trainings to authenticated;

drop policy if exists past_trainings_select on public.past_trainings;
create policy past_trainings_select on public.past_trainings
  for select to authenticated using ((select private.current_user_role()) = 'ADMIN');

-- ============================================================
-- A survey can belong to a past training instead of a request
-- ============================================================

alter table public.training_surveys alter column request_id drop not null;
alter table public.training_surveys
  add column if not exists past_training_id uuid unique references public.past_trainings(past_training_id) on delete restrict;

alter table public.training_surveys drop constraint if exists training_surveys_one_owner;
alter table public.training_surveys
  add constraint training_surveys_one_owner check (num_nonnulls(request_id, past_training_id) = 1);

-- ============================================================
-- Create a past training (admin)
-- ============================================================
-- Returns the new past_training_id. Errors: not_logged_in, admin_only,
-- bad_title, bad_date (empty or in the future), bad_company, instructor_not_found

create or replace function public.admin_create_past_training(
  p_instructor_id uuid,
  p_title text,
  p_held_on date,
  p_company_name text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_title text := btrim(p_title);
  v_company text := nullif(btrim(p_company_name), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_logged_in'; end if;
  if coalesce((select private.current_user_role()), '') <> 'ADMIN' then raise exception 'admin_only'; end if;
  if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 120 then raise exception 'bad_title'; end if;
  if p_held_on is null or p_held_on > current_date then raise exception 'bad_date'; end if;
  if v_company is not null and char_length(v_company) > 80 then raise exception 'bad_company'; end if;
  if not exists (select 1 from public.instructor_profiles ip where ip.id = p_instructor_id) then
    raise exception 'instructor_not_found';
  end if;

  insert into public.past_trainings (instructor_id, title, held_on, company_name, created_by)
  values (p_instructor_id, v_title, p_held_on, v_company, v_uid)
  returning past_training_id into v_id;

  -- its survey (no links: results only come from imports)
  insert into public.training_surveys (past_training_id, instructor_id, requester_id, max_links)
  values (v_id, p_instructor_id, v_uid, 0);

  return v_id;
end;
$$;

-- ============================================================
-- Import results onto a past training (admin)
-- ============================================================
-- Same p_rows as import_training_survey_answers. Returns {"batch_id", "imported"}.
-- Errors: not_logged_in, admin_only, past_training_not_found, bad_file_hash,
-- no_rows, too_many_rows, bad_row (detail: row=<n> field=<name>), duplicate_file

create or replace function public.admin_import_past_training_answers(
  p_past_training_id uuid,
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
  v_survey public.training_surveys;
  v_batch uuid;
  v_n integer;
  v_row jsonb;
  v_i integer;
  v_k text;
  v_role text;
  v_comment text;
  v_name text;
begin
  if v_uid is null then raise exception 'not_logged_in'; end if;
  if coalesce((select private.current_user_role()), '') <> 'ADMIN' then raise exception 'admin_only'; end if;

  select * into v_survey from public.training_surveys where past_training_id = p_past_training_id;
  if not found then raise exception 'past_training_not_found'; end if;

  if p_file_hash is null or char_length(p_file_hash) < 16 or char_length(p_file_hash) > 128 then
    raise exception 'bad_file_hash';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'no_rows'; end if;
  v_n := jsonb_array_length(p_rows);
  if v_n = 0 then raise exception 'no_rows'; end if;
  if v_n > 500 then raise exception 'too_many_rows'; end if;

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

revoke all on function public.admin_create_past_training(uuid, text, date, text) from public, anon;
revoke all on function public.admin_import_past_training_answers(uuid, jsonb, text, text) from public, anon;
grant execute on function public.admin_create_past_training(uuid, text, date, text) to authenticated;
grant execute on function public.admin_import_past_training_answers(uuid, jsonb, text, text) to authenticated;
