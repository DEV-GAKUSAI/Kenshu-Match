-- 174: who can see an open (公募) request (#46 in the senior's sheet).
-- visibility: 'public'     一般公開      anyone, also logged-out visitors (public preview list)
--             'registered' 登録講師限定  logged-in instructors only
--             'invited'    招待限定      only instructors the company invited (request_invites)
-- Requests that already exist stay 'public'; NEW requests default to 'registered'.
-- Rules live in the database, so a direct URL or API call shows nothing to people who may not see it.
-- Company-only items (担当者・社内メモ) already live in request_internal_notes (migration 156).
-- Additive, safe to run twice.

begin;

-- Existing rows keep today's behaviour (public); the default for new rows is then switched.
alter table public.training_requests
  add column if not exists visibility text not null default 'public';
alter table public.training_requests alter column visibility set default 'registered';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_requests_visibility_check') then
    alter table public.training_requests add constraint training_requests_visibility_check
      check (visibility in ('public', 'registered', 'invited'));
  end if;
end $$;

-- Invited instructors of an 'invited' request.
create table if not exists public.request_invites (
  request_id uuid not null references public.training_requests(request_id) on delete cascade,
  instructor_id uuid not null references public.users(id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, instructor_id)
);
create index if not exists request_invites_instructor_idx on public.request_invites (instructor_id);

alter table public.request_invites enable row level security;

drop policy if exists request_invites_owner_all on public.request_invites;
create policy request_invites_owner_all on public.request_invites
  for all to authenticated
  using (requester_id = (select auth.uid()))
  with check (
    requester_id = (select auth.uid())
    and exists (select 1 from public.training_requests tr
                 where tr.request_id = request_invites.request_id and tr.requester_id = (select auth.uid()))
  );

drop policy if exists request_invites_instructor_select on public.request_invites;
create policy request_invites_instructor_select on public.request_invites
  for select to authenticated using (instructor_id = (select auth.uid()));

revoke all on public.request_invites from anon;
grant select, insert, update, delete on public.request_invites to authenticated;

-- Helper used by the policies. SECURITY DEFINER so it does not loop through the policies of
-- request_invites / users.
create or replace function public.kenshu_can_see_open_request(p_request_id uuid, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_visibility
    when 'public' then true
    when 'registered' then exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'INSTRUCTOR')
    when 'invited' then exists (select 1 from public.request_invites ri
                                 where ri.request_id = p_request_id and ri.instructor_id = auth.uid())
    else false
  end;
$$;
revoke all on function public.kenshu_can_see_open_request(uuid, text) from public, anon;
grant execute on function public.kenshu_can_see_open_request(uuid, text) to authenticated;

-- Instructors: open requests they may see, plus their own direct / applied ones.
drop policy if exists training_requests_select_for_instructors on public.training_requests;
create policy training_requests_select_for_instructors on public.training_requests
  for select to authenticated using (
    (target_instructor_id is null and status = 'pending' and publish_state = 'published'
       and public.kenshu_can_see_open_request(request_id, visibility))
    or target_instructor_id = auth.uid()
    or exists (select 1 from public.instructor_responses ir
               where ir.request_id = training_requests.request_id and ir.instructor_id = auth.uid())
  );

-- Applying needs the same visibility as seeing.
drop policy if exists instructor_responses_insert_own_instructor on public.instructor_responses;
create policy instructor_responses_insert_own_instructor on public.instructor_responses
  for insert to public with check (
    auth.uid() = instructor_id
    and exists (select 1 from public.training_requests tr
                where tr.request_id = instructor_responses.request_id and tr.status = 'pending'
                  and tr.publish_state = 'published'
                  and (tr.target_instructor_id is not null
                       or public.kenshu_can_see_open_request(tr.request_id, tr.visibility)))
  );

-- Public preview (logged-out visitors): only 'public' requests.
create or replace view public.open_requests_public_preview
 as
 select request_id, title, description, requester_type, preferred_format, budget, location,
        preferred_schedule, expertise_field, participant_count, created_at, budget_unit, tax_mode,
        transport_cost, lodging_cost, prep_cost, payment_terms, schedule_days, all_days_required,
        req_skills, req_prep, detail_option_ids, detail_other_tools, role_slots, apply_deadline
   from public.training_requests tr
  where status = 'pending' and target_instructor_id is null and publish_state = 'published'
    and visibility = 'public';

-- New-match notices: not for 'invited' requests (the invite sends its own notice below).
create or replace function public.kenshu_notice_on_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_inst record;
begin
  begin
    if new.status = 'pending' and new.publish_state = 'published'
       and (case when tg_op = 'INSERT' then true else old.publish_state = 'draft' end) then
      if new.target_instructor_id is not null then
        perform public.kenshu_enqueue_notice(new.target_instructor_id, 'direct_request');
      elsif new.visibility <> 'invited' then
        for v_inst in
          select distinct ip.id from public.instructor_profiles ip
          join public.instructor_expertise ie on ie.instructor_id = ip.id
          where ip.is_public = true and ie.subcategory_id = new.expertise_field
            and ip.id <> new.requester_id
        loop
          perform public.kenshu_enqueue_notice(v_inst.id, 'new_match');
        end loop;
      end if;
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

create or replace function public.kenshu_notice_on_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if exists (select 1 from public.training_requests tr
               where tr.request_id = new.request_id and tr.status = 'pending' and tr.publish_state = 'published') then
      perform public.kenshu_enqueue_notice(new.instructor_id, 'new_match');
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists kenshu_notice_invite on public.request_invites;
create trigger kenshu_notice_invite after insert on public.request_invites
  for each row execute function public.kenshu_notice_on_invite();

commit;
