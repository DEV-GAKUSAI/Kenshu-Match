-- 167: draft / preview / pause for open (公募) requests (#45 in the senior's sheet).
-- publish_state: 'draft' (saved, not shown to instructors), 'published' (normal), 'paused' (hidden for now).
-- Only 'published' open requests are shown to instructors, can be applied to, and trigger notices.
-- Instructors who already applied still see the request. Existing requests stay 'published'.
-- Additive, safe to run twice.

begin;

alter table public.training_requests
  add column if not exists publish_state text not null default 'published';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_requests_publish_state_check') then
    alter table public.training_requests add constraint training_requests_publish_state_check
      check (publish_state in ('draft','published','paused'));
  end if;
end $$;

-- Instructors only see published open requests (plus their own direct / applied ones).
drop policy if exists training_requests_select_for_instructors on public.training_requests;
create policy training_requests_select_for_instructors on public.training_requests
  for select to authenticated using (
    (target_instructor_id is null and status = 'pending' and publish_state = 'published')
    or target_instructor_id = auth.uid()
    or exists (select 1 from public.instructor_responses ir
               where ir.request_id = training_requests.request_id and ir.instructor_id = auth.uid())
  );

-- Nobody can apply to a draft or paused request.
drop policy if exists instructor_responses_insert_own_instructor on public.instructor_responses;
create policy instructor_responses_insert_own_instructor on public.instructor_responses
  for insert to public with check (
    auth.uid() = instructor_id
    and exists (select 1 from public.training_requests tr
                where tr.request_id = instructor_responses.request_id and tr.status = 'pending'
                  and tr.publish_state = 'published')
  );

-- Public preview list: published only.
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
    req_prep,
    detail_option_ids,
    detail_other_tools
   from public.training_requests tr
  where status = 'pending' and target_instructor_id is null and publish_state = 'published';


-- New-match notices: when a request is created as published, or a draft is published later.
create or replace function public.kenshu_notice_on_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_inst record;
begin
  begin
    if new.status = 'pending' and new.publish_state = 'published'
       and (case when tg_op = 'INSERT' then true else old.publish_state = 'draft' end) then
      if new.target_instructor_id is not null then
        perform public.kenshu_enqueue_notice(new.target_instructor_id, 'direct_request');
      else
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
drop trigger if exists kenshu_notice_request_publish on public.training_requests;
create trigger kenshu_notice_request_publish after update of publish_state on public.training_requests
  for each row when (old.publish_state is distinct from new.publish_state)
  execute function public.kenshu_notice_on_request();

commit;
