-- 177_kenshu_survey_import_names.sql
--
-- #38 (10/23 note, point 3): in an imported file, the name typed on a 依頼企業 row must be
-- the name that is shown, not the name of the company that is logged in.
-- Only the public comment view changes:
--   participant row  -> typed name, or 「参加者」
--   company row, anonymous (no name typed / answered anonymously) -> 「依頼企業（匿名）」
--   company row with a typed name (imports)  -> that name
--   company row answered in Kenshu Link, not anonymous (no typed name) -> the company's name, as before
-- Safe to run twice.

begin;

create or replace view public.instructor_survey_comments as
 select a.answer_id,
        a.instructor_id,
        a.role,
        a.comment,
        case
          when a.role = 'PARTICIPANT' then coalesce(a.display_name, '参加者')
          when a.is_anonymous then '依頼企業（匿名）'
          else coalesce(nullif(btrim(a.display_name), ''), nullif(rp.company_name, ''), '依頼企業')
        end as author_label,
        round((a.q1 + a.q2 + a.q3 + a.q4 + a.q5) / 5.0, 2) as score,
        a.instructor_reply,
        a.replied_at,
        a.created_at
   from public.training_survey_answers a
   join public.training_surveys s on s.survey_id = a.survey_id
   join public.instructor_profiles ip on ip.id = a.instructor_id
   join public.users u on u.id = a.instructor_id
   left join public.requester_profiles rp on rp.id = s.requester_id
  where a.comment is not null and not a.is_hidden
    and ip.is_public = true and u.status = 'ACTIVE';

grant select on public.instructor_survey_comments to anon, authenticated;

commit;
