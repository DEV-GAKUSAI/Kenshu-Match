-- 164: 詳細条件 (detail conditions) for training requests, from the senior's sheet.
-- A request can carry extra choices on top of its field: 対象者, 対象業界, 技術・製品・ツール,
-- 研修レベル (one), 資格対策の有無 (one), 対象資格, 研修の実施言語.
-- One catalogue table holds every option (add rows later for more options, no code change);
-- the request stores the chosen option ids. Additive, safe to run twice.
begin;

create table if not exists public.training_detail_options (
    id uuid primary key default gen_random_uuid(),
    group_key text not null,
    name text not null,
    sort_order integer not null,
    created_at timestamptz not null default now(),
    constraint training_detail_options_group_check
      check (group_key in ('audience','industry','tool','level','cert_prep','cert','language')),
    constraint training_detail_options_group_name_key unique (group_key, name)
);

alter table public.training_detail_options enable row level security;
revoke all on public.training_detail_options from public;
grant select on public.training_detail_options to anon, authenticated;
grant select, insert, update, delete on public.training_detail_options to service_role;

drop policy if exists training_detail_options_select_all on public.training_detail_options;
create policy training_detail_options_select_all on public.training_detail_options
  for select to anon, authenticated using (true);

insert into public.training_detail_options (group_key, name, sort_order) values
  ('audience', '内定者', 1),
  ('audience', '新入社員', 2),
  ('audience', '若手社員', 3),
  ('audience', '中堅社員', 4),
  ('audience', '管理職', 5),
  ('audience', '経営層', 6),
  ('audience', '全社員', 7),
  ('audience', '外国人材', 8),
  ('audience', 'OJT指導者', 9),
  ('audience', '社内講師', 10),
  ('audience', 'その他', 11),
  ('industry', '医療・介護', 1),
  ('industry', '小売・サービス', 2),
  ('industry', '製造', 3),
  ('industry', '金融', 4),
  ('industry', 'IT・情報通信', 5),
  ('industry', '教育', 6),
  ('industry', '官公庁・自治体', 7),
  ('industry', 'その他', 8),
  ('industry', '業界指定なし', 9),
  ('tool', 'Java', 1),
  ('tool', 'Python', 2),
  ('tool', 'JavaScript', 3),
  ('tool', 'TypeScript', 4),
  ('tool', 'PHP', 5),
  ('tool', 'Node.js', 6),
  ('tool', 'React', 7),
  ('tool', 'Vue', 8),
  ('tool', 'Spring Boot', 9),
  ('tool', 'iOS', 10),
  ('tool', 'Android', 11),
  ('tool', 'Oracle', 12),
  ('tool', 'MySQL', 13),
  ('tool', 'PostgreSQL', 14),
  ('tool', 'SQL Server', 15),
  ('tool', 'Linux', 16),
  ('tool', 'Windows Server', 17),
  ('tool', 'AWS', 18),
  ('tool', 'Azure', 19),
  ('tool', 'GCP', 20),
  ('tool', 'Excel', 21),
  ('tool', 'Word', 22),
  ('tool', 'PowerPoint', 23),
  ('tool', 'Microsoft 365', 24),
  ('tool', 'Google Workspace', 25),
  ('tool', 'VBA', 26),
  ('tool', 'GAS', 27),
  ('tool', 'RPA', 28),
  ('tool', 'Power Automate', 29),
  ('level', '入門', 1),
  ('level', '基礎', 2),
  ('level', '実務', 3),
  ('level', '応用', 4),
  ('cert_prep', '資格対策あり', 1),
  ('cert_prep', '資格対策なし', 2),
  ('cert', 'ITパスポート', 1),
  ('cert', '基本情報技術者', 2),
  ('cert', '応用情報技術者', 3),
  ('cert', 'Oracle認定資格', 4),
  ('cert', 'LinuC', 5),
  ('cert', 'LPIC', 6),
  ('cert', 'CCNA', 7),
  ('cert', 'AWS認定資格', 8),
  ('cert', 'Microsoft認定資格', 9),
  ('cert', 'Google Cloud認定資格', 10),
  ('cert', 'その他', 11),
  ('language', '日本語', 1),
  ('language', '英語', 2),
  ('language', 'ベトナム語', 3),
  ('language', '中国語', 4),
  ('language', 'その他', 5)
on conflict (group_key, name) do nothing;

alter table public.training_requests
  add column if not exists detail_option_ids uuid[] not null default '{}',
  add column if not exists detail_other_tools text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_requests_detail_check') then
    alter table public.training_requests add constraint training_requests_detail_check
      check (cardinality(detail_option_ids) <= 80 and (detail_other_tools is null or char_length(detail_other_tools) <= 200));
  end if;
end $$;

-- The public preview shows the same details (new columns at the end).
create or replace view public.open_requests_public_preview as
 select request_id,
    title,
    description,
    requester_type,
    preferred_format,
    budget,
    location,
    preferred_schedule,
    expertise_field,
    participant_count,
    created_at,
    budget_unit,
    tax_mode,
    transport_cost,
    lodging_cost,
    prep_cost,
    payment_terms,
    schedule_days,
    all_days_required,
    req_skills,
    req_prep,
    detail_option_ids,
    detail_other_tools
   from public.training_requests tr
  where status = 'pending' and target_instructor_id is null;

commit;
