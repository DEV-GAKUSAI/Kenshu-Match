import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { applySurveySummary, type SurveySummaryMap } from "./summary.ts";

/** Reads the public survey averages for many instructors at once. If it fails, rows are returned unchanged. */
export async function withSurveySummary<T extends { id: string }>(rows: T[]) {
  if (!rows.length) return rows;
  try {
    const supabase = createClient() as unknown as SupabaseClient;
    const { data } = await supabase
      .from("instructor_survey_summary")
      .select("instructor_id, overall_avg, answer_count")
      .in("instructor_id", rows.map((row) => row.id));
    const map: SurveySummaryMap = {};
    for (const item of (data as { instructor_id: string; overall_avg: number | null; answer_count: number }[] | null) ?? []) {
      if (item.overall_avg !== null) map[item.instructor_id] = { avg: Number(item.overall_avg), count: item.answer_count };
    }
    return applySurveySummary(rows, map);
  } catch {
    return rows;
  }
}
