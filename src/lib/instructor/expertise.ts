import { createClient } from "@/lib/supabase/client";

export interface CategoryWithSubcategories {
  id?: string;
  name: string;
  sort_order?: number;
  training_subcategories: { id: string; name: string }[];
}

/** Full taxonomy (used by instructor filters, request forms, profile-edit expertise picker). */
export async function getTrainingCategoriesWithSubcategories() {
  const supabase = createClient();
  return supabase
    .from("training_categories")
    .select("id, name, sort_order, training_subcategories(id, name)")
    .order("sort_order");
}

/** Lightweight taxonomy for <select> options (id + category name / subcategory name). */
/** Fields in the sheet's order: categories by sort_order, then fields by sort_order. */
export async function getTrainingSubcategoryOptions() {
  const supabase = createClient();
  const res = await supabase
    .from("training_subcategories")
    .select("id, name, category_id, sort_order, training_categories(name, sort_order)")
    .order("sort_order");
  if (res.error || !res.data) return res;
  type Row = { sort_order: number; training_categories: { sort_order: number } | null };
  const rows = [...(res.data as unknown as Row[])].sort(
    (a, b) =>
      (a.training_categories?.sort_order ?? 999) - (b.training_categories?.sort_order ?? 999) || a.sort_order - b.sort_order,
  );
  return { ...res, data: rows as unknown as typeof res.data };
}

export async function getOtherCategory() {
  const supabase = createClient();
  return supabase.from("training_categories").select("id, name").eq("name", "その他").maybeSingle();
}

/**
 * Finds (or creates) a subcategory by name within a category. Used both by
 * the "add a field not in the list" flows on post-request/instructor-detail
 * (always under the "その他" category) and on instructor-profile-edit
 * (under whichever category the user is browsing).
 */
export async function findOrCreateSubcategory(categoryId: string, name: string) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const { data: existing, error: findError } = await supabase
    .from("training_subcategories")
    .select("id, name")
    .eq("category_id", categoryId)
    .ilike("name", name)
    .maybeSingle();

  if (findError) return { error: findError };
  if (existing) return { data: existing };

  const { data: maxRow } = await supabase
    .from("training_subcategories")
    .select("sort_order")
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order || 0) + 1;

  const { data: created, error: createError } = await supabase
    .from("training_subcategories")
    .insert({ category_id: categoryId, name, sort_order: nextSortOrder, created_by: userData.user?.id ?? null })
    .select("id, name")
    .single();

  if (createError) return { error: createError };
  return { data: created };
}

export async function getInstructorExpertiseInstructorIds(subcategoryId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("instructor_expertise")
    .select("instructor_id")
    .eq("subcategory_id", subcategoryId);
  return new Set((data || []).map((x) => x.instructor_id));
}

export async function getInstructorExpertiseIds(instructorId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("instructor_expertise")
    .select("subcategory_id")
    .eq("instructor_id", instructorId);
  return (data || []).map((r) => r.subcategory_id);
}

/**
 * Replaces an instructor's expertise rows: delete-all then re-insert the
 * selected subcategory ids. Mirrors instructor-profile-edit.html exactly
 * (simple and reliable, per its own comment).
 */
export async function replaceInstructorExpertise(instructorId: string, subcategoryIds: string[]) {
  const supabase = createClient();
  const { error: deleteError } = await supabase
    .from("instructor_expertise")
    .delete()
    .eq("instructor_id", instructorId);
  if (deleteError) return { error: deleteError };

  if (subcategoryIds.length) {
    const rows = subcategoryIds.map((subcategory_id) => ({ instructor_id: instructorId, subcategory_id }));
    const { error: insertError } = await supabase.from("instructor_expertise").insert(rows);
    if (insertError) return { error: insertError };
  }
  return { error: null };
}
