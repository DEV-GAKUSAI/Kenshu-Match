// 次の対応 (#47): one short phrase on each row of the company's request list, saying what the company does next.

export type NextActionApplicant = {
  /** The company has not opened this application yet (shows as NEW). */
  isNew: boolean;
  /** Interview state: null = not asked yet, requested, released, declined. */
  interview: string | null;
  /** The company set this applicant to 見送り. */
  passed: boolean;
  /** Already decided (role-slot requests keep recruiting after the first decision). */
  decided: boolean;
};

export function nextAction({
  statusKey,
  isDraft,
  isBroadcast,
  deadlinePassed,
  isPaused = false,
  applicants,
}: {
  /** requesterDisplayStatus().key */
  statusKey: string;
  isDraft: boolean;
  isBroadcast: boolean;
  deadlinePassed: boolean;
  /** 公開停止中: lecturers cannot see the request, so nobody new can apply. */
  isPaused?: boolean;
  applicants: NextActionApplicant[];
}): string | null {
  if (statusKey === "cancelled" || statusKey === "completed" || statusKey === "rejected") return null;
  if (statusKey === "accepted") return "実施後に研修完了へ";
  if (isDraft) return "公開する";
  if (!isBroadcast) return statusKey === "quoted" ? "見積りの確認・確定" : "講師の返答待ち";

  const open = applicants.filter((a) => !a.decided);
  if (open.length === 0) return deadlinePassed ? "締切を延ばすか取消" : isPaused ? "公開再開が必要" : "応募待ち";
  if (open.some((a) => a.interview === "released" && !a.passed)) return "講師を決定する";
  const fresh = open.filter((a) => a.isNew).length;
  if (fresh > 0) return `応募の確認（NEW ${fresh}名）`;
  const live = open.filter((a) => !a.passed && a.interview !== "declined");
  if (live.some((a) => a.interview !== "requested")) return "面談を依頼する";
  if (live.length > 0) return "講師の情報公開待ち";
  return "応募者の検討";
}
