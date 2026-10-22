-- 170: 研修アンケート for requests with several chosen instructors (#42 step 3, "Option A").
-- One survey (and one set of links) per request, as before. New:
--   * training_survey_instructors: which instructors a survey covers (+ their role name).
--   * training_survey_answers.instructor_id: which instructor an answer rates.
--     One participant link now produces one answer row per instructor.
--   * Ratings, comments, replies and reports are per instructor (answer.instructor_id).
-- Single-instructor requests behave exactly as before. Old answers are filled in
-- (instructor_id = the survey's instructor). Bulk import / past trainings keep working
-- (rows go to the survey's main instructor; the app switches import off for several instructors).
-- Safe to run twice. Run BEFORE deploying the matching app version.

begin;

-- ---------- who a survey covers ----------
create table if not exists public.training_survey_instructors (
    survey_id uuid not null references public.training_surveys(survey_id) on delete cascade,
    instructor_id uuid not null references public.users(id) on delete restrict,
    requester_id uuid not null references public.users(id) on delete restrict,
    role_name text,
    created_at timestamptz not null default now(),
    primary key (survey_id, instructor_id)
);
create index if not exists tsi_instructor_idx on public.training_survey_instructors (instructor_id);

alter table public.training_survey_instructors enable row level security;
revoke all on public.training_survey_instructors from anon, authenticated;
grant select on public.training_survey_instructors to authenticated;
drop policy if exists training_survey_instructors_select on public.training_survey_instructors;
create policy training_survey_instructors_select on public.training_survey_instructors
  for select to authenticated using (
    requester_id = (select auth.uid())
    or instructor_id = (select auth.uid())
    or (select private.current_user_role()) = 'ADMIN');

-- existing surveys: their one instructor
insert into public.training_survey_instructors (survey_id, instructor_id, requester_id)
select s.survey_id, s.instructor_id, s.requester_id from public.training_surveys s
on conflict do nothing;

-- every new survey lists its main instructor
create or replace function private.survey_add_main_instructor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.training_survey_instructors (survey_id, instructor_id, requester_id)
  values (new.survey_id, new.instructor_id, new.requester_id)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists training_surveys_add_main_instructor on public.training_surveys;
create trigger training_surveys_add_main_instructor after insert on public.training_surveys
  for each row execute function private.survey_add_main_instructor();

-- adds every chosen instructor of the request (with the role they were chosen for)
create or replace function private.sync_survey_instructors(p_survey_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_s public.training_surveys;
begin
  select * into v_s from public.training_surveys where survey_id = p_survey_id;
  if not found or v_s.request_id is null then return; end if;
  insert into public.training_survey_instructors (survey_id, instructor_id, requester_id, role_name)
  select v_s.survey_id, r.instructor_id, v_s.requester_id,
         (select sl ->> 'name'
            from public.training_requests tr, jsonb_array_elements(tr.role_slots) sl
           where tr.request_id = r.request_id and sl ->> 'id' = r.role_slot_id limit 1)
    from public.instructor_responses r
   where r.request_id = v_s.request_id and r.is_selected
  on conflict (survey_id, instructor_id) do update
    set role_name = coalesce(excluded.role_name, public.training_survey_instructors.role_name);
end;
$$;
revoke all on function private.sync_survey_instructors(uuid) from public, anon, authenticated;

-- ---------- which instructor an answer rates ----------
alter table public.training_survey_answers
  add column if not exists instructor_id uuid references public.users(id) on delete restrict;
update public.training_survey_answers a set instructor_id = s.instructor_id
  from public.training_surveys s where s.survey_id = a.survey_id and a.instructor_id is null;
alter table public.training_survey_answers alter column instructor_id set not null;
create index if not exists tsa_instructor_idx on public.training_survey_answers (instructor_id);

-- inserts that do not say (bulk import, past trainings, old app version) go to the main instructor
create or replace function private.survey_answer_default_instructor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.instructor_id is null then
    select s.instructor_id into new.instructor_id from public.training_surveys s where s.survey_id = new.survey_id;
  end if;
  return new;
end;
$$;
drop trigger if exists training_survey_answers_default_instructor on public.training_survey_answers;
create trigger training_survey_answers_default_instructor before insert on public.training_survey_answers
  for each row execute function private.survey_answer_default_instructor();
-- (the column is NOT NULL, but a BEFORE trigger runs first, so omitting it still works)

-- one link = one answer per instructor; one company answer per instructor
alter table public.training_survey_answers drop constraint if exists training_survey_answers_link_id_key;
create unique index if not exists tsa_one_per_link_instructor
  on public.training_survey_answers (link_id, instructor_id) where link_id is not null;
drop index if exists public.tsa_one_hirer_per_survey;
create unique index if not exists tsa_one_hirer_per_survey
  on public.training_survey_answers (survey_id, instructor_id) where role = 'HIRER' and source = 'link';

-- ---------- who can read a survey / its links: every instructor it covers ----------
drop policy if exists training_surveys_select on public.training_surveys;
create policy training_surveys_select on public.training_surveys
  for select to authenticated using (
    requester_id = (select auth.uid())
    or instructor_id = (select auth.uid())
    or exists (select 1 from public.training_survey_instructors si
                where si.survey_id = training_surveys.survey_id and si.instructor_id = (select auth.uid()))
    or (select private.current_user_role()) = 'ADMIN');

drop policy if exists training_survey_links_select on public.training_survey_links;
create policy training_survey_links_select on public.training_survey_links
  for select to authenticated using (
    exists (select 1 from public.training_survey_instructors si
            where si.survey_id = training_survey_links.survey_id
              and (si.requester_id = (select auth.uid()) or si.instructor_id = (select auth.uid())))
    or (select private.current_user_role()) = 'ADMIN');

-- ---------- company: prepare links (also lists every chosen instructor) ----------
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
       order by r.response_id
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
  perform private.sync_survey_instructors(v_survey.survey_id);

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

-- ---------- participant: the link now also lists the instructors ----------
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

  return jsonb_build_object(
    'state', v_state, 'title', v_title, 'opens_at', v_survey.opens_at,
    'instructors', coalesce((
      select jsonb_agg(jsonb_build_object('id', si.instructor_id, 'name', u.name, 'role', si.role_name)
                       order by si.created_at, si.instructor_id)
        from public.training_survey_instructors si
        join public.users u on u.id = si.instructor_id
       where si.survey_id = v_survey.survey_id), '[]'::jsonb));
end;
$$;

-- participant: all instructors at once. p_entries = [{"instructor_id","q1".."q5","comment"}], one per instructor.
create or replace function public.submit_training_survey_answers(
  p_token text,
  p_entries jsonb,
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
  v_name text := nullif(btrim(p_name), '');
  v_e jsonb;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_comment text;
  v_n integer;
  v_q integer[];
  i integer;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'answers_required';
  end if;
  if char_length(v_name) > 40 then raise exception 'name_too_long'; end if;

  select * into v_link from public.training_survey_links where token = p_token for update;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  select * into v_survey from public.training_surveys where survey_id = v_link.survey_id;

  if v_link.used_at is not null then return jsonb_build_object('state', 'used'); end if;
  if v_survey.closed_at is not null then return jsonb_build_object('state', 'closed'); end if;
  if v_survey.opens_at is not null and v_survey.opens_at > now() then
    return jsonb_build_object('state', 'not_open');
  end if;

  -- one entry for every instructor of this survey, no more, no less
  select count(*) into v_n from public.training_survey_instructors where survey_id = v_survey.survey_id;
  if jsonb_array_length(p_entries) <> v_n then raise exception 'instructor_mismatch'; end if;

  for v_e in select * from jsonb_array_elements(p_entries) loop
    begin
      v_id := (v_e ->> 'instructor_id')::uuid;
    exception when others then
      raise exception 'instructor_mismatch';
    end;
    if v_id = any (v_ids)
       or not exists (select 1 from public.training_survey_instructors
                       where survey_id = v_survey.survey_id and instructor_id = v_id) then
      raise exception 'instructor_mismatch';
    end if;
    v_ids := v_ids || v_id;

    v_q := '{}';
    for i in 1..5 loop
      begin
        v_q := v_q || (v_e ->> ('q' || i))::integer;
      exception when others then
        raise exception 'answers_required';
      end;
      if v_q[i] is null or v_q[i] < 1 or v_q[i] > 4 then raise exception 'answers_required'; end if;
    end loop;
    v_comment := nullif(btrim(v_e ->> 'comment'), '');
    if char_length(v_comment) > 1000 then raise exception 'comment_too_long'; end if;

    insert into public.training_survey_answers
      (survey_id, instructor_id, role, link_id, q1, q2, q3, q4, q5, comment, is_anonymous, display_name, client_hash)
    values
      (v_survey.survey_id, v_id, 'PARTICIPANT', v_link.link_id, v_q[1], v_q[2], v_q[3], v_q[4], v_q[5],
       v_comment, v_name is null, v_name, p_client_hash);
  end loop;

  update public.training_survey_links set used_at = now() where link_id = v_link.link_id;
  return jsonb_build_object('state', 'ok');
end;
$$;

-- the old one-instructor call keeps working, but only when the survey has a single instructor
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
  if (select count(*) from public.training_survey_instructors where survey_id = v_survey.survey_id) > 1 then
    raise exception 'instructor_mismatch';
  end if;

  insert into public.training_survey_answers
    (survey_id, instructor_id, role, link_id, q1, q2, q3, q4, q5, comment, is_anonymous, display_name, client_hash)
  values
    (v_survey.survey_id, v_survey.instructor_id, 'PARTICIPANT', v_link.link_id, p_q1, p_q2, p_q3, p_q4, p_q5,
     v_comment, v_name is null, v_name, p_client_hash);

  update public.training_survey_links set used_at = now() where link_id = v_link.link_id;
  return jsonb_build_object('state', 'ok');
end;
$$;

-- ---------- company: its own answer, once per instructor ----------
drop function if exists public.submit_training_survey_hirer_answer(uuid, integer, integer, integer, integer, integer, text, boolean);
create or replace function public.submit_training_survey_hirer_answer(
  p_request_id uuid,
  p_q1 integer, p_q2 integer, p_q3 integer, p_q4 integer, p_q5 integer,
  p_comment text default null,
  p_is_anonymous boolean default true,
  p_instructor_id uuid default null
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
  v_target uuid;
  v_count integer;
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
       where r.request_id = p_request_id and r.is_selected order by r.response_id limit 1;
    end if;
    if v_instructor is null then raise exception 'instructor_not_found'; end if;
    insert into public.training_surveys (request_id, instructor_id, requester_id, max_links)
    values (p_request_id, v_instructor, v_uid,
            case when v_req.participant_count is null then 0 else ceil(v_req.participant_count * 1.2)::integer end)
    returning * into v_survey;
  end if;
  perform private.sync_survey_instructors(v_survey.survey_id);

  select count(*) into v_count from public.training_survey_instructors where survey_id = v_survey.survey_id;
  if p_instructor_id is null then
    if v_count <> 1 then raise exception 'instructor_required'; end if;
    select instructor_id into v_target from public.training_survey_instructors where survey_id = v_survey.survey_id;
  else
    if not exists (select 1 from public.training_survey_instructors
                    where survey_id = v_survey.survey_id and instructor_id = p_instructor_id) then
      raise exception 'instructor_mismatch';
    end if;
    v_target := p_instructor_id;
  end if;

  if exists (select 1 from public.training_survey_answers
              where survey_id = v_survey.survey_id and instructor_id = v_target
                and role = 'HIRER' and source = 'link') then
    return jsonb_build_object('state', 'used');
  end if;

  insert into public.training_survey_answers
    (survey_id, instructor_id, role, reviewer_id, q1, q2, q3, q4, q5, comment, is_anonymous)
  values
    (v_survey.survey_id, v_target, 'HIRER', v_uid, p_q1, p_q2, p_q3, p_q4, p_q5, v_comment, coalesce(p_is_anonymous, true));

  return jsonb_build_object('state', 'ok');
end;
$$;

-- ---------- instructor: reply / report only for answers about themselves ----------
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
   where a.answer_id = p_answer_id and a.instructor_id = (select auth.uid());
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
   where a.answer_id = p_answer_id and a.instructor_id = (select auth.uid());
  if not found then raise exception 'answer_not_found'; end if;
end;
$$;

-- ---------- public views: per instructor of the answer ----------
create or replace view public.instructor_survey_summary as
 select a.instructor_id,
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
           join public.training_survey_instructors si on si.survey_id = l.survey_id
          where si.instructor_id = a.instructor_id)::integer as links_issued,
        (count(a.answer_id) filter (where a.source = 'import'))::integer as imported_count
   from public.training_survey_answers a
   join public.instructor_profiles ip on ip.id = a.instructor_id
   join public.users u on u.id = a.instructor_id
  where not a.is_hidden and ip.is_public = true and u.status = 'ACTIVE'
  group by a.instructor_id;

create or replace view public.instructor_survey_comments as
 select a.answer_id,
        a.instructor_id,
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
   join public.instructor_profiles ip on ip.id = a.instructor_id
   join public.users u on u.id = a.instructor_id
   left join public.requester_profiles rp on rp.id = s.requester_id
  where a.comment is not null and not a.is_hidden
    and ip.is_public = true and u.status = 'ACTIVE';

grant select on public.instructor_survey_summary to anon, authenticated;
grant select on public.instructor_survey_comments to anon, authenticated;

-- ---------- who may call what ----------
revoke all on function public.prepare_training_survey(uuid, integer, timestamptz) from public, anon;
revoke all on function public.get_training_survey_for_token(text) from public;
revoke all on function public.submit_training_survey_answers(text, jsonb, text, text) from public;
revoke all on function public.submit_training_survey_answer(text, integer, integer, integer, integer, integer, text, text, text) from public;
revoke all on function public.submit_training_survey_hirer_answer(uuid, integer, integer, integer, integer, integer, text, boolean, uuid) from public, anon;
revoke all on function public.reply_training_survey_answer(uuid, text) from public, anon;
revoke all on function public.report_training_survey_answer(uuid, text) from public, anon;
grant execute on function public.prepare_training_survey(uuid, integer, timestamptz) to authenticated;
grant execute on function public.get_training_survey_for_token(text) to anon, authenticated;
grant execute on function public.submit_training_survey_answers(text, jsonb, text, text) to anon, authenticated;
grant execute on function public.submit_training_survey_answer(text, integer, integer, integer, integer, integer, text, text, text) to anon, authenticated;
grant execute on function public.submit_training_survey_hirer_answer(uuid, integer, integer, integer, integer, integer, text, boolean, uuid) to authenticated;
grant execute on function public.reply_training_survey_answer(uuid, text) to authenticated;
grant execute on function public.report_training_survey_answer(uuid, text) to authenticated;

commit;
