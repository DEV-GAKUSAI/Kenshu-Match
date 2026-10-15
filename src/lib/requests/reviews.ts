import { createClient } from "@/lib/supabase/client";

export async function getInstructorReviews(instructorId: string) {
  const supabase = createClient();
  // Public reviews come from a view without reviewer or request ids.
  return supabase
    .from("instructor_public_reviews")
    .select("rating, comment, created_at")
    .eq("instructor_id", instructorId)
    .order("created_at", { ascending: false });
}

export async function submitReview(input: {
  request_id: string;
  reviewer_id: string;
  instructor_id: string;
  rating: number;
  comment: string | null;
}) {
  const supabase = createClient();
  const { error } = await supabase.from("training_reviews").upsert(input, { onConflict: "request_id" });
  return { error };
}

export async function replyToReview(reviewId: string, replyText: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("training_reviews")
    .update({ instructor_reply: replyText, replied_at: new Date().toISOString() })
    .eq("review_id", reviewId);
  return { error };
}
