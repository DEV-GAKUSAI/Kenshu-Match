-- 163: New 研修分野 list from the senior's sheet (55 fields, 9 categories).
-- Safe for existing data: fields are RENAMED / MOVED in place (same id), so instructors'
-- chosen fields and existing requests keep pointing at them. Two fields are split in two:
-- instructors who had the old field get both new ones. Industry fields are kept for now
-- (they move to 詳細条件 later). Safe to run twice.
begin;

-- 1. Categories: rename + add
update public.training_categories set name = 'ビジネススキル・キャリア'
  where name = 'ビジネススキル' and not exists (select 1 from public.training_categories where name = 'ビジネススキル・キャリア');
update public.training_categories set name = '語学・異文化理解'
  where name = '語学' and not exists (select 1 from public.training_categories where name = '語学・異文化理解');
update public.training_categories set name = 'コンプライアンス・労務・安全衛生'
  where name = 'コンプライアンス・労務' and not exists (select 1 from public.training_categories where name = 'コンプライアンス・労務・安全衛生');

insert into public.training_categories (name, sort_order) values
  ('DX・業務効率化', 2), ('講師育成・研修設計', 8)
on conflict (name) do nothing;

update public.training_categories set sort_order = v.so
from (values
  ('IT・技術系', 1), ('DX・業務効率化', 2), ('マネジメント・リーダーシップ', 3), ('ビジネススキル・キャリア', 4),
  ('コンプライアンス・労務・安全衛生', 5), ('セールス・マーケティング', 6), ('語学・異文化理解', 7),
  ('講師育成・研修設計', 8), ('専門・業界特化', 9), ('その他', 10)
) as v(n, so) where name = v.n;

-- 2. Existing fields: rename / move  (old name, new name, category, order)
update public.training_subcategories s
set name = m.new_name, category_id = c.id, sort_order = m.so
from (values
  ('プログラミング基礎（Python／Java／JavaScript等）', 'プログラミング基礎', 'IT・技術系', 2),
  ('バックエンド開発（Node.js／Java／PHP等）', 'バックエンド開発', 'IT・技術系', 3),
  ('フロントエンド開発（React／Vue等）', 'フロントエンド開発', 'IT・技術系', 4),
  ('モバイルアプリ開発（iOS／Android）', 'モバイルアプリ開発', 'IT・技術系', 5),
  ('ソフトウェアテスト・QA', 'ソフトウェアテスト・QA', 'IT・技術系', 7),
  ('データベース設計・SQL', 'データベース基礎・SQL・設計・運用', 'IT・技術系', 8),
  ('データ分析・統計', 'データ分析・統計', 'IT・技術系', 9),
  ('クラウドインフラ（AWS／Azure／GCP）', 'クラウドインフラ', 'IT・技術系', 12),
  ('DevOps・CI/CD', 'DevOps・CI/CD', 'IT・技術系', 13),
  ('ITプロジェクトマネジメント', 'ITプロジェクトマネジメント', 'IT・技術系', 14),
  ('情報セキュリティ', '情報セキュリティ', 'IT・技術系', 15),
  ('AI・機械学習・生成AI活用', 'AI・機械学習・AIシステム開発', 'IT・技術系', 16),
  ('DX推進・業務システム活用', 'DX推進・業務システム活用', 'DX・業務効率化', 17),
  ('1on1・コーチング', '1on1・コーチング', 'マネジメント・リーダーシップ', 21),
  ('チームビルディング', 'チームビルディング', 'マネジメント・リーダーシップ', 22),
  ('リーダーシップ開発', 'リーダーシップ開発', 'マネジメント・リーダーシップ', 23),
  ('新任管理職研修', '新任管理職研修', 'マネジメント・リーダーシップ', 24),
  ('目標管理・評価者研修', '目標管理・評価者研修', 'マネジメント・リーダーシップ', 25),
  ('OJT指導者向け研修', 'OJT指導者育成', 'マネジメント・リーダーシップ', 26),
  ('ビジネスマナー', 'ビジネスマナー', 'ビジネススキル・キャリア', 27),
  ('ビジネスコミュニケーション', 'ビジネスコミュニケーション', 'ビジネススキル・キャリア', 28),
  ('プレゼンテーション', 'プレゼンテーション', 'ビジネススキル・キャリア', 30),
  ('ロジカルシンキング', 'ロジカルシンキング', 'ビジネススキル・キャリア', 31),
  ('交渉術', '交渉術', 'ビジネススキル・キャリア', 33),
  ('時間管理・タスク管理', '時間管理・タスク管理', 'ビジネススキル・キャリア', 34),
  ('キャリアデザイン', 'キャリアデザイン', 'ビジネススキル・キャリア', 36),
  ('製造業向け（品質管理・安全衛生）', '品質管理・業務改善', 'ビジネススキル・キャリア', 38),
  ('ハラスメント防止研修', 'ハラスメント防止研修', 'コンプライアンス・労務・安全衛生', 39),
  ('メンタルヘルス・ストレスケア', 'メンタルヘルス・ストレスケア', 'コンプライアンス・労務・安全衛生', 40),
  ('労務管理・法務基礎', '労務管理・法務基礎', 'コンプライアンス・労務・安全衛生', 41),
  ('情報管理・個人情報保護', '情報管理・個人情報保護', 'コンプライアンス・労務・安全衛生', 42),
  ('デジタルマーケティング', 'デジタルマーケティング', 'セールス・マーケティング', 44),
  ('ブランディング', 'ブランディング', 'セールス・マーケティング', 45),
  ('営業スキル・営業トーク', '営業スキル・営業トーク', 'セールス・マーケティング', 46),
  ('接客・カスタマーサポート（CS）', '接客・カスタマーサポート（CS）', 'セールス・マーケティング', 47),
  ('ビジネス日本語（外国人材向け）', 'ビジネス日本語（外国人材向け）', '語学・異文化理解', 48),
  ('ビジネス英語', 'ビジネス英語', '語学・異文化理解', 49),
  ('ベトナム語', 'ベトナム語', '語学・異文化理解', 50),
  ('中国語', '中国語', '語学・異文化理解', 51),
  ('日常英会話', '日常英会話', '語学・異文化理解', 52)
) as m(old_name, new_name, cat, so)
join public.training_categories c on c.name = m.cat
where s.name = m.old_name;

