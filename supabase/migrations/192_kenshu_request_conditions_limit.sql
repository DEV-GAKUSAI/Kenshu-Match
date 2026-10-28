-- 192: a request can now also hold 分野・ツールの条件 (key "skill": kind field/tool, name, optional years, optional spoke)
-- next to the six fixed items (migration 191), so the most conditions per request goes from 12 to 30.
-- Only the size limit changes; the rows already saved stay valid. Idempotent.

alter table public.training_requests drop constraint if exists training_requests_req_conditions_check;
alter table public.training_requests add constraint training_requests_req_conditions_check
  check (jsonb_typeof(req_conditions) = 'array' and jsonb_array_length(req_conditions) <= 30);
