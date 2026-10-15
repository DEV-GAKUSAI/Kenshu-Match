-- Reviews of public instructors were readable by anyone (even logged-out
-- visitors), including reviewer_id and request_id. The page only shows
-- 「利用者」, but the ids could be read straight from the database.
--
-- Now: visitors read reviews through a view that has only the stars, the
-- comment, the date and the instructor's reply. The table itself can be read
-- only by the reviewer and the instructor of that review. Nothing is deleted
-- or changed in the data. Safe to run more than once.

create or replace view public.instructor_public_reviews as
 select r.review_id,
    r.instructor_id,
    r.rating,
    r.comment,
    r.instructor_reply,
    r.replied_at,
    r.created_at
   from public.training_reviews r
     join public.instructor_profiles ip on ip.id = r.instructor_id
     join public.users u on u.id = r.instructor_id
  where ip.is_public = true and u.status = 'ACTIVE';

grant select on public.instructor_public_reviews to anon, authenticated;

drop policy if exists training_reviews_select on public.training_reviews;
create policy training_reviews_select on public.training_reviews
  for select to authenticated using (
    auth.uid() = reviewer_id
    or auth.uid() = instructor_id
  );
