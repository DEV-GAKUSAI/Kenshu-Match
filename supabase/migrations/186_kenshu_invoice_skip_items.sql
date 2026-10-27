-- Kenshu Link #44 follow-up: the instructor can leave off order cost rows that did not happen (e.g. a cancelled pre-training).
--
--  * submit_invoice gets a 10th argument p_skip_items (0-based positions in the confirmed order's items).
--    The 9-argument version stays and keeps copying every row, so older app code keeps working.
--  * Rows left off are simply not copied into request_invoices.items; the change history shows the difference.
--
-- Safe to run twice.

create or replace function public.submit_invoice(
  p_response_id uuid, p_extra numeric, p_extra_note text, p_note text, p_quantity numeric,
  p_due_date date, p_bank jsonb, p_registration_no text, p_receipts jsonb, p_skip_items integer[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_ord public.request_orders%rowtype;
  v_skip integer[] := coalesce(p_skip_items, '{}'::integer[]);
  v_len integer;
  v_pos integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(array_length(v_skip, 1), 0) > 20 then raise exception 'bad_items'; end if;

  v_id := public.submit_invoice(p_response_id, p_extra, p_extra_note, p_note, p_quantity, p_due_date, p_bank, p_registration_no, p_receipts);

  if coalesce(array_length(v_skip, 1), 0) > 0 then
    select * into v_ord from public.request_orders where response_id = p_response_id and status = 'confirmed';
    v_len := case when found and jsonb_typeof(v_ord.items) = 'array' then jsonb_array_length(v_ord.items) else 0 end;
    foreach v_pos in array v_skip loop
      if v_pos < 0 or v_pos >= v_len then raise exception 'bad_items'; end if;
    end loop;
    update public.request_invoices
       set items = coalesce((
             select jsonb_agg(e.value order by e.ord)
               from jsonb_array_elements(v_ord.items) with ordinality as e(value, ord)
              where not ((e.ord - 1)::integer = any (v_skip))
           ), '[]'::jsonb)
     where invoice_id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.submit_invoice(uuid, numeric, text, text, numeric, date, jsonb, text, jsonb, integer[]) from public, anon;
grant execute on function public.submit_invoice(uuid, numeric, text, text, numeric, date, jsonb, text, jsonb, integer[]) to authenticated;
