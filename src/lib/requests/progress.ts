// The steps of a 公募依頼 as both sides see them: 応募 → 面談 → 決定 → 研修 → 完了.
// (注文書・請求書 have their own flow inside the 「注文書・請求書」 tab.)

export const PROGRESS_STEPS = ["応募", "面談", "決定", "研修", "完了"] as const;

export type ProgressInput = {
  /** training_requests.status */
  status: string;
  /** At least one lecturer applied (company side) / this lecturer applied (lecturer side). */
  applied: boolean;
  /** The lecturer released their name, so the company can decide. */
  interviewReleased: boolean;
  /** Someone is decided for a role (or the whole request). */
  decided: boolean;
};

/**
 * Index of the step that is "now" (0–4). 5 means everything is done. null: do not show a strip (cancelled).
 * Steps before the index are done.
 */
export function progressIndex(i: ProgressInput): number | null {
  if (i.status === "cancelled") return null;
  if (i.status === "completed") return PROGRESS_STEPS.length;
  if (i.decided || i.status === "accepted") return 3;
  if (i.interviewReleased) return 2;
  if (i.applied) return 1;
  return 0;
}
