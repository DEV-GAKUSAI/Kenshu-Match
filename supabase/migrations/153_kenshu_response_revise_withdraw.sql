-- 153_kenshu_response_revise_withdraw.sql
--
-- #62 応募の修正・撤回・条件再提示
-- Before the company decides, an instructor can change the quote (price, tax,
-- message) or withdraw the application. Both go through a function that checks
-- the rules and writes a history row the company can see. After the decision
-- (selected, or the request is no longer open) nothing can be changed here.
-- Additive, safe to run more than once.

create table if not exists public.instructor_response_changes (
  change_id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.instructor_responses(response_id) on delete cascade,
  kind text not null check (kind in ('revised', 'withdrawn')),
  old_price numeric,
  new_price numeric,
  old_message text,
  new_message text,
  created_at timestamptz not null default now()
);

create index if not exists instructor_response_changes_response_idx
  on public.instructor_response_changes (response_id, created_at desc);

alter table public.instructor_response_changes enable row level security;

drop policy if exists instructor_response_changes_select_instructor on public.instructor_response_changes;
create policy instructor_response_changes_select_instructor on public.instructor_response_changes
  for select to authenticated using (
    exists (select 1 from public.instructor_responses r
             where r.response_id = instructor_response_changes.response_id and r.instructor_id = (select auth.uid()))
  );

drop policy if exists instructor_response_changes_select_requester on public.instructor_response_changes;
create policy instructor_response_changes_select_requester on public.instructor_response_changes
  for select to authenticated using (
    exists (select 1 from public.instructor_responses r
             where r.response_id = instructor_response_changes.response_id and public.is_requester_of_request(r.request_id))
  );

revoke all on public.instructor_response_changes from anon;
grant select on public.instructor_response_changes to authenticated;

-- Change the quote of an application that is still open.
create or replace function public.revise_instructor_quote(p_response_id uuid, p_price numeric, p_tax text, p_message text)
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
  if v_status is distinct from 'pending' or v_resp.is_selected or v_resp.action not in ('accept', 'quote') then
    raise exception 'not_editable';
  end if;
  if p_price is null or p_price < 1 or p_price <> trunc(p_price) then raise exception 'bad_price'; end if;
  if p_tax is not null and p_tax not in ('included', 'excluded') then raise exception 'bad_tax'; end if;
  if p_message is not null and char_length(p_message) > 2000 then raise exception 'bad_message'; end if;

  insert into public.instructor_response_changes (response_id, kind, old_price, new_price, old_message, new_message)
  values (v_resp.response_id, 'revised', v_resp.quote_price, p_price, v_resp.message, p_message);

  update public.instructor_responses
     set action = 'quote',
         quote_price = p_price,
         quote_tax_mode = p_tax,
         message = p_message,
         requester_seen_at = null
   where response_id = v_resp.response_id;
end;
$$;

-- Withdraw an application that is still open.
create or replace function public.withdraw_instructor_response(p_response_id uuid)
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
  if v_status is distinct from 'pending' or v_resp.is_selected or v_resp.action not in ('accept', 'quote') then
    raise exception 'not_editable';
  end if;

  insert into public.instructor_response_changes (response_id, kind, old_price, new_price, old_message, new_message)
  values (v_resp.response_id, 'withdrawn', v_resp.quote_price, null, v_resp.message, null);

  update public.instructor_responses
     set action = 'withdrawn', requester_seen_at = null
   where response_id = v_resp.response_id;
end;
$$;

revoke all on function public.revise_instructor_quote(uuid, numeric, text, text) from public, anon;
revoke all on function public.withdraw_instructor_response(uuid) from public, anon;
grant execute on function public.revise_instructor_quote(uuid, numeric, text, text) to authenticated;
grant execute on function public.withdraw_instructor_response(uuid) to authenticated;
