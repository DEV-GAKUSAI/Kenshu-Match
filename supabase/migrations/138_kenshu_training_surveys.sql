-- 138_kenshu_training_surveys.sql
--
-- 研修アンケート (rating the instructor). Everything here is NEW and additive:
-- new tables, new functions, new views, one new trigger. No existing table
-- is changed except one rule (see "participant_count lock" below). Safe to
-- run more than once.
--
-- How it works
--   * One survey per training request (training_surveys).
--   * The company makes single-use links for participants
--     (training_survey_links). Limit = 対象人数 + 20 % (rounded up).
--   * Participants answer through a link without logging in; the company
--     answers once while logged in. 5 questions, 1-4, all required.
--   * The role (HIRER / PARTICIPANT) is set by these functions from how the
--     person got in, never from what the form says.
--   * Nobody writes to the tables directly: only the functions below.
--   * The public sees only the two views at the bottom.
--
-- Scale: 4 良い / 3 やや良い / 2 やや悪い / 1 悪い.
-- Q1 教材  Q2 理解  Q3 難易度  Q4 教え方  Q5 時間の長さ

create schema if not exists private;

-- ============================================================
-- Tables
-- ============================================================

create table if not exists public.training_surveys (
    survey_id uuid primary key default gen_random_uuid(),
    request_id uuid not null unique references public.training_requests(request_id) on delete restrict,
    instructor_id uuid not null references public.users(id) on delete restrict,
    requester_id uuid not null references public.users(id) on delete restrict,
    max_links integer not null default 0,
    opens_at timestamptz,
    closed_at timestamptz,
    created_at timestamptz not null default now(),
    constraint training_surveys_max_links_check check (max_links >= 0)
);

create table if not exists public.training_survey_links (
    link_id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references public.training_surveys(survey_id) on delete cascade,
    token text not null unique
      default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    created_at timestamptz not null default now(),
    used_at timestamptz
);
create index if not exists training_survey_links_survey_idx
  on public.training_survey_links (survey_id);

create table if not exists public.training_survey_answers (
    answer_id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references public.training_surveys(survey_id) on delete cascade,
    role text not null,
    link_id uuid unique references public.training_survey_links(link_id) on delete set null,
    reviewer_id uuid references public.users(id) on delete set null,
    q1 smallint not null,
    q2 smallint not null,
    q3 smallint not null,
    q4 smallint not null,
    q5 smallint not null,
    comment text,
    is_anonymous boolean not null default true,
    display_name text,
    client_hash text,
    is_hidden boolean not null default false,
    reported_at timestamptz,
    reported_reason text,
    instructor_reply text,
    replied_at timestamptz,
    created_at timestamptz not null default now(),
    constraint tsa_role_check check (role in ('HIRER', 'PARTICIPANT')),
    constraint tsa_q_range check (
      q1 between 1 and 4 and q2 between 1 and 4 and q3 between 1 and 4
      and q4 between 1 and 4 and q5 between 1 and 4),
    constraint tsa_comment_length check (char_length(comment) <= 1000),
    constraint tsa_name_length check (char_length(display_name) <= 40),
    constraint tsa_reply_length check (char_length(instructor_reply) <= 1000),
    constraint tsa_role_shape check (
      (role = 'HIRER' and reviewer_id is not null and link_id is null)
      or (role = 'PARTICIPANT' and reviewer_id is null and link_id is not null)
    )
);
-- the company answers once per survey
create unique index if not exists tsa_one_hirer_per_survey
  on public.training_survey_answers (survey_id) where role = 'HIRER';
create index if not exists tsa_survey_idx on public.training_survey_answers (survey_id);

-- ============================================================
-- Row level security: read only; writes go through the functions
-- ============================================================

alter table public.training_surveys enable row level security;
alter table public.training_survey_links enable row level security;
alter table public.training_survey_answers enable row level security;

revoke all on public.training_surveys from anon, authenticated;
revoke all on public.training_survey_links from anon, authenticated;
revoke all on public.training_survey_answers from anon, authenticated;
grant select on public.training_surveys to authenticated;
grant select on public.training_survey_links to authenticated;
grant select on public.training_survey_answers to authenticated;

-- survey: the company, the instructor and admin
drop policy if exists training_surveys_select on public.training_surveys;
create policy training_surveys_select on public.training_surveys
  for select to authenticated using (
    requester_id = (select auth.uid())
    or instructor_id = (select auth.uid())
    or (select private.current_user_role()) = 'ADMIN');

