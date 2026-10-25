// How an applicant moves to a decision (#41, #42, #48): 応募 → 面談の依頼 → 講師が情報を公開 → 決定.
// The company can only decide after the instructor released their information, so the card tells
// the company what to do next instead of just hiding the button.

export const INTERVIEW_STEPS = ["応募", "面談の依頼", "情報の公開", "決定"] as const;

export type InterviewGuide = {
  /** How many steps are done (0..4). The step at this index is the one to do next. */
  done: number;
  /** Short text telling the company what to do next (null when nothing needs saying). */
  hint: string | null;
  /** Show the 「面談を依頼する」 button (request without booking a meeting). */
  canRequest: boolean;
};

export function interviewGuide({
  interview,
  decided,
  passed,
  canBook,
}: {
  interview: string | null | undefined;
  decided: boolean;
  /** The company set this applicant to 見送り. */
  passed: boolean;
  /** The meeting booking button is available for this applicant. */
  canBook: boolean;
}): InterviewGuide {
  if (decided) return { done: 4, hint: null, canRequest: false };
  if (interview === "declined") {
    return { done: 1, hint: "講師が面談を辞退しました。ほかの応募者を検討してください。", canRequest: false };
  }
  if (interview === "released") return { done: 3, hint: null, canRequest: false };
  if (interview === "requested") return { done: 2, hint: null, canRequest: false };
  if (passed) return { done: 1, hint: null, canRequest: false };
  return {
    done: 1,
    hint: canBook
      ? "決定するには、先に面談を予約するか、「面談を依頼する」を押してください。講師が情報を公開すると、決定できます。"
      : "決定するには、先に「面談を依頼する」を押してください。講師が情報を公開すると、決定できます。（この講師は予約での面談ができません）",
    canRequest: true,
  };
}
