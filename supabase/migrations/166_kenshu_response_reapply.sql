-- 166_kenshu_response_reapply.sql
--
-- #62 follow-up: 「再度応募する」. An instructor who withdrew can apply again to the same
-- request while it is still open and nobody has been decided. The same application row is
-- reused (one row per instructor and request), so the company sees it as NEW again, with a
-- 「再応募」 line in the history. Additive, safe to run twice.

do $$
begin
  alter table public.instructor_response_changes drop constraint if exists instructor_response_changes_kind_check;
  alter table public.instructor_response_changes
    add constraint instructor_response_changes_kind_check check (kind in ('revised', 'withdrawn', 'reapplied'));
end $$;

create or replace function public.reapply_instructor_response(
  p_response_id uuid,
  p_price numeric,
  p_tax text,
  p_message text,
  p_all_days text,
  p_role text,
  p_experience text,
  p_materials text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp public.instructor_responses%rowtype;
  v_status text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_resp from public.instructor_responses where response_id = p_response_id for update;
  if not found or v_resp.instructor_id <> auth.uid() then raise exception 'not_found'; end if;
  select status into v_status from public.training_requests where request_id = v_resp.request_id;
  if v_status is distinct from 'pending' or v_resp.is_selected or v_resp.action <> 'withdrawn' then
    raise exception 'not_reapplicable';
  end if;
  if p_price is not null and (p_price < 1 or p_price <> trunc(p_price)) then raise exception 'bad_price'; end if;
  if p_tax is not null and p_tax not in ('included', 'excluded') then raise exception 'bad_tax'; end if;
  if p_message is not null and char_length(p_message) > 2000 then raise exception 'bad_message'; end if;
  if p_all_days is not null and p_all_days not in ('all', 'partial', 'none') then raise exception 'bad_apply'; end if;
  if p_materials is not null and p_materials not in ('existing', 'create', 'either') then raise exception 'bad_apply'; end if;
  if (p_role is not null and char_length(p_role) > 100) or (p_experience is not null and char_length(p_experience) > 1000) then
    raise exception 'bad_apply';
  end if;

  insert into public.instructor_response_changes (response_id, kind, old_price, new_price, old_message, new_message)
  values (v_resp.response_id, 'reapplied', null, p_price, v_resp.message, p_message);

  update public.instructor_responses
     set action = case when p_price is null then 'accept' else 'quote' end,
         quote_price = p_price,
         quote_tax_mode = case when p_price is null then null else p_tax end,
         message = p_message,
         apply_all_days = p_all_days,
         apply_role = p_role,
         apply_experience = p_experience,
         apply_materials = p_materials,
         requester_seen_at = null
   where response_id = v_resp.response_id;
end;
$$;

revoke all on function public.reapply_instructor_response(uuid, numeric, text, text, text, text, text, text) from public, anon;
grant execute on function public.reapply_instructor_response(uuid, numeric, text, text, text, text, text, text) to authenticated;
