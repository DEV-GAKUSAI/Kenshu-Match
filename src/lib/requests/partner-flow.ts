// Partner company accounts (#53): wording and small rules used by both sides.
// Pure functions, so the texts live in one place and are tested.

export type PartnerRole = "contract" | "via";
export type ProposalStatus = "new" | "accepted" | "passed" | "withdrawn";

export const INVITE_CODE_LENGTH = 8;

/** What a person types or pastes (spaces, dashes, lower case) -> the code as stored (8 letters/digits). */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, INVITE_CODE_LENGTH);
}

/** K7M29QXA -> K7M2-9QXA (easier to read and to say aloud). */
export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export function isCompleteInviteCode(input: string): boolean {
  return normalizeInviteCode(input).length === INVITE_CODE_LENGTH;
}

/** 「あと6日」「あと3時間」「期限切れ」 */
export function inviteLeftText(expiresAt: string, now: number = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "期限切れ";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "あと1時間未満";
  if (hours < 24) return `あと${hours}時間`;
  return `あと${Math.floor(hours / 24)}日`;
}

export const PARTNER_ROLE_TEXT: Record<PartnerRole, string> = { contract: "契約先", via: "間に入る関係先" };

export function partnerRoleText(role: string | null | undefined): string {
  return role === "contract" || role === "via" ? PARTNER_ROLE_TEXT[role] : "関係先";
}

export const PROPOSAL_STATUS_TEXT: Record<ProposalStatus, string> = {
  new: "確認待ち",
  accepted: "採用されました",
  passed: "見送り",
  withdrawn: "取り下げ済み",
};

export function proposalStatusText(status: string | null | undefined): string {
  return status && status in PROPOSAL_STATUS_TEXT ? PROPOSAL_STATUS_TEXT[status as ProposalStatus] : "確認待ち";
}

/** Result text of accept_partner_invite when it answers {ok:false, reason}. */
export function inviteReasonText(reason: string | null | undefined): string {
  switch (reason) {
    case "invalid_code":
      return "招待コードが見つかりません。入力内容をご確認ください。";
    case "code_used":
      return "この招待コードはすでに使われています。依頼元の企業に、新しいコードを発行してもらってください。";
    case "code_expired":
      return "この招待コードは有効期限が切れています。依頼元の企業に、新しいコードを発行してもらってください。";
    case "own_code":
      return "ご自身の企業が発行したコードは使えません。協力会社のアカウントで入力してください。";
    case "too_many_attempts":
      return "入力の失敗が続いたため、しばらく入力できません。1時間ほどしてからもう一度お試しください。";
    default:
      return "連携できませんでした。時間をおいてもう一度お試しください。";
  }
}

/** Error code raised by the partner functions -> message. */
export function partnerErrorText(code: string | null | undefined): string {
  switch (code) {
    case "not_authenticated":
      return "ログインしてください。";
    case "not_company":
      return "企業アカウントでログインしてください。";
    case "not_a_company":
      return "招待コードは、区分が「協力会社」の関係先だけに発行できます。";
    case "not_found":
      return "対象が見つかりません。画面を読み込み直してください。";
    case "request_closed":
      return "この依頼はキャンセル済み、または完了しているため、提案できません。";
    case "bad_name":
      return "講師名は1〜100文字で入力してください。";
    case "bad_note":
      return "メモは500文字以内で入力してください。";
    case "not_an_instructor":
      return "選んだ方は、Kenshu Linkの講師として登録されていません。";
    case "too_many":
      return "確認待ちの提案が10件に達しています。採用・見送りの結果が出てから、追加してください。";
    case "already_decided":
      return "この提案はすでに処理されています。画面を読み込み直してください。";
    case "account_link_forbidden":
      return "この操作はできません。";
    default:
      return "処理できませんでした。時間をおいてもう一度お試しください。";
  }
}

/** Counts of a request's proposals by status. */
export function countProposals(list: { status: string }[]): { new: number; accepted: number; passed: number; withdrawn: number } {
  const out = { new: 0, accepted: 0, passed: 0, withdrawn: 0 };
  for (const p of list) if (p.status in out) out[p.status as ProposalStatus]++;
  return out;
}

/** Does the partner still need to do something? (a request that is open and has no proposal waiting or adopted) */
export function canPropose(status: string): boolean {
  return status !== "cancelled" && status !== "completed";
}