-- links (the QR codes): the company, the instructor (view only) and admin
drop policy if exists training_survey_links_select on public.training_survey_links;
create policy training_survey_links_select on public.training_survey_links
  for select to authenticated using (
    exists (select 1 from public.training_surveys s
            where s.survey_id = training_survey_links.survey_id
              and (s.requester_id = (select auth.uid())
                   or s.instructor_id = (select auth.uid())))
    or (select private.current_user_role()) = 'ADMIN');

-- raw answers: only the company's OWN answer, and admin. The instructor reads
-- answers through the comments view (it hides who the company is when the
-- company chose 匿名).
drop policy if exists training_survey_answers_select on public.training_survey_answers;
create policy training_survey_answers_select on public.training_survey_answers
  for select to authenticated using (
    reviewer_id = (select auth.uid())
    or (select private.current_user_role()) = 'ADMIN');

-- ============================================================
-- participant_count lock
-- ============================================================
-- Once a request is accepted or completed, 対象人数 cannot be raised by the
-- company (it sets the number of survey links). Lowering it is allowed.
-- Admin / server-side jobs (no logged-in user) are not blocked.

create or replace function private.training_requests_lock_participant_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.participant_count is distinct from old.participant_count
     and old.status in ('accepted', 'completed')
     and (select auth.uid()) is not null
     and coalesce((select private.current_user_role()), '') <> 'ADMIN'
     and (old.participant_count is null
          or new.participant_count is null
          or new.participant_count > old.participant_count) then
    raise exception 'participant_count_locked'
      using hint = '依頼が承諾された後は対象人数を増やせません';
  end if;
  return new;
end;
$$;

drop trigger if exists training_requests_lock_participant_count on public.training_requests;
create trigger training_requests_lock_participant_count
  before update of participant_count on public.training_requests
  for each row execute function private.training_requests_lock_participant_count();

-- ============================================================
-- Company: prepare links
-- ============================================================
-- Creates the survey on first use and adds p_add_links new links.
-- opens_at (optional) = the first day of the training; links open from then.
-- Limit = ceil(対象人数 * 1.2). Returns the survey and its links.

create or replace function public.prepare_training_survey(
  p_request_id uuid,
  p_add_links integer default 0,
  p_opens_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req record;
  v_instructor uuid;
  v_survey public.training_surveys;
  v_existing integer;
begin
  if v_uid is null then raise exception 'not_logged_in'; end if;

  select * into v_req from public.training_requests where request_id = p_request_id;
  if not found or v_req.requester_id <> v_uid then raise exception 'request_not_found'; end if;
  if v_req.status not in ('accepted', 'completed') then raise exception 'request_not_accepted'; end if;
  if v_req.participant_count is null then raise exception 'participant_count_required'; end if;

  select * into v_survey from public.training_surveys where request_id = p_request_id;
  if not found then
    v_instructor := v_req.target_instructor_id;
    if v_instructor is null then
      select r.instructor_id into v_instructor
        from public.instructor_responses r
       where r.request_id = p_request_id and r.is_selected
       limit 1;
    end if;
    if v_instructor is null then raise exception 'instructor_not_found'; end if;

    insert into public.training_surveys (request_id, instructor_id, requester_id, max_links, opens_at)
    values (p_request_id, v_instructor, v_uid, ceil(v_req.participant_count * 1.2)::integer, p_opens_at)
    returning * into v_survey;
  elsif p_opens_at is not null then
    update public.training_surveys set opens_at = p_opens_at
     where survey_id = v_survey.survey_id returning * into v_survey;
  end if;

  if p_add_links is null or p_add_links < 0 then raise exception 'bad_link_count'; end if;
  select count(*) into v_existing from public.training_survey_links where survey_id = v_survey.survey_id;
  if v_existing + p_add_links > v_survey.max_links then
    raise exception 'link_cap_exceeded'
      using detail = format('max=%s existing=%s', v_survey.max_links, v_existing);
  end if;

  insert into public.training_survey_links (survey_id)
  select v_survey.survey_id from generate_series(1, p_add_links);

  return jsonb_build_object(
    'survey_id', v_survey.survey_id,
    'max_links', v_survey.max_links,
    'opens_at', v_survey.opens_at,
    'closed_at', v_survey.closed_at,
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', l.link_id, 'token', l.token, 'used', l.used_at is not null)
                       order by l.created_at, l.link_id)
        from public.training_survey_links l where l.survey_id = v_survey.survey_id), '[]'::jsonb));
end;
$$;

