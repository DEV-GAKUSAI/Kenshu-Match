-- Review sheet #50: no quote or budget above 10,000,000 yen (1兆円 could be saved before).
-- A trigger (not a table check) so an old test row with a huge amount can still be updated for other reasons;
-- only a NEW or CHANGED amount is checked. The app uses the same number (MAX_AMOUNT in lib/requests/money.ts).

create or replace function public.guard_amount_limit()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'instructor_responses' then
    if new.quote_price is not null and new.quote_price > 10000000
       and (tg_op = 'INSERT' or new.quote_price is distinct from old.quote_price) then
      raise exception '見積り金額は10,000,000円以下で入力してください。' using errcode = '23514';
    end if;
  else
    if new.budget is not null and new.budget > 10000000
       and (tg_op = 'INSERT' or new.budget is distinct from old.budget) then
      raise exception '予算は10,000,000円以下で入力してください。' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists instructor_responses_guard_amount on public.instructor_responses;
create trigger instructor_responses_guard_amount
  before insert or update of quote_price on public.instructor_responses
  for each row execute function public.guard_amount_limit();

drop trigger if exists training_requests_guard_amount on public.training_requests;
create trigger training_requests_guard_amount
  before insert or update of budget on public.training_requests
  for each row execute function public.guard_amount_limit();
