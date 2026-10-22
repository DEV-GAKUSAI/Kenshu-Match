-- 175: invited instructors get their notice when a draft 招待限定 request is published (#46).
-- 174 skipped the new-match notice for 'invited' requests and relied on the invite trigger, which only
-- notifies while the request is already published. For a draft that is published later, nobody was told.
-- Here: when a draft becomes published and the request is 'invited', notify the invited instructors.
-- Additive, safe to run twice.

begin;

create or replace function public.kenshu_notice_on_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_inst record;
begin
  begin
    if new.status = 'pending' and new.publish_state = 'published'
       and (case when tg_op = 'INSERT' then true else old.publish_state = 'draft' end) then
      if new.target_instructor_id is not null then
        perform public.kenshu_enqueue_notice(new.target_instructor_id, 'direct_request');
      elsif new.visibility = 'invited' then
        -- On INSERT there are no invites yet (the invite trigger notifies them one by one);
        -- on draft -> published the invites already exist.
        for v_inst in select ri.instructor_id from public.request_invites ri where ri.request_id = new.request_id
        loop
          perform public.kenshu_enqueue_notice(v_inst.instructor_id, 'new_match');
        end loop;
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

commit;
