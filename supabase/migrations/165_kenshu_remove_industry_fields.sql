-- 165: Remove the three industry fields (医療・介護業界向け / 金融業界向け / 小売・サービス業向け).
-- Industry is now a 詳細条件 (対象業界, migration 164). Requests that used one of them get the
-- matching 対象業界 tag and move to a neutral field 「その他」; instructors' rows for these fields
-- are deleted with the field. Run after 163 and 164. Safe to run twice.
begin;

insert into public.training_categories (name, sort_order) values ('その他', 10)
on conflict (name) do nothing;

insert into public.training_subcategories (category_id, name, description, sort_order)
select c.id, 'その他', 'リストにない分野', 99
from public.training_categories c
where c.name = 'その他'
  and not exists (select 1 from public.training_subcategories x where x.category_id = c.id and x.name = 'その他');

-- 1. Requests: add the industry tag, then move to the neutral field
update public.training_requests r
set detail_option_ids = case
      when o.id is null or o.id = any (r.detail_option_ids) then r.detail_option_ids
      else array_append(r.detail_option_ids, o.id)
    end,
    expertise_field = fb.id
from public.training_subcategories s
left join public.training_detail_options o
  on o.group_key = 'industry'
 and o.name = case s.name
       when '医療・介護業界向け' then '医療・介護'
       when '金融業界向け' then '金融'
       when '小売・サービス業向け' then '小売・サービス'
     end
cross join lateral (
  select x.id from public.training_subcategories x
  join public.training_categories cc on cc.id = x.category_id
  where cc.name = 'その他' and x.name = 'その他' limit 1
) fb
where r.expertise_field = s.id
  and s.name in ('医療・介護業界向け', '金融業界向け', '小売・サービス業向け');

-- 2. Delete the fields (instructor_expertise rows go with them)
delete from public.training_subcategories
where name in ('医療・介護業界向け', '金融業界向け', '小売・サービス業向け');

-- 3. Remove the old category if it is empty now
delete from public.training_categories c
where c.name = '専門・業界特化'
  and not exists (select 1 from public.training_subcategories s where s.category_id = c.id);

commit;

-- Check:
-- select c.name as category, s.name from training_subcategories s join training_categories c on c.id = s.category_id order by c.sort_order, s.sort_order;
