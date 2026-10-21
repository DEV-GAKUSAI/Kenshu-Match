-- 162_kenshu_partner_instructor_link.sql
--
-- #53 step 3: the survey rating follows the actual speaker.
-- A partner of kind "instructor" can be linked to a registered Kenshu Link instructor.
-- When a request's flow has such a speaker, the training survey of that request is
-- created for that instructor (instead of the decided instructor), so the survey
-- rating and answers belong to the person who actually taught.
-- Set the flow before the survey link is created; an existing survey is not moved.
-- Additive, safe to run more than once.

alter table public.requester_partners
  add column if not exists instructor_id uuid references public.users(id) on delete set null;

create or replace function private.requester_partners_check_instructor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.instructor_id is not null and not exists (select 1 from public.instructor_profiles ip where ip.id = new.instructor_id) then
    raise exception 'not_an_instructor';
  end if;
  return new;
end;
$$;

drop trigger if exists requester_partners_check_instructor on public.requester_partners;
create trigger requester_partners_check_instructor
  before insert or update of instructor_id on public.requester_partners
  for each row execute function private.requester_partners_check_instructor();

create or replace function private.survey_use_flow_speaker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_speaker uuid;
begin
  if new.request_id is null then
    return new;
  end if;
  select sp.instructor_id into v_speaker
    from public.request_flows f
    join public.requester_partners sp on sp.partner_id = f.speaker_partner_id
   where f.request_id = new.request_id and sp.instructor_id is not null;
  if v_speaker is not null then
    new.instructor_id := v_speaker;
  end if;
  return new;
end;
$$;

drop trigger if exists training_surveys_use_flow_speaker on public.training_surveys;
create trigger training_surveys_use_flow_speaker
  before insert on public.training_surveys
  for each row execute function private.survey_use_flow_speaker();
