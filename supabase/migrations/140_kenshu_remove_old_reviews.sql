-- Removes the old 1-5 star review system from Kenshu Link.
-- The 研修アンケート (migration 138) is now the only instructor rating.
--
-- ORDER (important):
--   1. Deploy the Kenshu Link code that no longer reads training_reviews.
--   2. (Optional) export the table first:  select * from public.training_reviews;
--   3. Run this file. The old review rows are deleted for good.
--
-- The directory view keeps the same columns (rating_avg and review_count stay
-- as 0) so nothing else that reads it breaks. The leftover column
-- instructor_profiles.rating_avg is not touched.
-- Safe to run more than once.

create or replace view public.instructor_public_directory as
 select ip.id,
    u.name,
    ip.prefectures,
    ip.years_of_experience,
    ip.self_pr,
    ip.work_style,
    ip.desired_rate_min,
    ip.desired_rate_max,
    ip.portfolio_url,
    ip.avatar_url,
    ip.certifications,
    0::numeric as rating_avg,
    0::bigint as review_count,
    ip.created_at,
    coalesce((select array_agg(sc.name order by sc.name)
              from public.instructor_expertise ie
              join public.training_subcategories sc on sc.id = ie.subcategory_id
              where ie.instructor_id = ip.id), array[]::text[]) as expertise_fields,
    ip.is_featured
   from public.instructor_profiles ip
     join public.users u on u.id = ip.id
  where ip.is_public = true and u.status = 'ACTIVE';

drop view if exists public.instructor_public_reviews;
drop table if exists public.training_reviews;
