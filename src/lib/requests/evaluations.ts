import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { summarizeEvaluations, type EvalInput, type EvalSummary, type Reuse } from "./evaluation-calc.ts";

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

/** Per lecturer summary of everything this company has rated (the book shows it). */
export async function getMyEvaluationSummary(): Promise<Record<string, EvalSummary>> {
  const { data } = await db().from("request_instructor_evaluations").select("instructor_id, expertise, teaching, preparation, communication, cooperation, reuse");
  return summarizeEvaluations((data as Parameters<typeof summarizeEvaluations>[0] | null) ?? []);
}

/** Which of these replies this company has already rated (for the reminder dot). */
export async function getEvaluatedResponseIds(responseIds: string[]): Promise<Set<string>> {
  if (responseIds.length === 0) return new Set();
  const { data } = await db().from("request_instructor_evaluations").select("response_id").in("response_id", responseIds);
  return new Set(((data as { response_id: string }[] | null) ?? []).map((x) => x.response_id));
}
