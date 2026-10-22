-- 172: database guards for requests with role slots (#42), so the rules do not rest on the page alone.
--  1) role_slots can only change while the request is pending, and never below what is already decided
--     (a role with decided people cannot be removed; its headcount cannot drop under the decided count).
--  2) a request with decided instructors cannot be cancelled (close recruiting instead).
-- Run this BEFORE deploying the matching page code (the page does not need it, so order is not critical).

create or replace function public.guard_role_slot_edit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_new jsonb;
  v_slot jsonb;
begin
  if new.role_slots is not distinct from old.role_slots then
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'request_locked' using hint = '募集が終了した依頼の職種は変更できません';
  end if;
  v_new := coalesce(new.role_slots, '[]'::jsonb);
  for v_row in
    select ir.role_slot_id, count(*) as n
      from public.instructor_responses ir
     where ir.request_id = new.request_id and ir.is_selected and ir.role_slot_id is not null
     group by ir.role_slot_id
  loop
    select s into v_slot from jsonb_array_elements(v_new) s where s ->> 'id' = v_row.role_slot_id limit 1;
    if v_slot is null then
      raise exception 'role_has_decided' using hint = '決定済みの講師がいる職種は削除できません';
    end if;
    if coalesce((v_slot ->> 'headcount')::integer, 1) < v_row.n then
      raise exception 'headcount_below_decided' using hint = '決定済みの人数より少なくできません';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists training_requests_guard_role_slot_edit on public.training_requests;
create trigger training_requests_guard_role_slot_edit before update of role_slots on public.training_requests
  for each row execute function public.guard_role_slot_edit();

create or replace function public.guard_cancel_after_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status = 'pending'
     and jsonb_typeof(old.role_slots) = 'array' and jsonb_array_length(old.role_slots) > 0
     and exists (select 1 from public.instructor_responses ir where ir.request_id = new.request_id and ir.is_selected) then
    raise exception 'cancel_after_decision' using hint = '決定した講師がいるため、キャンセルできません。募集を終了してください';
  end if;
  return new;
end;
$$;
drop trigger if exists training_requests_guard_cancel on public.training_requests;
create trigger training_requests_guard_cancel before update of status on public.training_requests
  for each row execute function public.guard_cancel_after_decision();