-- Company closes / reopens its survey by hand
create or replace function public.set_training_survey_closed(p_request_id uuid, p_closed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.training_surveys
     set closed_at = case when p_closed then now() else null end
   where request_id = p_request_id and requester_id = (select auth.uid());
  if not found then raise exception 'survey_not_found'; end if;
end;
$$;

-- Admin raises the link limit
create or replace function public.admin_set_survey_link_cap(p_survey_id uuid, p_max_links integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select private.current_user_role()), '') <> 'ADMIN' then raise exception 'admin_only'; end if;
  if p_max_links is null or p_max_links < 0 then raise exception 'bad_link_count'; end if;
  update public.training_surveys set max_links = p_max_links where survey_id = p_survey_id;
  if not found then raise exception 'survey_not_found'; end if;
end;
$$;

-- ============================================================
-- Participant: open a link and answer (no login)
-- ============================================================

-- state: ok | invalid | used | not_open | closed
create or replace function public.get_training_survey_for_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.training_survey_links;
  v_survey public.training_surveys;
  v_title text;
  v_state text := 'ok';
begin
  select * into v_link from public.training_survey_links where token = p_token;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  select * into v_survey from public.training_surveys where survey_id = v_link.survey_id;
  select title into v_title from public.training_requests where request_id = v_survey.request_id;

  if v_link.used_at is not null then v_state := 'used';
  elsif v_survey.closed_at is not null then v_state := 'closed';
  elsif v_survey.opens_at is not null and v_survey.opens_at > now() then v_state := 'not_open';
  end if;

  return jsonb_build_object('state', v_state, 'title', v_title, 'opens_at', v_survey.opens_at);
end;
$$;

create or replace function public.submit_training_survey_answer(
  p_token text,
  p_q1 integer, p_q2 integer, p_q3 integer, p_q4 integer, p_q5 integer,
  p_comment text default null,
  p_name text default null,
  p_client_hash text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.training_survey_links;
  v_survey public.training_surveys;
  v_comment text := nullif(btrim(p_comment), '');
  v_name text := nullif(btrim(p_name), '');
begin
  if p_q1 is null or p_q2 is null or p_q3 is null or p_q4 is null or p_q5 is null
     or least(p_q1, p_q2, p_q3, p_q4, p_q5) < 1 or greatest(p_q1, p_q2, p_q3, p_q4, p_q5) > 4 then
    raise exception 'answers_required';
  end if;
  if char_length(v_comment) > 1000 then raise exception 'comment_too_long'; end if;
  if char_length(v_name) > 40 then raise exception 'name_too_long'; end if;

  select * into v_link from public.training_survey_links where token = p_token for update;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  select * into v_survey from public.training_surveys where survey_id = v_link.survey_id;

  if v_link.used_at is not null then return jsonb_build_object('state', 'used'); end if;
  if v_survey.closed_at is not null then return jsonb_build_object('state', 'closed'); end if;
  if v_survey.opens_at is not null and v_survey.opens_at > now() then
    return jsonb_build_object('state', 'not_open');
  end if;

  insert into public.training_survey_answers
    (survey_id, role, link_id, q1, q2, q3, q4, q5, comment, is_anonymous, display_name, client_hash)
  values
    (v_survey.survey_id, 'PARTICIPANT', v_link.link_id, p_q1, p_q2, p_q3, p_q4, p_q5,
     v_comment, v_name is null, v_name, p_client_hash);

  update public.training_survey_links set used_at = now() where link_id = v_link.link_id;
  return jsonb_build_object('state', 'ok');
end;
$$;

-- ============================================================
-- Company: its own answer (logged in, after 研修完了)
-- ============================================================

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
              where survey_id = v_survey.survey_id and role = 'HIRER') then
    return jsonb_build_object('state', 'used');
  end if;

  insert into public.training_survey_answers
    (survey_id, role, reviewer_id, q1, q2, q3, q4, q5, comment, is_anonymous)
  values
    (v_survey.survey_id, 'HIRER', v_uid, p_q1, p_q2, p_q3, p_q4, p_q5, v_comment, coalesce(p_is_anonymous, true));

  return jsonb_build_object('state', 'ok');
end;
$$;

-- ============================================================
-- Instructor: reply / report.  Admin: hide
-- ============================================================

