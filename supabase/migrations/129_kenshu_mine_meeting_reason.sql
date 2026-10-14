-- 129: the reason for a time change, sent by Mine (meeting 10/13, request #3).
-- Mine keeps the reason while a proposal waits and sends it with the meeting
-- state; it arrives empty once the proposal is answered or taken back.
-- Purely additive: one nullable column, and the save function also stores it.
begin;

alter table public.kenshu_mine_meetings
  add column if not exists change_reason text
  check (change_reason is null or char_length(change_reason) <= 500);

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
    change_reason, version, received_at
  ) values (
    (p_payload ->> 'booking_id')::uuid, v_response.response_id, v_response.request_id, v_requester_id,
    v_response.instructor_id, p_payload ->> 'title', (p_payload ->> 'starts_at')::timestamptz,
    (p_payload ->> 'ends_at')::timestamptz, p_payload ->> 'time_zone', p_payload ->> 'meeting_type',
    nullif(p_payload ->> 'meeting_url', ''), p_payload ->> 'meeting_status', nullif(p_payload ->> 'place', ''),
    p_payload ->> 'status', (p_payload ->> 'proposed_starts_at')::timestamptz,
    (p_payload ->> 'proposed_ends_at')::timestamptz, p_payload ->> 'proposed_by',
    nullif(left(btrim(coalesce(p_payload ->> 'change_reason', '')), 500), ''),
    p_payload ->> 'version', now()
  )
  on conflict (booking_id) do update set
    title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    time_zone = excluded.time_zone, meeting_type = excluded.meeting_type, meeting_url = excluded.meeting_url,
    meeting_status = excluded.meeting_status, place = excluded.place, status = excluded.status,
    proposed_starts_at = excluded.proposed_starts_at, proposed_ends_at = excluded.proposed_ends_at,
    proposed_by = excluded.proposed_by, change_reason = excluded.change_reason,
    version = excluded.version, received_at = now()
  where m.version < excluded.version and m.response_id = excluded.response_id;
  get diagnostics v_rows = row_count;
  return case when v_rows = 0 then 'stale' else 'saved' end;
end;
$$;

revoke all on function public.kenshu_mine_meeting_save(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kenshu_mine_meeting_save(uuid, jsonb) to service_role;

commit;