-- 3. New fields (skipped if a field with that name already exists anywhere)
insert into public.training_subcategories (category_id, name, description, sort_order)
select c.id, v.n, v.d, v.so
from (values
  ('IT・技術系', 'IT基礎・ITリテラシー', 'コンピューター、システム、インターネットの仕組み', 1),
  ('IT・技術系', '要件定義・システム設計', '開発工程、要件定義、基本設計・詳細設計', 6),
  ('IT・技術系', 'ネットワーク', 'TCP/IP、ネットワーク基礎、設計・構築', 10),
  ('IT・技術系', 'OS・サーバー', 'Linux、Windows Server、シェル、構築・運用', 11),
  ('DX・業務効率化', '生成AIの業務活用', '文章作成、情報整理、企画などへの生成AI活用', 18),
  ('DX・業務効率化', 'Office・業務ツール活用', 'Excel、Word、PowerPoint、Microsoft 365など', 19),
  ('DX・業務効率化', '業務自動化・RPA・ノーコード／ローコード', 'VBA、GAS、RPA、Power Automateなど', 20),
  ('ビジネススキル・キャリア', 'ビジネス文書・文章作成', 'メール、報告書、議事録、提案書など', 29),
  ('ビジネススキル・キャリア', '問題発見・課題解決', '問題の整理、原因分析、改善策の立案', 32),
  ('ビジネススキル・キャリア', 'ファシリテーション・会議運営', '議論の進行、意見の引き出し、合意形成', 35),
  ('ビジネススキル・キャリア', '会計・財務基礎', '財務諸表、利益・コスト、会計の基本', 37),
  ('コンプライアンス・労務・安全衛生', '安全衛生・労働安全', '職場の安全、事故防止、安全衛生活動', 43),
  ('語学・異文化理解', '異文化理解・外国人材との協働', '文化・価値観の違い、外国人材の受入れ・協働', 53),
  ('講師育成・研修設計', '講師育成・教え方', '説明、問いかけ、演習支援、フィードバック', 54),
  ('講師育成・研修設計', '研修設計・教材作成', '到達目標、カリキュラム、教材・評価の設計', 55)
) as v(cat, n, d, so)
join public.training_categories c on c.name = v.cat
where not exists (select 1 from public.training_subcategories x where x.name = v.n);

-- 4. Split fields: instructors who had the old field also get the second new field
insert into public.instructor_expertise (instructor_id, subcategory_id)
select ie.instructor_id, n.id
from public.instructor_expertise ie
join public.training_subcategories o on o.id = ie.subcategory_id and o.name = 'AI・機械学習・AIシステム開発'
join public.training_subcategories n on n.name = '生成AIの業務活用'
on conflict do nothing;

insert into public.instructor_expertise (instructor_id, subcategory_id)
select ie.instructor_id, n.id
from public.instructor_expertise ie
join public.training_subcategories o on o.id = ie.subcategory_id and o.name = '品質管理・業務改善'
join public.training_subcategories n on n.name = '安全衛生・労働安全'
on conflict do nothing;

-- 5. Remove the now-empty old category
delete from public.training_categories c
where c.name = '新人・若手向け研修'
  and not exists (select 1 from public.training_subcategories s where s.category_id = c.id);

commit;

-- Check: should list 9 categories (+ その他 if used); the 3 industry fields stay under 専門・業界特化.
-- select c.name as category, s.sort_order, s.name from training_subcategories s join training_categories c on c.id = s.category_id order by c.sort_order, s.sort_order;
