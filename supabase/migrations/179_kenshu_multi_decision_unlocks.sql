-- #42/#48 follow-up (after 178): deciding the second instructor of one request still failed at the last
-- step, because contact_unlocks allowed only ONE row per request (contact_unlocks_unique_per_request).
-- Now one row per decided response. The page already answers contact data per instructor.

alter table public.contact_unlocks drop constraint if exists contact_unlocks_unique_per_request;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'contact_unlocks_unique_per_response'
       and conrelid = 'public.contact_unlocks'::regclass
  ) then
    alter table public.contact_unlocks add constraint contact_unlocks_unique_per_response unique (request_id, response_id);
  end if;
end $$;

-- Repair: decided instructors of requests with role slots whose decision stopped at the failed last step
-- (decided, but no contact_unlocks row). Safe to run again.
insert into public.contact_unlocks (request_id, response_id, requester_id, instructor_id)
select ir.request_id, ir.response_id, tr.requester_id, ir.instructor_id
  from public.instructor_responses ir
  join public.training_requests tr on tr.request_id = ir.request_id
 where ir.is_selected
   and tr.role_slots is not null
   and jsonb_array_length(tr.role_slots) > 0
   and not exists (select 1 from public.contact_unlocks cu where cu.response_id = ir.response_id);
