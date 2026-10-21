-- 154_kenshu_request_details.sql
--
-- #43 日別日程・通し登壇 / #58 日ごとの場所・実施形態 / #59 必須条件と事前対応 /
-- #54 応募内容の定型化
--
-- Requests get: schedule_days (one entry per day: date, start, end, format, place,
-- content), all_days_required (the instructor must teach every day), req_skills
-- (必須スキル・経験) and req_prep (事前対応).
-- Applications get fixed items: apply_all_days (all / partial / none), apply_role,
-- apply_experience, apply_materials (existing / create / either).
-- All new columns are optional, old rows keep working. Additive, safe to run twice.

alter table public.training_requests
  add column if not exists schedule_days jsonb not null default '[]'::jsonb,
  add column if not exists all_days_required boolean not null default false,
  add column if not exists req_skills text,
  add column if not exists req_prep text;

alter table public.instructor_responses
  add column if not exists apply_all_days text,
  add column if not exists apply_role text,
  add column if not exists apply_experience text,
  add column if not exists apply_materials text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_requests_schedule_days_check') then
    alter table public.training_requests add constraint training_requests_schedule_days_check
      check (jsonb_typeof(schedule_days) = 'array' and jsonb_array_length(schedule_days) <= 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_requests_req_len_check') then
    alter table public.training_requests add constraint training_requests_req_len_check
      check ((req_skills is null or char_length(req_skills) <= 1000) and (req_prep is null or char_length(req_prep) <= 1000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'instructor_responses_apply_all_days_check') then
    alter table public.instructor_responses add constraint instructor_responses_apply_all_days_check
      check (apply_all_days is null or apply_all_days in ('all', 'partial', 'none'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'instructor_responses_apply_materials_check') then
    alter table public.instructor_responses add constraint instructor_responses_apply_materials_check
      check (apply_materials is null or apply_materials in ('existing', 'create', 'either'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'instructor_responses_apply_len_check') then
    alter table public.instructor_responses add constraint instructor_responses_apply_len_check
      check ((apply_role is null or char_length(apply_role) <= 100) and (apply_experience is null or char_length(apply_experience) <= 1000));
  end if;
end $$;

-- The public preview shows the same details (new columns at the end).
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
    payment_terms,
    schedule_days,
    all_days_required,
    req_skills,
    req_prep
   from public.training_requests tr
  where status = 'pending' and target_instructor_id is null;
