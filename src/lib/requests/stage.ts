// 選考段階 (#48): where an applicant is in the selection, separate from the request state.
// 応募 → 書類確認 → 面談 → 条件調整 → 決定 / 見送り.
// 応募, 面談 and 決定 come from data the app already has; the company sets 書類確認, 条件調整, 見送り by hand.

export type ManualStage = "screening" | "negotiation" | "passed";
export type StageKey = "applied" | "screening" | "interview" | "negotiation" | "selected" | "passed";

export const STAGE_LABEL: Record<StageKey, string> = {
  applied: "応募",
  screening: "書類確認",
  interview: "面談",
  negotiation: "条件調整",
  selected: "決定",
  passed: "見送り",
};

/** What the company can pick by hand (応募 clears the manual stage). */
export const MANUAL_STAGE_OPTIONS: { value: "" | ManualStage; label: string }[] = [
  { value: "", label: "応募" },
  { value: "screening", label: "書類確認" },
  { value: "negotiation", label: "条件調整" },
  { value: "passed", label: "見送り" },
];

export function isManualStage(x: unknown): x is ManualStage {
  return x === "screening" || x === "negotiation" || x === "passed";
}

type ResponseLike = {
  action?: string | null;
  is_selected?: boolean | null;
  interview_status?: string | null;
  stage?: string | null;
};

/**
 * The stage to show for one applicant. `requestClosed` = the request is accepted/completed
 * (recruiting ended): applicants who were not decided are 見送り.
 */
export function stageOf(r: ResponseLike, requestClosed: boolean): StageKey {
  if (r.is_selected) return "selected";
  if (requestClosed) return "passed";
  if (r.stage === "passed") return "passed";
  if (r.stage === "negotiation") return "negotiation";
  if (r.interview_status === "requested" || r.interview_status === "released") return "interview";
  if (r.stage === "screening") return "screening";
  return "applied";
}
