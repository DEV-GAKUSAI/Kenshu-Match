// Extra filters for the company's request list (#47): 募集状況, 職種, 開催月.

export type RecruitState = "open" | "closed" | "paused";

export const RECRUIT_STATE_LABEL: Record<RecruitState, string> = { open: "募集中", closed: "受付終了", paused: "公開停止中" };

/** Recruiting state of an open request for everyone (null: draft, direct request, decided, cancelled or completed). */
export function recruitState({
  status,
  publishState,
  isBroadcast,
  deadlinePassed,
}: {
  status: string;
  publishState: string;
  isBroadcast: boolean;
  deadlinePassed: boolean;
}): RecruitState | null {
  if (!isBroadcast || status !== "pending" || publishState === "draft") return null;
  if (deadlinePassed) return "closed";
  return publishState === "paused" ? "paused" : "open";
}

/** "YYYY-MM" of every dated day of a request's schedule. */
export function monthsOfDays(days: { date: string }[]): string[] {
  return [...new Set(days.map((d) => d.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).map((d) => d.slice(0, 7)))];
}

/** 「2026-11」 → 「2026年11月」 */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}
