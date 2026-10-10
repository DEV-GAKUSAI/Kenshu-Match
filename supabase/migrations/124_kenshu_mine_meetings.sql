-- Kenshu Link side of Mine booking (Mine schedule redesign Phase 3c).
--
-- A company clicks 「面談を予約」 on an instructor's reply and books a time on
-- the instructor's Mine booking page. Mine then sends signed messages
-- (POST /api/mine/booking-events) with the meeting's full current state.
-- This table keeps that state so both the company and the instructor see
-- 「面談：10月12日(月) 10:00〜10:30［Google Meet に参加］」 on the request.
--
-- Separation rule: Kenshu Link owns this table; Mine never reads it and
-- Kenshu Link never reads Mine's booking tables.
-- Purely additive.
begin;

create table if not exists public.kenshu_mine_meetings (
  booking_id uuid primary key,              -- Mine's booking id
  response_id uuid not null references public.instructor_responses(response_id) on delete cascade,
  request_id uuid not null references public.training_requests(request_id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  instructor_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  meeting_type text not null check (meeting_type in ('google_meet', 'in_person', 'none', 'zoom')),
  meeting_url text check (meeting_url is null or (char_length(meeting_url) <= 2000 and meeting_url ~* '^https://')),
  meeting_status text not null check (meeting_status in ('none', 'pending', 'ready', 'failed')),
  place text check (place is null or char_length(place) <= 200),
  status text not null check (status in ('confirmed', 'change_requested', 'cancelled')),
  proposed_starts_at timestamptz,
  proposed_ends_at timestamptz,
  proposed_by text check (proposed_by is null or proposed_by in ('host', 'guest')),
  -- Mine's version stamp; an older message never overwrites a newer one.
  version text not null,
  received_at timestamptz not null default now(),
  constraint kenshu_mine_meetings_time_order check (ends_at > starts_at)
);

create index if not exists kenshu_mine_meetings_requester_idx on public.kenshu_mine_meetings (requester_id, starts_at);
create index if not exists kenshu_mine_meetings_instructor_idx on public.kenshu_mine_meetings (instructor_id, starts_at);

alter table public.kenshu_mine_meetings enable row level security;
revoke all on public.kenshu_mine_meetings from public, anon, authenticated;
grant select on public.kenshu_mine_meetings to authenticated;
grant all on public.kenshu_mine_meetings to service_role;

drop policy if exists kenshu_mine_meetings_parties_select on public.kenshu_mine_meetings;
create policy kenshu_mine_meetings_parties_select on public.kenshu_mine_meetings for select to authenticated
  using (requester_id = (select auth.uid()) or instructor_id = (select auth.uid()));

-- Saves one message from Mine. Checks that the reply belongs to the Mine
-- person's linked instructor, then keeps the newest version.
-- Returns 'saved', 'stale', 'unknown_response' or 'not_linked'.
create or replace function public.kenshu_mine_meeting_save(p_mine_user_id uuid, p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response public.instructor_responses%rowtype;
  v_requester_id uuid;
  v_kenshu_user_id uuid;
  v_rows integer;
begin
  select * into v_response
    from public.instructor_responses
   where response_id = (p_payload ->> 'response_id')::uuid;
  if not found then
    return 'unknown_response';
  end if;
  select kenshu_user_id into v_kenshu_user_id
    from public.mine_kenshu_account_links where mine_user_id = p_mine_user_id;
  if v_kenshu_user_id is null or v_kenshu_user_id <> v_response.instructor_id then
    return 'not_linked';
  end if;
  select requester_id into v_requester_id from public.training_requests where request_id = v_response.request_id;

  insert into public.kenshu_mine_meetings as m (
    booking_id, response_id, request_id, requester_id, instructor_id, title, starts_at, ends_at, time_zone,
    meeting_type, meeting_url, meeting_status, place, status, proposed_starts_at, proposed_ends_at, proposed_by,
    version, received_at
  ) values (
    (p_payload ->> 'booking_id')::uuid, v_response.response_id, v_response.request_id, v_requester_id,
    v_response.instructor_id, p_payload ->> 'title', (p_payload ->> 'starts_at')::timestamptz,
    (p_payload ->> 'ends_at')::timestamptz, p_payload ->> 'time_zone', p_payload ->> 'meeting_type',
    nullif(p_payload ->> 'meeting_url', ''), p_payload ->> 'meeting_status', nullif(p_payload ->> 'place', ''),
    p_payload ->> 'status', (p_payload ->> 'proposed_starts_at')::timestamptz,
    (p_payload ->> 'proposed_ends_at')::timestamptz, p_payload ->> 'proposed_by', p_payload ->> 'version', now()
  )
  on conflict (booking_id) do update set
    title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    time_zone = excluded.time_zone, meeting_type = excluded.meeting_type, meeting_url = excluded.meeting_url,
    meeting_status = excluded.meeting_status, place = excluded.place, status = excluded.status,
    proposed_starts_at = excluded.proposed_starts_at, proposed_ends_at = excluded.proposed_ends_at,
    proposed_by = excluded.proposed_by, version = excluded.version, received_at = now()
  where m.version < excluded.version and m.response_id = excluded.response_id;
  get diagnostics v_rows = row_count;
  return case when v_rows = 0 then 'stale' else 'saved' end;
end;
$$;

revoke all on function public.kenshu_mine_meeting_save(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kenshu_mine_meeting_save(uuid, jsonb) to service_role;

commit;
