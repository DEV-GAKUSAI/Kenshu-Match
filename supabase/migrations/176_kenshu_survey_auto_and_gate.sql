-- 176_kenshu_survey_auto_and_gate.sql
--
-- #37 corrections.
-- 1. When a lecturer is decided (request becomes 'accepted'), the survey and one link per
--    participant (対象人数) are made automatically. The company can still add more up to the +20% cap.
-- 2. Answers are refused until the training is over:
--      - the request has a day schedule  -> after the end time (Japan time) of the LAST day
--        (a day without an end time counts until the end of that day);
--      - no day schedule                 -> after the company marks the request 完了.
--    A request marked 完了 is always open. A hand-typed start date can only make it later, never earlier.
--    Enforced in the database (token check + submit functions), so a QR code made early cannot be used early.
-- Answers that were already saved are not changed. Safe to run twice.

begin;

-- ---------- when do answers open? ----------
-- returns {"open": bool, "opens_at": timestamptz|null}; opens_at null = "after 完了"
create or replace function private.survey_gate(p_survey_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.training_surveys;
  v_status text;
  v_days jsonb;
  v_d jsonb;
  v_end timestamptz;
  v_t timestamptz;
  v_opens timestamptz;
begin
  select * into v_s from public.training_surveys where survey_id = p_survey_id;
  if not found then return jsonb_build_object('open', false, 'opens_at', null); end if;

  -- old surveys that belong to no request (imports of past trainings): only the hand-typed date counts
  if v_s.request_id is null then
    return jsonb_build_object('open', v_s.opens_at is null or v_s.opens_at <= now(), 'opens_at', v_s.opens_at);
  end if;

  select status, schedule_days into v_status, v_days
    from public.training_requests where request_id = v_s.request_id;
  if v_status = 'completed' then
    return jsonb_build_object('open', true, 'opens_at', null);
  end if;
  if v_status is null or v_status = 'cancelled' then
    return jsonb_build_object('open', false, 'opens_at', null);
  end if;

  if jsonb_typeof(v_days) = 'array' then
    for v_d in select * from jsonb_array_elements(v_days) loop
      if coalesce(v_d ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then continue; end if;
      begin
        if coalesce(v_d ->> 'end', '') ~ '^\d{2}:\d{2}$' then
          v_t := ((v_d ->> 'date')::date + (v_d ->> 'end')::time) at time zone 'Asia/Tokyo';
        else
          v_t := (((v_d ->> 'date')::date + 1)::timestamp) at time zone 'Asia/Tokyo';
        end if;
      exception when others then
        continue;
      end;
      if v_end is null or v_t > v_end then v_end := v_t; end if;
    end loop;
  end if;

  -- no usable schedule: wait for 完了
  if v_end is null then
    return jsonb_build_object('open', false, 'opens_at', null);
  end if;

  v_opens := greatest(v_end, coalesce(v_s.opens_at, v_end));
  return jsonb_build_object('open', now() >= v_opens, 'opens_at', v_opens);
end;
$$;
revoke all on function private.survey_gate(uuid) from public, anon, authenticated;

-- the company / instructors / admin can ask when the answers open (for the screen)
create or replace function public.get_training_survey_gate(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_s public.training_surveys;
begin
  if v_uid is null then raise exception 'not_logged_in'; end if;
  select * into v_s from public.training_surveys where request_id = p_request_id;
  if not found then return null; end if;
  if not (
    v_s.requester_id = v_uid
    or v_s.instructor_id = v_uid
    or exists (select 1 from public.training_survey_instructors si where si.survey_id = v_s.survey_id and si.instructor_id = v_uid)
    or coalesce((select private.current_user_role()), '') = 'ADMIN'
  ) then
    return null;
  end if;
  return private.survey_gate(v_s.survey_id);
end;
$$;
revoke all on function public.get_training_survey_gate(uuid) from public, anon;
grant execute on function public.get_training_survey_gate(uuid) to authenticated;

-- ---------- the three answer-side functions now use the gate ----------
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
  v_gate jsonb;
begin
  select * into v_link from public.training_survey_links where token = p_token;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  select * into v_survey from public.training_surveys where survey_id = v_link.survey_id;
  select title into v_title from public.training_requests where request_id = v_survey.request_id;
  v_gate := private.survey_gate(v_survey.survey_id);

  if v_link.used_at is not null then v_state := 'used';
  elsif v_survey.closed_at is not null then v_state := 'closed';
  elsif not (v_gate ->> 'open')::boolean then v_state := 'not_open';
  end if;

  return jsonb_build_object(
    'state', v_state, 'title', v_title, 'opens_at', v_gate -> 'opens_at',
    'instructors', coalesce((
      select jsonb_agg(jsonb_build_object('id', si.instructor_id, 'name', u.name, 'role', si.role_name)
                       order by si.created_at, si.instructor_id)
        from public.training_survey_instructors si
        join public.users u on u.id = si.instructor_id
       where si.survey_id = v_survey.survey_id), '[]'::jsonb));
end;
$$;

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
  if not (private.survey_gate(v_survey.survey_id) ->> 'open')::boolean then
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
  if not (private.survey_gate(v_survey.survey_id) ->> 'open')::boolean then
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

-- ---------- automatic survey + links when a lecturer is decided ----------
create or replace function private.auto_prepare_survey(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.training_requests;
  v_instructor uuid;
  v_survey public.training_surveys;
  v_existing integer;
  v_cap integer;
begin
  select * into v_req from public.training_requests where request_id = p_request_id;
  if not found or v_req.status <> 'accepted' or v_req.participant_count is null or v_req.participant_count < 1 then
    return;
  end if;

  select * into v_survey from public.training_surveys where request_id = p_request_id;
  if not found then
    v_instructor := v_req.target_instructor_id;
    if v_instructor is null then
      select r.instructor_id into v_instructor
        from public.instructor_responses r
       where r.request_id = p_request_id and r.is_selected
       order by r.response_id limit 1;
    end if;
    if v_instructor is null then return; end if;
    insert into public.training_surveys (request_id, instructor_id, requester_id, max_links)
    values (p_request_id, v_instructor, v_req.requester_id, ceil(v_req.participant_count * 1.2)::integer)
    returning * into v_survey;
  end if;
  perform private.sync_survey_instructors(v_survey.survey_id);

  -- one link per participant; never more than the cap, never touches links that already exist
  select count(*) into v_existing from public.training_survey_links where survey_id = v_survey.survey_id;
  v_cap := least(v_req.participant_count, v_survey.max_links);
  if v_existing < v_cap then
    insert into public.training_survey_links (survey_id)
    select v_survey.survey_id from generate_series(1, v_cap - v_existing);
  end if;
end;
$$;
revoke all on function private.auto_prepare_survey(uuid) from public, anon, authenticated;

create or replace function private.auto_prepare_survey_on_accept()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.auto_prepare_survey(new.request_id);
  exception when others then
    null; -- a survey problem must never block the decision
  end;
  return new;
end;
$$;
drop trigger if exists training_requests_auto_survey on public.training_requests;
create trigger training_requests_auto_survey after update of status on public.training_requests
  for each row when (new.status = 'accepted' and old.status is distinct from new.status)
  execute function private.auto_prepare_survey_on_accept();

-- requests that are already decided but have no links yet (not yet finished ones only)
do $$
declare v_id uuid;
begin
  for v_id in
    select r.request_id from public.training_requests r
     where r.status = 'accepted'
       and not exists (select 1 from public.training_survey_links l
                         join public.training_surveys s on s.survey_id = l.survey_id
                        where s.request_id = r.request_id)
  loop
    begin
      perform private.auto_prepare_survey(v_id);
    exception when others then
      null;
    end;
  end loop;
end $$;

commit;
