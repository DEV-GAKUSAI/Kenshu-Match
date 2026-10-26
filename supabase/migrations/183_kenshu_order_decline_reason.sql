-- 183: a lecturer who declines an order (注文書) gives a reason; the company sees it (#51 test findings).
--  * request_orders.decline_reason (max 300 chars).
--  * respond_order(order, accept, reason): declining needs a reason. The old 2-argument version stays.
--  * the reason is cleared when the company re-issues the order (the old one stays in the version history snapshot).
-- Safe to run twice.

begin;

alter table public.request_orders add column if not exists decline_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'request_orders_decline_reason_len') then
    alter table public.request_orders add constraint request_orders_decline_reason_len
      check (decline_reason is null or char_length(decline_reason) <= 300);
  end if;
end $$;

create or replace function public.respond_order(p_order_id uuid, p_accept boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.request_orders%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_o from public.request_orders where order_id = p_order_id for update;
  if not found or v_o.instructor_id <> auth.uid() then raise exception 'not_found'; end if;
  if v_o.status <> 'issued' then raise exception 'not_editable'; end if;
  if not p_accept and v_reason is null then raise exception 'reason_required'; end if;
  if v_reason is not null and char_length(v_reason) > 300 then raise exception 'too_long'; end if;
  update public.request_orders
     set status = case when p_accept then 'confirmed' else 'declined' end,
         responded_at = now(),
         decline_reason = case when p_accept then null else v_reason end
   where order_id = p_order_id;
end;
$$;

revoke all on function public.respond_order(uuid, boolean, text) from public, anon;
grant execute on function public.respond_order(uuid, boolean, text) to authenticated;

create or replace function public.clear_order_decline_reason()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'issued' and old.status is distinct from 'issued' then
    new.decline_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists request_orders_clear_decline on public.request_orders;
create trigger request_orders_clear_decline before update of status on public.request_orders
  for each row execute function public.clear_order_decline_reason();

commit;
