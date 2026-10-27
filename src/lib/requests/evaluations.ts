import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { EvalInput, Reuse } from "./evaluation-calc.ts";

// 講師の評価 (#55). Private to the company (migration 190).

export type EvaluationRow = {
  evaluation_id: string;
  request_id: string;
  response_id: string;
  instructor_id: string;
  expertise: number;
  teaching: number;
  preparation: number;
  communication: number;
  cooperation: number;
  reuse: Reuse;
  comment: string | null;
  evaluator_name: string;
  created_at: string;
  updated_at: string;
};

const ERRORS: Record<string, string> = {
  not_completed: "研修が完了してから評価できます。",
  not_decided: "決定した講師だけ評価できます。",
  not_evaluable: "この講師は評価できません。",
};

function message(raw: string) {
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : "保存できませんでした。もう一度お試しください。";
}

function db() {
  return createClient() as unknown as SupabaseClient;
}

export async function getEvaluation(responseId: string): Promise<EvaluationRow | null> {
  const { data } = await db().from("request_instructor_evaluations").select("*").eq("response_id", responseId).maybeSingle();
  return (data as EvaluationRow | null) ?? null;
}

export async function saveEvaluation(
  target: { requestId: string; responseId: string; requesterId: string; instructorId: string },
  v: EvalInput,
  existingId?: string,
): Promise<{ error: { message: string } | null }> {
  const fields = {
    expertise: v.expertise,
    teaching: v.teaching,
    preparation: v.preparation,
    communication: v.communication,
    cooperation: v.cooperation,
    reuse: v.reuse,
    comment: v.comment.trim() || null,
    evaluator_name: v.evaluator_name.trim(),
  };
  const { error } = existingId
    ? await db().from("request_instructor_evaluations").update(fields).eq("evaluation_id", existingId)
    : await db()
        .from("request_instructor_evaluations")
        .insert({ request_id: target.requestId, response_id: target.responseId, requester_id: target.requesterId, instructor_id: target.instructorId, ...fields });
  return { error: error ? { message: message(error.message) } : null };
}
