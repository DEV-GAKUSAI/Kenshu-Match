-- 189_kenshu_quote_change_apply.sql
--
-- #62 (the senior's 10/23 note): the quote-change form also changes the answers given when applying
-- (全日程への対応・希望する役割・教材の対応・事前研修への参加・関連する実績), and the company sees what changed.
--  * instructor_response_changes gets old_apply / new_apply (a small json of the five answers).
--  * revise_instructor_quote gets a 9-argument version. The old 4-argument one stays, so the site keeps
--    working between running this file and deploying.
--  * Nothing changed at all -> error 'no_change' (no empty history rows).
-- Additive, safe to run more than once.

alter table public.instructor_response_changes add column if not exists old_apply jsonb;
alter table public.instructor_response_changes add column if not exists new_apply jsonb;

create or replace function public.revise_instructor_quote(
  p_response_id uuid,
  p_price numeric,
  p_tax text,
  p_message text,
  p_all_days text,
  p_role text,
  p_experience text,
  p_materials text,
  p_prep text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp public.instructor_responses%rowtype;
  v_status text;
  v_old jsonb;
  v_new jsonb;
  v_tax text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_resp from public.instructor_responses where response_id = p_response_id for update;
  if not found or v_resp.instructor_id <> auth.uid() then raise exception 'not_found'; end if;
  select status into v_status from public.training_requests where request_id = v_resp.request_id;
  if v_status is distinct from 'pending' or v_resp.is_selected or v_resp.action not in ('accept', 'quote') then
    raise exception 'not_editable';
  end if;
  -- A price is needed when the application already had one; an "accept only" application may stay without.
  if p_price is null then
    if v_resp.action = 'quote' then raise exception 'bad_price'; end if;
  elsif p_price < 1 or p_price <> trunc(p_price) then
    raise exception 'bad_price';
  end if;
  if p_tax is not null and p_tax not in ('included', 'excluded') then raise exception 'bad_tax'; end if;
  if p_message is not null and char_length(p_message) > 2000 then raise exception 'bad_message'; end if;
  if p_all_days is not null and p_all_days not in ('all', 'partial', 'none') then raise exception 'bad_apply'; end if;
  if p_materials is not null and p_materials not in ('existing', 'create', 'either') then raise exception 'bad_apply'; end if;
  if p_prep is not null and p_prep not in ('yes', 'no', 'discuss') then raise exception 'bad_apply'; end if;
  if (p_role is not null and char_length(p_role) > 100) or (p_experience is not null and char_length(p_experience) > 1000) then
    raise exception 'bad_apply';
  end if;

  v_tax := case when p_price is null then null else p_tax end;
  v_old := jsonb_build_object('all_days', v_resp.apply_all_days, 'role', v_resp.apply_role, 'experience', v_resp.apply_experience,
                              'materials', v_resp.apply_materials, 'prep', v_resp.apply_prep);
  v_new := jsonb_build_object('all_days', p_all_days, 'role', p_role, 'experience', p_experience,
                              'materials', p_materials, 'prep', p_prep);

  if v_resp.quote_price is not distinct from p_price
     and v_resp.quote_tax_mode is not distinct from v_tax
     and v_resp.message is not distinct from p_message
     and v_old = v_new then
    raise exception 'no_change';
  end if;

  insert into public.instructor_response_changes (response_id, kind, old_price, new_price, old_message, new_message, old_apply, new_apply)
  values (v_resp.response_id, 'revised', v_resp.quote_price, p_price, v_resp.message, p_message, v_old, v_new);

  update public.instructor_responses
     set action = case when p_price is null then 'accept' else 'quote' end,
         quote_price = p_price,
         quote_tax_mode = v_tax,
         message = p_message,
         apply_all_days = p_all_days,
         apply_role = p_role,
         apply_experience = p_experience,
         apply_materials = p_materials,
         apply_prep = p_prep,
         requester_seen_at = null
   where response_id = v_resp.response_id;
end;
$$;

revoke all on function public.revise_instructor_quote(uuid, numeric, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.revise_instructor_quote(uuid, numeric, text, text, text, text, text, text, text) to authenticated;
