/** Small helpers for the company's survey links (see migration 138). */

/** Number of links allowed for a training: 対象人数 plus 20 %, rounded up. */
export function linkCap(participantCount: number): number {
  // whole-number arithmetic, so it always matches the database (ceil(n * 1.2))
  return Math.floor((participantCount * 12 + 9) / 10);
}

export function surveyLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/survey?t=${token}`;
}

/** Turns a database error from the survey functions into a message for the company. */
export function errorMessage(raw: string, cap: number): string {
  if (raw.includes("participant_count_required")) return "対象人数が登録されていないため、リンクを作成できません。";
  if (raw.includes("link_cap_exceeded")) return `リンクは上限（${cap}件）までです。`;
  if (raw.includes("request_not_accepted")) return "依頼が承諾されてから作成できます。";
  if (raw.includes("instructor_not_found")) return "講師が決まってから作成できます。";
  return "処理できませんでした。時間をおいてもう一度お試しください。";
}
