-- Review sheet #50 / #49: a negative (or zero, or fractional) quote must not be stored.
-- NOT VALID: existing test rows (e.g. a -1 quote) are left alone; every new or updated row is checked.
alter table public.instructor_responses
  drop constraint if exists instructor_responses_quote_price_positive;

alter table public.instructor_responses
  add constraint instructor_responses_quote_price_positive
  check (quote_price is null or (quote_price >= 1 and quote_price = trunc(quote_price)))
  not valid;