create or replace function public.reply_training_survey_answer(p_answer_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_reply text := nullif(btrim(p_reply), '');
begin
  if char_length(v_reply) > 1000 then raise exception 'reply_too_long'; end if;
  update public.training_survey_answers a
     set instructor_reply = v_reply,
         replied_at = case when v_reply is null then null else now() end
   where a.answer_id = p_answer_id
     and exists (select 1 from public.training_surveys s
                  where s.survey_id = a.survey_id and s.instructor_id = (select auth.uid()));
  if not found then raise exception 'answer_not_found'; end if;
end;
$$;

create or replace function public.report_training_survey_answer(p_answer_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.training_survey_answers a
     set reported_at = now(), reported_reason = left(nullif(btrim(p_reason), ''), 500)
   where a.answer_id = p_answer_id
     and exists (select 1 from public.training_surveys s
                  where s.survey_id = a.survey_id and s.instructor_id = (select auth.uid()));
  if not found then raise exception 'answer_not_found'; end if;
end;
$$;

create or replace function public.admin_set_survey_answer_hidden(p_answer_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select private.current_user_role()), '') <> 'ADMIN' then raise exception 'admin_only'; end if;
  update public.training_survey_answers set is_hidden = coalesce(p_hidden, true) where answer_id = p_answer_id;
  if not found then raise exception 'answer_not_found'; end if;
end;
$$;

-- who may call what
revoke all on function public.prepare_training_survey(uuid, integer, timestamptz) from public, anon;
revoke all on function public.set_training_survey_closed(uuid, boolean) from public, anon;
revoke all on function public.admin_set_survey_link_cap(uuid, integer) from public, anon;
revoke all on function public.get_training_survey_for_token(text) from public;
revoke all on function public.submit_training_survey_answer(text, integer, integer, integer, integer, integer, text, text, text) from public;
revoke all on function public.submit_training_survey_hirer_answer(uuid, integer, integer, integer, integer, integer, text, boolean) from public, anon;
revoke all on function public.reply_training_survey_answer(uuid, text) from public, anon;
revoke all on function public.report_training_survey_answer(uuid, text) from public, anon;
revoke all on function public.admin_set_survey_answer_hidden(uuid, boolean) from public, anon;

grant execute on function public.prepare_training_survey(uuid, integer, timestamptz) to authenticated;
grant execute on function public.set_training_survey_closed(uuid, boolean) to authenticated;
grant execute on function public.admin_set_survey_link_cap(uuid, integer) to authenticated;
grant execute on function public.get_training_survey_for_token(text) to anon, authenticated;
grant execute on function public.submit_training_survey_answer(text, integer, integer, integer, integer, integer, text, text, text) to anon, authenticated;
grant execute on function public.submit_training_survey_hirer_answer(uuid, integer, integer, integer, integer, integer, text, boolean) to authenticated;
grant execute on function public.reply_training_survey_answer(uuid, text) to authenticated;
grant execute on function public.report_training_survey_answer(uuid, text) to authenticated;
grant execute on function public.admin_set_survey_answer_hidden(uuid, boolean) to authenticated;

-- ============================================================
-- Public views (public, active instructors only; hidden answers excluded)
-- ============================================================

-- One row per instructor: the numbers shown next to the stars.
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
          where s2.instructor_id = s.instructor_id)::integer as links_issued
   from public.training_surveys s
   join public.training_survey_answers a on a.survey_id = s.survey_id and not a.is_hidden
   join public.instructor_profiles ip on ip.id = s.instructor_id
   join public.users u on u.id = s.instructor_id
  where ip.is_public = true and u.status = 'ACTIVE'
  group by s.instructor_id;

-- Comments (and the reply). No ids of the people who answered.
create or replace view public.instructor_survey_comments as
 select a.answer_id,
        s.instructor_id,
        a.role,
        a.comment,
        case
          when a.role = 'PARTICIPANT' then coalesce(a.display_name, '参加者')
          when a.is_anonymous then '依頼企業（匿名）'
          else coalesce(nullif(rp.company_name, ''), '依頼企業')
        end as author_label,
        round((a.q1 + a.q2 + a.q3 + a.q4 + a.q5) / 5.0, 2) as score,
        a.instructor_reply,
        a.replied_at,
        a.created_at
   from public.training_survey_answers a
   join public.training_surveys s on s.survey_id = a.survey_id
   join public.instructor_profiles ip on ip.id = s.instructor_id
   join public.users u on u.id = s.instructor_id
   left join public.requester_profiles rp on rp.id = s.requester_id
  where a.comment is not null and not a.is_hidden
    and ip.is_public = true and u.status = 'ACTIVE';

grant select on public.instructor_survey_summary to anon, authenticated;
grant select on public.instructor_survey_comments to anon, authenticated;
