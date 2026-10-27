"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { allDaysWarning, normalizeDays } from "@/lib/requests/schedule";
import { CopyIcon, EyeIcon, EyeOffIcon } from "@/components/requests/ToolIcons";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/common/Toast";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { useRoleTheme } from "@/hooks/useRoleTheme";
import { fetchMineDisplay } from "@/lib/mine/display";
import { initialsFromName } from "@/lib/mine/public-profile";
import { getInstructorProfileSummary, getInstructorContacts, getInstructorNames } from "@/lib/instructor/profile";
import { getRequesterProfile, getRequesterContacts } from "@/lib/requester/profile";
import {
  getRequestsForInstructor,
  getRequestsForRequester,
  cancelRequest,
  completeRequest,
} from "@/lib/requests/training-requests";
import {
  declineInterview,
  markResultsSeenByInstructor,
  markResponsesSeenByRequester,
  releaseInstructorName,
  submitInstructorResponse,
  setResponseStage,
  requestInterview,
} from "@/lib/requests/instructor-responses";
import { ApplyFields, EMPTY_APPLY, applyPayload, type ApplyValue } from "@/components/requests/ApplyFields";
import { DetailsView } from "@/components/requests/DetailsView";
import { DecidedTabs } from "@/components/requests/DecidedTabs";
import { ProgressStrip } from "@/components/requests/ProgressStrip";
import { docWaits, hasUnseenWait, isWaitSeen, markWaitsSeen, type DocState, type Wait } from "@/lib/requests/docs-wait";
import { getDocStates } from "@/lib/requests/docs-status";
import { EmptyNote } from "@/components/ui/EmptyNote";
import { FlowPanel } from "@/components/requests/FlowPanel";
import { InternalNote } from "@/components/requests/InternalNote";
import { ResponseManage } from "@/components/requests/ResponseManage";
import { deadlineShort, deadlinePassed } from "@/lib/requests/deadline";
import { finalizeResponse, closeRecruiting } from "@/lib/requests/actions";
import { stageOf, STAGE_LABEL } from "@/lib/requests/stage";
import { normalizeSlots, openSlots, progressSummary, slotCounts, slotsSummary, totalNeeded, totalRemaining } from "@/lib/requests/roles";
import { setPublishState, closeApplications } from "@/lib/requests/training-requests";
import { nextAction } from "@/lib/requests/next-action";
import { matchesSearch } from "@/lib/requests/search";
import { recruitState, RECRUIT_STATE_LABEL, monthsOfDays, monthLabel, type RecruitState } from "@/lib/requests/list-filters";
import { BudgetHint } from "@/components/requests/BudgetHint";
import { amountError, MAX_AMOUNT, budgetText, costLines, normalUnit, quoteText, UNIT_OPTIONS } from "@/lib/requests/money";
import type { InstructorResponseRow, TrainingRequestRow } from "@/types/database";
import type { CurrentUser } from "@/lib/auth/auth";
import { ApplicantRow, applicantPriority } from "@/components/mine/ApplicantRow";
import { CompanySurveyPanel } from "@/components/survey/CompanySurveyPanel";
import { InstructorSurveyPanel } from "@/components/survey/InstructorSurveyPanel";
import { InstructorSurveyResults } from "@/components/survey/InstructorSurveyResults";
import { BookMineMeetingButton, MineMeetingLine, useMineLinkedInstructors, useMineMeetings } from "@/components/mine/MineMeeting";
import type { KenshuMineMeetingRow } from "@/types/database";
import { flushMineNotices } from "@/lib/mine/flush-client";
import { MineProfileBlocks } from "@/components/mine/MineProfileBlocks";
import { DetailTabs } from "@/components/common/DetailTabs";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { MinePublicProfile } from "@/lib/mine/public-profile";
import { VISIBILITY_TEXT } from "@/lib/requests/visibility";
import { PartnerRequests } from "@/components/requests/PartnerRequests";
import { TeachingRecord } from "@/components/instructors/TeachingRecord";
import { getNewProposalCounts } from "@/lib/requester/partners";
import "./mypage.css";
import { Select } from "@/components/ui/Select";

const FORMAT_LABEL: Record<string, string> = { online: "オンライン", offline: "対面", both: "オンライン・対面" };

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

type ReqWithJoins = TrainingRequestRow & { instructor_responses: InstructorResponseRow[] };

/* ===================================================================
   講師側マイページ
   =================================================================== */

type MineCard = { linked: boolean; public?: boolean; profile?: MinePublicProfile | null; initials?: string | null; prefectures?: string[]; hourly_rate?: number | null; work_style?: string | null; mine_url?: string };
const WORK_STYLE_LABEL: Record<string, string> = { ONLINE: "オンライン", ONSITE: "対面", HYBRID: "オンライン・対面どちらも可" };

function hasMineBlocks(m: MinePublicProfile, group: "profile" | "career") {
  if (group === "career") return !!(m.skills?.length || m.qualifications?.length || m.work_history?.length || m.education?.length);
  return !!(m.occupations?.length || m.self_introduction || m.professional_summary || m.languages || m.area);
}

function ProfileStatusCard({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<{ id: string; is_public: boolean; prefectures: string[] | null; self_pr: string | null; contact_email: string | null; contact_phone: string | null } | null | undefined>(undefined);
  // Mine users: the profile lives in Mine, this card only shows it. undefined = still loading.
  const [mine, setMine] = useState<MineCard | undefined>(undefined);
  const [openTab, setOpenTab] = useState(""); // every tab starts closed
  const [surveyScore, setSurveyScore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createBrowserClient() as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { overall_avg: number | null; answer_count: number } | null }> } } } };
      const { data } = await supabase.from("instructor_survey_summary").select("overall_avg, answer_count").eq("instructor_id", userId).maybeSingle();
      setSurveyScore(data && data.overall_avg !== null ? `${Number(data.overall_avg).toFixed(1)} / 4（${data.answer_count}件）` : null);
    })();
  }, [userId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/instructors/me", { cache: "no-store" });
        setMine(res.ok ? ((await res.json()) as MineCard) : { linked: false });
      } catch {
        setMine({ linked: false });
      }
    })();
  }, [userId]);

  useEffect(() => {
    (async () => {
      const { data } = await getInstructorProfileSummary(userId);
      setProfile(data ?? null);
    })();
  }, [userId]);

  if (mine === undefined) return <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>プロフィール状況を読み込み中…</p>;

  if (mine.linked) {
    const unset = <span style={{ color: "var(--color-ink-soft)" }}>未設定</span>;
    return (
      <div className="request-card">
        <div className="request-card__top">
          <div>
            <div className="request-card__title">講師プロフィール</div>
            <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 18px", marginTop: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: "var(--color-ink)" }}>{mine.initials ? `${mine.initials} 先生` : ""}</span>
              {surveyScore ? (
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-ink-soft)" }}>
                  <span style={{ color: "#f2b84b" }}>★</span> {surveyScore}
                </span>
              ) : null}
            </div>
          </div>
          <span className={`status-badge ${mine.public ? "status-badge--accepted" : "status-badge--pending"}`}>{mine.public ? "公開中" : "非公開"}</span>
        </div>
        {mine.public ? (
          <div className="request-card__desc" style={{ margin: "6px 0 12px" }}>
            <div>エリア：{mine.prefectures?.length ? mine.prefectures.join("、") : unset}</div>
            <div>
              単価：{typeof mine.hourly_rate === "number" ? `¥${mine.hourly_rate.toLocaleString()}／時間` : unset}　　働き方：
              {mine.work_style ? WORK_STYLE_LABEL[mine.work_style] ?? mine.work_style : unset}
            </div>
          </div>
        ) : (
          <p className="request-card__desc">Mineで公開設定をオンにすると、「講師を探す」に表示され、依頼を受けられるようになります。</p>
        )}
        <div style={{ marginBottom: 16 }}>
          <DetailTabs
            variant="underline"
            active={openTab}
            onChange={(k) => setOpenTab((cur) => (cur === k ? "" : k))}
            tabs={[
              {
                key: "profile",
                label: <>プロフィール</>,
                content:
                  mine.public && mine.profile && hasMineBlocks(mine.profile, "profile") ? (
                    <MineProfileBlocks mine={mine.profile} group="profile" />
                  ) : (
                    <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: "0 0 16px" }}>{mine.public ? "公開している内容はまだありません。" : "公開設定をオンにすると、ここに表示されます。"}</p>
                  ),
              },
              {
                key: "career",
                label: <>経歴・スキル</>,
                content:
                  mine.public && mine.profile && hasMineBlocks(mine.profile, "career") ? (
                    <MineProfileBlocks mine={mine.profile} group="career" />
                  ) : (
                    <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: "0 0 16px" }}>{mine.public ? "公開している内容はまだありません。" : "公開設定をオンにすると、ここに表示されます。"}</p>
                  ),
              },
              {
                key: "survey",
                label: <>研修アンケート</>,
                content: <InstructorSurveyResults instructorId={userId} bare replyName={mine.initials} />,
              },
            ]}
          />
        </div>
        <div className="request-card__actions">
          <a href={mine.mine_url || "https://mine-omega-one.vercel.app/apps"} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm">
            Mineで編集する
          </a>
        </div>
      </div>
    );
  }

  if (profile === undefined) return <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>プロフィール状況を読み込み中…</p>;

  if (!profile) {
    return (
      <>
      <div className="request-card">
        <p className="request-card__desc">プロフィールを作成すると「講師を探す」の検索結果に表示され、依頼を受けられるようになります。</p>
        <Link href="/instructor-profile-edit" className="btn btn--primary btn--sm">
          プロフィールを作成する
        </Link>
      </div>
      <div style={{ marginTop: 28 }}>
        <InstructorSurveyResults instructorId={userId} />
      </div>
      </>
    );
  }

  const missingContact = !profile.contact_email || !profile.contact_phone;

  return (
    <>
    <div className="request-card">
      <div className="request-card__top">
        <div>
          <div className="request-card__title">プロフィール登録済み</div>
          <p className="request-card__meta">{(profile.prefectures || []).length ? profile.prefectures!.join("、") : "エリア未設定"}</p>
        </div>
        <span className={`status-badge ${profile.is_public ? "status-badge--accepted" : "status-badge--pending"}`}>
          {profile.is_public ? "公開中" : "非公開"}
        </span>
      </div>
      <p className="request-card__desc">{profile.self_pr || "自己紹介が未入力です。"}</p>
      {missingContact && (
        <div className="request-card__response">
          <strong>連絡先情報が未入力です</strong>
          {!profile.contact_email ? "メール　" : ""}
          {!profile.contact_phone ? "電話番号" : ""}
          が未登録のため、依頼が承諾された後も相手にお知らせできません。プロフィール編集から登録してください。
        </div>
      )}
      <div className="request-card__actions">
        <Link href="/instructor-profile-edit" className="btn btn--ghost btn--sm">
          プロフィールを編集する
        </Link>
        <Link href={`/instructor-detail?id=${profile.id}`} className="btn btn--ghost btn--sm">
          公開ページを見る
        </Link>
      </div>
    </div>
    <div style={{ marginTop: 28 }}>
      <InstructorSurveyResults instructorId={userId} />
    </div>
    </>
  );
}

function instructorDisplayStatus(r: ReqWithJoins, myResponse: InstructorResponseRow | null) {
  if (r.status === "cancelled") return { key: "cancelled", label: "依頼者によりキャンセル" };
  const lostToOther =
    (r.status === "accepted" || r.status === "completed") &&
    !r.target_instructor_id &&
    !!myResponse &&
    (myResponse.action === "accept" || myResponse.action === "quote") &&
    !myResponse.is_selected;
  if (lostToOther) return { key: "notselected", label: "今回は決定されませんでした" };
  if (r.status === "completed") return { key: "completed", label: "完了" };
  if (r.status === "accepted") return { key: "accepted", label: "承諾済み" };
  // Role slots: this instructor is decided while the company still recruits for other slots.
  if (myResponse?.is_selected) return { key: "accepted", label: "決定済み" };
  if (myResponse) {
    if (myResponse.action === "reject" || myResponse.action === "withdrawn") return { key: "rejected", label: myResponse.action === "withdrawn" ? "取り下げ済み" : "却下済み" };
    return { key: "quoted", label: "返信済み（依頼者の確定待ち）" };
  }
  return { key: "pending", label: "対応待ち" };
}

function InstructorRequestCard({
  r,
  userId,
  requester,
  meetings,
  onChanged,
  embedded = false,
}: {
  r: ReqWithJoins;
  userId: string;
  requester: { name?: string; email?: string; phone?: string | null } | undefined;
  meetings: Record<string, KenshuMineMeetingRow>;
  onChanged: () => void;
  embedded?: boolean;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const myResponse = (r.instructor_responses || []).find((x) => x.instructor_id === userId) || null;
  const st = instructorDisplayStatus(r, myResponse);
  const meeting = myResponse ? meetings[myResponse.response_id] : undefined;
  // 注文書・請求書 and 連絡先 sit together in tabs (same as on the company side).
  const docsOnMine = r.status === "accepted" || r.status === "completed" || (r.status === "pending" && normalizeSlots(r.role_slots).length > 0);
  const contactOnMine = st.key === "accepted" || st.key === "completed";
  const requesterCompany = (requester as { company_name?: string | null } | undefined)?.company_name || null;
  const requesterContactName = requesterCompany || requester?.name || "依頼者";
  const requesterContactRole = requesterCompany ? (requester?.name && requester.name !== requesterCompany ? `担当者：${requester.name}` : null) : r.requester_type === "individual" ? "ご依頼者" : null;
  const isDirectRequest = !!r.target_instructor_id;
  const progressHint = isDirectRequest
    ? r.status === "completed"
      ? "研修は完了しました。"
      : r.status === "accepted"
      ? "承諾しました。注文書の確認と、研修の準備を進めてください。"
      : !myResponse
      ? "承諾するか、見積りを送って返答しましょう。"
      : "見積りを送りました。企業の確定をお待ちください。"
    : !myResponse
    ? "承諾するか、見積りを送って応募しましょう。"
    : myResponse.interview_status === "requested"
    ? "企業から面談の依頼が届いています。同意すると氏名が企業に公開されます。"
    : myResponse.is_selected
    ? r.status === "completed"
      ? "研修は完了しました。"
      : "決定しました。注文書の確認と、研修の準備を進めてください。"
    : myResponse.interview_status === "released"
    ? "氏名を公開しました。企業の決定をお待ちください。"
    : "企業からの連絡をお待ちください。";

  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quotePrice, setQuotePrice] = useState("");
  const [apply, setApply] = useState<ApplyValue>(EMPTY_APPLY);
  const [quoteTax, setQuoteTax] = useState<"" | "included" | "excluded">("");
  const [quoteMessage, setQuoteMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function respond(action: "accept" | "reject") {
    setBusy(true);
    const { error } = await submitInstructorResponse(r.request_id, userId, action);
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast(action === "accept" ? "依頼を承諾しました。依頼者の確定操作をお待ちください。" : "依頼を却下しました。");
    onChanged();
  }

  async function handleRelease() {
    const { ok } = await confirm({
      title: "氏名を公開しますか？",
      message: "面談に同意し、氏名（フルネーム）を企業に公開します。",
      confirmLabel: "情報を公開する",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await releaseInstructorName(myResponse!.response_id);
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("氏名を公開しました。企業の決定をお待ちください。");
    onChanged();
  }

  async function handleDecline() {
    const { ok } = await confirm({
      title: "面談を辞退しますか？",
      message: "この面談依頼を辞退します。",
      confirmLabel: "辞退する",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await declineInterview(myResponse!.response_id);
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("面談を辞退しました。");
    onChanged();
  }

  async function submitQuote() {
    const price = Number(quotePrice) || null;
    if (!price) return showToast("見積り金額を入力してください");
    const priceErr = amountError(price, "見積り金額");
    if (priceErr) return showToast(priceErr);
    if (normalizeSlots(r.role_slots).length > 0 && !apply.role.trim()) return showToast("希望する役割・職種を選んでください");
    setBusy(true);
    const { error } = await submitInstructorResponse(r.request_id, userId, "quote", { quote_price: price, quote_tax_mode: quoteTax || null, message: quoteMessage.trim() || null, ...applyPayload(apply) });
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("見積りを送信しました。");
    onChanged();
  }

  return (
    <div className={embedded ? "request-card request-card--embedded" : "request-card"}>
      {embedded ? (
        <div className="request-card__meta" style={{ marginBottom: 8 }}>
          <Link href={`/request-detail?id=${r.request_id}`} style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>依頼の詳細ページを開く</Link>
        </div>
      ) : (
      <div className="request-card__top">
        <div>
          <div className="request-card__title">
            <Link href={`/request-detail?id=${r.request_id}`} style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>{r.title}</Link>
          </div>
          <div className="request-card__meta">
            <span>{r.requester_type === "company" ? "企業" : "生徒"}からの依頼</span>
            <span>{fmtDate(r.created_at)}</span>
          </div>
        </div>
        <span className={`status-badge status-badge--${st.key === "quoted" ? "quoted" : st.key === "rejected" || st.key === "notselected" ? "rejected" : st.key}`}>{st.label}</span>
      </div>
      )}

      {isDirectRequest && myResponse?.action !== "reject" && myResponse?.action !== "withdrawn" && (
        <ProgressStrip direct={{ status: r.status, replied: !!myResponse && myResponse.action === "quote" }} hint={progressHint} />
      )}
      {!r.target_instructor_id && myResponse?.action !== "reject" && myResponse?.action !== "withdrawn" && !((r.status === "accepted" || r.status === "completed") && !myResponse?.is_selected) && (
        <ProgressStrip
          input={{
            status: r.status,
            applied: !!myResponse && (myResponse.action === "accept" || myResponse.action === "quote"),
            interviewReleased: myResponse?.interview_status === "released" || !!myResponse?.is_selected,
            decided: !!myResponse?.is_selected,
          }}
          hint={progressHint}
        />
      )}
      <p className="request-card__desc">{r.description}</p>
      <div className="request-card__tags">
        <span className="instructor-card__tag">{FORMAT_LABEL[r.preferred_format] || r.preferred_format}</span>
        {budgetText(r) ? <span className="instructor-card__tag">{budgetText(r)}</span> : null}
        {r.participant_count ? <span className="instructor-card__tag">対象{r.participant_count}名</span> : null}
        {r.location ? <span className="instructor-card__tag">{r.location}</span> : null}
        {r.preferred_schedule ? <span className="instructor-card__tag">{r.preferred_schedule}</span> : null}
      </div>
      {costLines(r).length > 0 && (
        <div className="request-card__response" style={{ margin: "0 0 14px", fontSize: 13 }}>
          <strong>費用・支払い</strong>
          {costLines(r).join("　／　")}
        </div>
      )}

      {myResponse && (
        <div className="request-card__response">
          <strong>
            あなたの対応：
            {myResponse.action === "accept" ? "承諾" : myResponse.action === "quote" ? quoteText(myResponse) : myResponse.action === "withdrawn" ? "取り下げ" : "却下"}
          </strong>
          {myResponse.message || "（メッセージなし）"}
          <ResponseManage response={myResponse} request={r} onChanged={onChanged} />
          {(myResponse.action === "accept" || myResponse.action === "quote") && (
            <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--color-ink-soft)" }}>
              <span>選考状況：{STAGE_LABEL[stageOf(myResponse, r.status === "accepted" || r.status === "completed")]}</span>
            </div>
          )}
        </div>
      )}
      {myResponse?.is_selected && (docsOnMine || contactOnMine) && (
        <DecidedTabs
          responseId={myResponse.response_id}
          role="instructor"
          showDocs={docsOnMine}
          showContact={contactOnMine}
          showInvoice={r.status === "accepted" || r.status === "completed"}
          contact={{
            name: requesterContactName,
            roleLabel: requesterContactRole,
            email: requester ? requester.email || "未登録" : "読み込み中…",
            phone: requester ? requester.phone || "未登録" : "読み込み中…",
            hint: "依頼者への連絡先です。",
          }}
        />
      )}

      {myResponse?.interview_status === "requested" && r.status === "pending" && (
        <div className="contact-box">
          <strong>企業から面談の依頼が届いています。</strong>
          <div>同意すると、あなたの氏名（フルネーム）が企業に公開されます。</div>
          <div className="request-card__actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleRelease}>
              情報を公開する
            </button>
            <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={handleDecline}>
              辞退する
            </button>
          </div>
        </div>
      )}
      {myResponse?.interview_status === "released" && r.status === "pending" && (
        <p className="request-card__desc" style={{ color: "var(--color-ink-soft)" }}>
          氏名を公開しました。企業の決定をお待ちください。
        </p>
      )}
      {myResponse?.interview_status === "declined" && (
        <p className="request-card__desc" style={{ color: "var(--color-ink-soft)" }}>
          面談を辞退しました。
        </p>
      )}

      {(r.status === "accepted" || r.status === "completed") && <InstructorSurveyPanel requestId={r.request_id} />}

      {meeting && <MineMeetingLine meeting={meeting} viewer="instructor" finished={r.status === "completed"} />}

      {!myResponse && r.status === "pending" && (
        <>
          <div className="request-card__actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => respond("accept")}>
              承諾する
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setQuoteOpen((v) => !v)}>
              見積りを送る
            </button>
            <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => respond("reject")}>
              却下する
            </button>
          </div>
          <div className={`inline-quote-form${quoteOpen ? " is-open" : ""}`}>
            <div className="form-field">
              <label>見積り金額（{UNIT_OPTIONS.find((o) => o.value === normalUnit(r.budget_unit))?.label}・円）</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" min={0} max={MAX_AMOUNT} step={1000} placeholder="例：14000" value={quotePrice} onChange={(e) => setQuotePrice(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                <Select aria-label="税" value={quoteTax} onChange={(e) => setQuoteTax(e.target.value as "" | "included" | "excluded")} style={{ flex: "0 0 120px" }}>
                  <option value="">税の指定なし</option>
                  <option value="included">税込</option>
                  <option value="excluded">税別</option>
                </Select>
              </div>
              <BudgetHint request={r} price={quotePrice} quoteTax={quoteTax} />
            </div>
            <ApplyFields value={apply} onChange={setApply} roleOptions={normalizeSlots(r.role_slots).map((x) => x.name)} />
            <div className="form-field">
              <label>メッセージ</label>
              <textarea rows={2} placeholder="見積りの補足があればご記入ください" value={quoteMessage} onChange={(e) => setQuoteMessage(e.target.value)} />
            </div>
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={submitQuote}>
              この内容で見積りを送る
            </button>
          </div>
        </>
      )}

    </div>
  );
}

/** What needs the instructor's action right now (shown as a red dot). */
function instructorAttention(r: ReqWithJoins, myResponse: InstructorResponseRow | null, doc?: DocState | null): { label: string; key: string } | null {
  // A decided lecturer: an order to confirm, or an invoice sent back (these can happen when the request is already accepted).
  if (myResponse?.is_selected) {
    const w = docWaits("instructor", doc)[0];
    if (w) return w;
  }
  if (r.status !== "pending") return null;
  if (!myResponse) return { label: "要対応", key: "要対応" };
  if (myResponse.interview_status === "requested") return { label: "面談の依頼", key: "面談の依頼" };
  return null;
}

function InstructorRequestRow({
  r,
  userId,
  requester,
  meetings,
  doc,
  onChanged,
}: {
  r: ReqWithJoins;
  userId: string;
  requester: { name?: string; email?: string; phone?: string | null; company_name?: string | null } | undefined;
  meetings: Record<string, KenshuMineMeetingRow>;
  doc?: DocState | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const myResponse = (r.instructor_responses || []).find((x) => x.instructor_id === userId) || null;
  const st = instructorDisplayStatus(r, myResponse);
  const attn = instructorAttention(r, myResponse, doc);
  const meeting = myResponse ? meetings[myResponse.response_id] : undefined;
  const who = requester?.company_name || (r.requester_type === "company" ? "企業" : "生徒");
  const meetingText =
    meeting && meeting.status !== "cancelled"
      ? `面談 ${new Date(meeting.starts_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })}`
      : null;
  const parts = [
    who,
    budgetText(r),
    meetingText,
    fmtDate(r.created_at),
  ].filter(Boolean);
  // Only a small red dot marks "needs you"; it goes away once the lecturer opens the row (remembered in this browser).
  const [seenTick, setSeenTick] = useState(0);
  const seen = seenTick >= 0 && !!attn && isWaitSeen(r.request_id, attn.key);
  function toggleOpen() {
    if (!open && attn && !seen) {
      markWaitsSeen(r.request_id, [attn.key]);
      setSeenTick((n) => n + 1);
    }
    setOpen((v) => !v);
  }
  const badgeKey = st.key;
  const badgeLabel = st.key === "quoted" ? "返信済み" : st.label;
  return (
    <div className={`req-row${open ? " is-open" : ""}`}>
      <button type="button" className="req-row__head" aria-expanded={open} onClick={toggleOpen}>
        <span className="req-row__main">
          <span className="req-row__line1">
            {attn && !seen && <span className="req-row__dot" role="img" aria-label={attn.label} />}
            <span className="req-row__title">{r.title}</span>
          </span>
          <span className="req-row__line2">{parts.join("　・　")}</span>
        </span>
        <span className={`req-badge req-badge--${badgeKey}`}>{badgeLabel}</span>
        <svg className="req-row__chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="req-row__body">
          <InstructorRequestCard r={r} userId={userId} requester={requester} meetings={meetings} onChanged={onChanged} embedded />
        </div>
      )}
    </div>
  );
}

function InstructorMypage({ user }: { user: CurrentUser }) {
  const { byResponse: meetings } = useMineMeetings(user.id);
  const [all, setAll] = useState<ReqWithJoins[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requesterMap, setRequesterMap] = useState<Record<string, { name?: string; email?: string; phone?: string | null; company_name?: string | null }>>({});
  const [currentTab, setCurrentTab] = useState("all");
  const [shownCount, setShownCount] = useState(10);
  const [docStates, setDocStates] = useState<Record<string, DocState>>({});

  const load = useCallback(async () => {
    flushMineNotices();
    const { data, error } = await getRequestsForInstructor(user.id);
    if (error) {
      setLoadError(error.message);
      return;
    }
    const rows = (data || []) as unknown as ReqWithJoins[];
    setAll(rows);
    const myDecidedIds = rows.flatMap((r) => (r.instructor_responses || []).filter((x) => x.instructor_id === user.id && x.is_selected).map((x) => x.response_id));
    try {
      setDocStates(await getDocStates(myDecidedIds));
    } catch {
      setDocStates({});
    }

    const acceptedRequesterIds = rows.filter((r) => r.status === "accepted" || r.status === "completed").map((r) => r.requester_id);
    if (acceptedRequesterIds.length) {
      setRequesterMap(await getRequesterContacts(acceptedRequesterIds));
    }
  }, [user.id]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load, user.id]);

  // An order / invoice changed inside a card: refresh the red dots and the 要対応 list right away.
  useEffect(() => {
    if (!all) return;
    const ids = all.flatMap((r) => (r.instructor_responses || []).filter((x) => x.instructor_id === user.id && x.is_selected).map((x) => x.response_id));
    if (ids.length === 0) return;
    const refresh = () => {
      getDocStates(ids)
        .then(setDocStates)
        .catch(() => undefined);
    };
    window.addEventListener("kl-doc-changed", refresh);
    window.addEventListener("kl-order-changed", refresh);
    return () => {
      window.removeEventListener("kl-doc-changed", refresh);
      window.removeEventListener("kl-order-changed", refresh);
    };
  }, [all, user.id]);

  const filtered = useMemo(() => {
    if (!all) return [];
    if (currentTab === "all") return all;
    return all.filter((r) => {
      const myResponse = (r.instructor_responses || []).find((x) => x.instructor_id === user.id) || null;
      return instructorDisplayStatus(r, myResponse).key === currentTab;
    });
  }, [all, currentTab, user.id]);

  // 「決定なし」 results the instructor has not looked at yet (red dot on that tab).
  const unseenNotSelected = (all || []).filter((r) => {
    const myResponse = (r.instructor_responses || []).find((x) => x.instructor_id === user.id) || null;
    return !!myResponse && !myResponse.result_seen_at && instructorDisplayStatus(r, myResponse).key === "notselected";
  });
  const unseenIds = unseenNotSelected.map((r) => (r.instructor_responses || []).find((x) => x.instructor_id === user.id)!.response_id);

  async function openStatusTab(key: string) {
    setCurrentTab(key);
    setShownCount(10);
    if (key === "notselected" && unseenIds.length) {
      await markResultsSeenByInstructor(unseenIds);
      const now = new Date().toISOString();
      setAll((rows) =>
        rows
          ? rows.map((r) => ({
              ...r,
              instructor_responses: (r.instructor_responses || []).map((x) => (unseenIds.includes(x.response_id) ? { ...x, result_seen_at: now } : x)),
            }))
          : rows,
      );
    }
  }

  const tabs = [
    ["all", "すべて"],
    ["pending", "対応待ち"],
    ["quoted", "返信済み"],
    ["accepted", "承諾済み"],
    ["completed", "完了"],
    ["rejected", "却下"],
    ["notselected", "決定なし"],
    ["cancelled", "キャンセル"],
  ] as const;

  return (
    <>
      <div className="mypage__head">
        <h1 className="mypage__title">マイページ（講師）</h1>
        <p className="mypage__role">{user.name} としてログイン中</p>
      </div>
      <div style={{ marginBottom: 28 }}>
        <ProfileStatusCard userId={user.id} />
      </div>
      <TeachingRecord />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 className="section__title" style={{ fontSize: 18, margin: 0 }}>
          受け取った依頼
        </h2>
      </div>
      <div className="status-tabs">
        {tabs.map(([key, label]) => {
          const count = key === "all" ? (all?.length ?? 0) : (all || []).filter((r) => {
            const myResponse = (r.instructor_responses || []).find((x) => x.instructor_id === user.id) || null;
            return instructorDisplayStatus(r, myResponse).key === key;
          }).length;
          return (
            <button key={key} type="button" className={`status-tab${currentTab === key ? " is-active" : ""}`} onClick={() => void openStatusTab(key)}>
              {label}
              <span className="status-tab__count">({count})</span>
              {key === "notselected" && unseenNotSelected.length > 0 && currentTab !== "notselected" && (
                <span className="req-row__dot" style={{ display: "inline-block", marginLeft: 6, verticalAlign: "middle" }} aria-label="未確認の結果があります" />
              )}
            </button>
          );
        })}
      </div>
      {loadError && <p style={{ color: "var(--color-danger)", fontSize: 13 }}>読み込みエラー：{loadError}</p>}
      {!loadError && all === null && <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>}
      {!loadError && all !== null && filtered.length === 0 && (
        <EmptyNote title="該当する依頼はありません">絞り込みを変えるか、「案件を探す」で新しい依頼を探してみましょう。</EmptyNote>
      )}
      {(() => {
        const myOf = (r: ReqWithJoins) => (r.instructor_responses || []).find((x) => x.instructor_id === user.id) || null;
        const needs = (r: ReqWithJoins) => {
          const mine = myOf(r);
          return !!instructorAttention(r, mine, mine ? docStates[mine.response_id] : null);
        };
        const ordered = [...filtered.filter(needs), ...filtered.filter((r) => !needs(r))];
        const shown = ordered.slice(0, shownCount);
        const attnShown = shown.filter(needs);
        const restShown = shown.filter((r) => !needs(r));
        const row = (r: ReqWithJoins) => (
          <InstructorRequestRow key={r.request_id} r={r} userId={user.id} requester={requesterMap[r.requester_id]} meetings={meetings} doc={myOf(r) ? docStates[myOf(r)!.response_id] : null} onChanged={load} />
        );
        return (
          <>
            {attnShown.length > 0 && (
              <>
                <div className="req-group-title req-group-title--attn">
                  要対応 <span className="req-group-title__count">({filtered.filter(needs).length})</span>
                </div>
                {attnShown.map(row)}
              </>
            )}
            {restShown.length > 0 && (
              <>
                {attnShown.length > 0 && <div className="req-group-title">その他</div>}
                {restShown.map(row)}
              </>
            )}
            {ordered.length > shown.length && (
              <div className="req-more">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShownCount((n) => n + 10)}>
                  もっと見る（あと{ordered.length - shown.length}件）
                </button>
              </div>
            )}
          </>
        );
      })()}
    </>
  );
}

/* ===================================================================
   依頼者側（企業／個人）マイページ
   =================================================================== */

function RequesterProfileCard({ userId, fallbackName }: { userId: string; fallbackName: string }) {
  const [profile, setProfile] = useState<{ company_name: string | null; website: string | null; phone: string | null; address: string | null } | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const { data } = await getRequesterProfile(userId);
      setProfile(data ?? null);
    })();
  }, [userId]);

  if (profile === undefined) return <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>プロフィール状況を読み込み中…</p>;

  if (!profile) {
    return (
      <div className="request-card">
        <p className="request-card__desc">電話番号・会社情報を登録しておくと、依頼が承諾された際に講師へスムーズに共有されます。</p>
        <Link href="/requester-profile-edit" className="btn btn--primary btn--sm">
          プロフィールを作成する
        </Link>
      </div>
    );
  }

  return (
    <div className="request-card">
      <div className="request-card__top">
        <div>
          <div className="request-card__title">{profile.company_name || fallbackName}</div>
          {profile.website && (
            <p className="request-card__meta">
              <a href={profile.website} target="_blank" rel="noopener noreferrer">
                {profile.website}
              </a>
            </p>
          )}
        </div>
      </div>
      <p className="request-card__desc">
        電話番号：{profile.phone || "未登録"}
        <br />
        住所：{profile.address || "未登録"}
      </p>
      <div className="request-card__actions">
        <Link href="/requester-profile-edit" className="btn btn--ghost btn--sm">
          プロフィールを編集する
        </Link>
      </div>
    </div>
  );
}

function resolveInstructorId(r: ReqWithJoins) {
  if (r.target_instructor_id) return r.target_instructor_id;
  const responses = r.instructor_responses || [];
  const selected = responses.find((x) => x.is_selected);
  if (selected) return selected.instructor_id;
  return responses[0]?.instructor_id || null;
}
function requesterDisplayStatus(r: ReqWithJoins) {
  if (r.status === "cancelled") return { key: "cancelled", label: "キャンセル済み" };
  if (r.status === "completed") return { key: "completed", label: "完了" };
  if (r.status === "accepted") return { key: "accepted", label: "承諾済み" };
  // A draft is only saved, not shown to instructors yet.
  if (r.publish_state === "draft") return { key: "draft", label: "下書き" };

  const isBroadcast = !r.target_instructor_id;
  if (!isBroadcast) {
    const resp = (r.instructor_responses || [])[0] || null;
    if (resp) {
      if (resp.action === "reject" || resp.action === "withdrawn") return { key: "rejected", label: "却下" };
      return { key: "quoted", label: "見積り提示中" };
    }
    return { key: "pending", label: "対応待ち" };
  }
  const anyActionable = (r.instructor_responses || []).some((x) => x.action === "accept" || x.action === "quote");
  // Role slots: some are decided, others are still recruiting.
  const slotList = normalizeSlots(r.role_slots);
  const decidedCount = (r.instructor_responses || []).filter((x) => x.is_selected).length;
  if (slotList.length > 0 && decidedCount > 0) return { key: "quoted", label: `募集中（決定${decidedCount}/${totalNeeded(slotList)}名）` };
  if (anyActionable) {
    const anyQuote = (r.instructor_responses || []).some((x) => x.action === "quote");
    return { key: "quoted", label: anyQuote ? "見積り提示中" : "応募あり" };
  }
  return { key: "pending", label: "対応待ち" };
}

/** Shown instead of a lecturer's mail / phone that has not been released to the company yet. */
const NOT_RELEASED = "未公開（講師が公開すると表示されます）";

/** 募集状況 of one request (for the list filter). */
function recruitStateOf(r: ReqWithJoins): RecruitState | null {
  return recruitState({ status: r.status, publishState: r.publish_state, isBroadcast: !r.target_instructor_id, deadlinePassed: deadlinePassed(r.apply_deadline) });
}

/** 次の対応 of one request (shown in its row, and searchable). */
function nextActionOf(r: ReqWithJoins): string | null {
  const st = requesterDisplayStatus(r);
  const isBroadcast = !r.target_instructor_id;
  const applicants = isBroadcast ? (r.instructor_responses || []).filter((x) => x.action === "accept" || x.action === "quote") : [];
  return nextAction({
    statusKey: st.key,
    isDraft: r.publish_state === "draft",
    isBroadcast,
    deadlinePassed: deadlinePassed(r.apply_deadline),
    isPaused: r.publish_state === "paused",
    applicants: applicants.map((x) => ({ isNew: x.requester_seen_at === null, interview: x.interview_status ?? null, passed: x.stage === "passed", decided: !!x.is_selected })),
  });
}

function RequesterRequestCard({
  r,
  userId,
  instructorMap,
  meetings,
  mineLinked,
  owner,
  proposals = 0,
  onSeen,
  docs,
  onChanged,
}: {
  r: ReqWithJoins;
  userId: string;
  instructorMap: Record<string, { name?: string | null; contact_email?: string | null; contact_phone?: string | null }>;
  meetings: Record<string, KenshuMineMeetingRow>;
  mineLinked: Set<string>;
  /** 担当者 saved in 社内メモ (company only), shown in the row. */
  owner?: string;
  /** Lecturer proposals from partner companies that wait for an answer (#53). */
  proposals?: number;
  /** Called with the number of NEW applicants that were just seen (opens the row). */
  onSeen?: (count: number) => void;
  /** Order / invoice status of the decided replies (for the red dot). */
  docs?: Record<string, DocState>;
  onChanged: () => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { user: authUser } = useAuth();
  const st = requesterDisplayStatus(r);
  const requestOpen = r.status !== "cancelled" && r.status !== "completed";
  // "Now" for the meeting buttons, read once (keeps the render pure).
  const [nowMs] = useState(() => Date.now());
  /** Meeting line + 「面談を予約」 for one instructor reply (Mine booking, Phase 3c). */
  const meetingParts = (response: InstructorResponseRow) => {
    const meeting = meetings[response.response_id];
    const canBook =
      requestOpen &&
      response.stage !== "passed" &&
      (response.action === "accept" || response.action === "quote") &&
      mineLinked.has(response.instructor_id) &&
      (!meeting || meeting.status === "cancelled" || Date.parse(meeting.ends_at) <= nowMs);
    // Mine Phase 3d: change the time or cancel an upcoming meeting.
    const canChange = requestOpen && !!meeting && meeting.status !== "cancelled" && Date.parse(meeting.ends_at) > nowMs;
    // Changing an upcoming meeting sits next to its Meet button; booking a first one stands alone.
    const button =
      canChange && meeting ? (
        <BookMineMeetingButton responseId={response.response_id} bookingId={meeting.booking_id} disabled={busy} />
      ) : canBook ? (
        <BookMineMeetingButton responseId={response.response_id} disabled={busy} />
      ) : null;
    return { meeting, button, canChange };
  };
  const meetingBlock = (response: InstructorResponseRow) => {
    const { meeting, button, canChange } = meetingParts(response);
    return (
      <>
        {meeting && <MineMeetingLine meeting={meeting} viewer="requester" actions={canChange ? button : undefined} finished={r.status === "completed"} />}
        {!canChange && button && <div style={{ marginTop: 8, marginBottom: 12 }}>{button}</div>}
      </>
    );
  };
  const isBroadcast = !r.target_instructor_id;
  const resp = (r.instructor_responses || [])[0] || null;
  const selectedResp = (r.instructor_responses || []).find((x) => x.is_selected);
  // Role slots (#42): 必要・決定・残 per role; several instructors can be decided.
  const roleSlots = normalizeSlots(r.role_slots);
  const hasRoles = roleSlots.length > 0;
  const slotStats = slotCounts(roleSlots, r.instructor_responses || []);
  const slotsOpen = openSlots(slotStats);
  const selectedResps = (r.instructor_responses || []).filter((x) => x.is_selected);
  const [slotPick, setSlotPick] = useState<Record<string, string>>({});
  const instrBase = instructorMap[r.target_instructor_id || (selectedResp || resp)?.instructor_id || ""] || {};
  // Full name only when the instructor released it for THIS request (direct accept, or 情報を公開する).
  const releasedForThis = (r.target_instructor_id ? resp : selectedResp)?.released_name?.trim() || null;
  const instr = releasedForThis ? { ...instrBase, name: releasedForThis } : instrBase;
  // Until the lecturers' details have loaded the map is empty: do not say 未公開 yet.
  const contactOr = (v?: string | null) => v || (Object.keys(instructorMap).length > 0 ? NOT_RELEASED : "読み込み中…");
  const applicants = isBroadcast ? (r.instructor_responses || []).filter((x) => x.action === "accept" || x.action === "quote") : [];
  // Applicants as closed rows: the ones that need an answer first, then NEW, then the rest.
  const sortedApplicants = [...applicants].sort(
    (x, y) => applicantPriority(x, meetings[x.response_id]) - applicantPriority(y, meetings[y.response_id]),
  );
  const newApplicants = applicants.filter((x) => x.requester_seen_at === null).length;
  const answerNeeded = applicants.filter((x) => applicantPriority(x, meetings[x.response_id]) === 0).length;

  const [busy, setBusy] = useState(false);
  // The applicants of a 公募依頼 stay closed until the company opens them (there can be many).
  const [listOpen, setListOpen] = useState(false);
  // The whole request is one slim row; its details open on a click (same as the instructor side).
  const [cardOpen, setCardOpen] = useState(false);
  // A red dot until the company opens the row for the first time.
  const [dotCleared, setDotCleared] = useState(false);
  // Things that wait inside the card: a lecturer who released the name (decide!), a declined order, a submitted invoice.
  // Each has its own key, so a new event shows the dot again after the row was opened before.
  const [waitTick, setWaitTick] = useState(0);
  const openRequest = st.key === "pending" || st.key === "quoted";
  const waits: Wait[] = [
    ...(r.instructor_responses || []).filter((x) => x.is_selected).flatMap((x) => docWaits("requester", docs?.[x.response_id])),
    ...(openRequest
      ? applicants
          .filter((x) => x.interview_status === "released" && !x.is_selected && x.stage !== "passed")
          .map((x) => ({ key: `released:${x.response_id}`, label: "講師を決定する" }))
      : []),
  ];
  const waitDot = waitTick >= 0 && hasUnseenWait(r.request_id, waits);
  const attention = waitDot || (!dotCleared && openRequest && (newApplicants > 0 || answerNeeded > 0));
  function toggleRow() {
    if (!cardOpen && waitDot) {
      markWaitsSeen(r.request_id, waits.map((w) => w.key));
      setWaitTick((n) => n + 1);
    }
    if (!cardOpen && !dotCleared) {
      setDotCleared(true);
      const ids = applicants.filter((x) => x.requester_seen_at === null).map((x) => x.response_id);
      if (ids.length) {
        void markResponsesSeenByRequester(ids);
        onSeen?.(ids.length);
      }
    }
    setCardOpen((v) => !v);
  }
  const nameOfDecided = (sr: InstructorResponseRow) => sr.released_name?.trim() || instructorMap[sr.instructor_id]?.name || "講師";
  const decidedNames = selectedResps.map(nameOfDecided);
  // Who is decided, and what to show for each (注文書・請求書 / 連絡先).
  const inApplicantRows = isBroadcast && (st.key === "pending" || st.key === "quoted");
  const docsOn = hasRoles ? (st.key === "accepted" || st.key === "completed" || r.status === "pending") && selectedResps.length >= 1 : st.key === "accepted" || st.key === "completed";
  const contactOn = st.key === "accepted" || (hasRoles && r.status === "pending" && selectedResps.length >= 1);
  const decidedSingle = !hasRoles ? selectedResp ?? (resp?.is_selected ? resp : null) : null;
  const decidedPeople: { responseId: string; instructorId: string; name: string; roleLabel: string | null }[] = hasRoles
    ? selectedResps.map((sr) => ({ responseId: sr.response_id, instructorId: sr.instructor_id, name: nameOfDecided(sr), roleLabel: sr.role_slot_id ? roleSlots.find((x) => x.id === sr.role_slot_id)?.name ?? null : null }))
    : decidedSingle
    ? [{ responseId: decidedSingle.response_id, instructorId: decidedSingle.instructor_id, name: instr.name || "講師", roleLabel: null }]
    : [];
  function decidedTabsFor(p: { responseId: string; instructorId: string; name: string; roleLabel: string | null }) {
    const info = hasRoles || !decidedSingle ? instructorMap[p.instructorId] : instr;
    return (
      <DecidedTabs
        responseId={p.responseId}
        showDocs={docsOn}
        showContact={contactOn}
        requestOpen={hasRoles}
        contact={{ name: p.name, roleLabel: p.roleLabel, email: contactOr(info?.contact_email), phone: contactOr(info?.contact_phone) }}
        evaluation={
          r.status === "completed"
            ? { requestId: r.request_id, requesterId: userId, instructorId: p.instructorId, instructorName: p.name, defaultEvaluator: authUser?.name ?? "" }
            : undefined
        }
      />
    );
  }
  const rowWho = isBroadcast
    ? hasRoles && decidedNames.length > 0
      ? `決定：${decidedNames.join("・")} 先生`
      : st.key === "accepted" || st.key === "completed"
      ? `決定：${instr.name || "講師"} 先生`
      : "公募依頼"
    : `依頼先：${instr.name || "講師"} 先生`;
  const next = nextActionOf(r);
  const rowParts = [
    rowWho,
    next ? `次の対応：${next}` : null,
    budgetText(r),
    isBroadcast && r.apply_deadline ? (deadlinePassed(r.apply_deadline) && (st.key === "pending" || st.key === "quoted") ? `受付終了（応募締切 ${deadlineShort(r.apply_deadline)}）` : `応募締切 ${deadlineShort(r.apply_deadline)}`) : null,
    isBroadcast && applicants.length > 0 && (st.key === "pending" || st.key === "quoted") ? `応募 ${applicants.length}名` : null,
    isBroadcast && (st.key === "pending" || st.key === "quoted") ? allDaysWarning(!!r.all_days_required, applicants.map((x) => x.apply_all_days)) : null,
    hasRoles && (st.key === "pending" || st.key === "quoted") && totalRemaining(slotStats) > 0 ? `あと${totalRemaining(slotStats)}名` : null,
    owner ? `担当：${owner}` : null,
    isBroadcast && r.visibility && r.visibility !== "public" ? VISIBILITY_TEXT[r.visibility] : null,
    fmtDate(r.created_at),
    `案件番号 ${r.request_id.slice(0, 8)}`,
  ].filter(Boolean);

  async function finalize(responseId: string, instructorId: string, roleSlotId?: string | null) {
    setBusy(true);
    const { error } = await finalizeResponse({ requestId: r.request_id, responseId, instructorId, roleSlotId });
    if (error) {
      setBusy(false);
      return showToast(`エラー：${error.message}`);
    }
    await onChanged();
    setBusy(false);
    showToast(hasRoles ? "講師を決定しました。連絡先が開示されます。" : "依頼を確定しました。連絡先が開示されます。");
  }

  async function confirmFinalize(responseId: string, instructorId: string) {
    const res = await confirm({ title: "この内容で依頼を確定しますか？", confirmLabel: "確定する", cancelLabel: "戻る" });
    if (res.ok) await finalize(responseId, instructorId);
  }

  async function changeStage(responseId: string, value: "" | "screening" | "negotiation" | "passed") {
    setBusy(true);
    const { error } = await setResponseStage(responseId, value || null);
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    onChanged();
  }

  async function askInterview(responseId: string) {
    setBusy(true);
    const { error } = await requestInterview(responseId);
    setBusy(false);
    if (error) return showToast("面談を依頼できませんでした。もう一度お試しください。");
    showToast("面談を依頼しました。講師が情報を公開すると、決定できます。");
    onChanged();
  }

  async function handleFinalizeApplicant(responseId: string, instructorId: string) {
    let slotId: string | null = null;
    if (hasRoles) {
      const applied = (r.instructor_responses || []).find((x) => x.response_id === responseId)?.apply_role;
      slotId = slotPick[responseId] || slotsOpen.find((x) => x.name === applied)?.id || (slotsOpen.length === 1 ? slotsOpen[0].id : null);
      if (!slotId) return showToast("決定する職種を選んでください。");
      const slotName = roleSlots.find((x) => x.id === slotId)?.name ?? "";
      const lastOne = totalRemaining(slotStats) <= 1;
      const { ok } = await confirm({
        title: `この講師を「${slotName}」に決定しますか？`,
        message: lastOne
          ? "これで募集枠がすべて埋まります。他の応募者には決定されなかった旨が表示されます。"
          : "残りの枠は引き続き募集できます。他の応募者には、募集を終了したときにお知らせします。",
        confirmLabel: "決定する",
      });
      if (!ok) return;
      return finalize(responseId, instructorId, slotId);
    }
    const { ok } = await confirm({
      title: "この講師に決定しますか？",
      message: "他の応募者には決定されなかった旨が表示されます。",
      confirmLabel: "決定する",
    });
    if (!ok) return;
    await finalize(responseId, instructorId);
  }

  async function handleCloseRecruiting() {
    const { ok } = await confirm({
      title: "募集を終了しますか？",
      message: `空いている枠（あと${totalRemaining(slotStats)}名）の募集をやめます。他の応募者には、決定されなかった旨が表示されます。元に戻せません。`,
      confirmLabel: "募集を終了する",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await closeRecruiting(r.request_id);
    if (error) {
      setBusy(false);
      return showToast(`エラー：${error.message}`);
    }
    // Keep the buttons off until the fresh data is on screen, so the card never shows the old state.
    await onChanged();
    setBusy(false);
    showToast("募集を終了しました。");
  }

  async function handleCloseApplications() {
    const { ok } = await confirm({
      title: "応募の受付を終了しますか？",
      confirmLabel: "受付を終了する",
      cancelLabel: "戻る",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await closeApplications(r.request_id);
    if (error) {
      setBusy(false);
      return showToast(`エラー：${error.message}`);
    }
    await onChanged();
    setBusy(false);
    showToast("応募の受付を終了しました。");
  }

  async function handleCancel() {
    // A meeting booked through Mine must be cancelled first (the card hides its buttons once the request is cancelled).
    const hasUpcomingMeeting = (r.instructor_responses || []).some((x) => {
      const m = meetings[x.response_id];
      return !!m && m.status !== "cancelled" && Date.parse(m.ends_at) > Date.now();
    });
    if (hasUpcomingMeeting) {
      showToast("予約済みの面談があります。先に「日程変更・キャンセル」から面談をキャンセルしてください。");
      return;
    }
    const { ok, reason: typedReason } = await confirm({
      title: "この依頼をキャンセルしますか？",
      message: "キャンセルすると元に戻せません。",
      confirmLabel: "依頼をキャンセルする",
      cancelLabel: "戻る",
      tone: "danger",
      reasonLabel: "キャンセル理由（任意）",
      reasonPresets: ["内容を変更して作り直す", "予算・日程が合わなくなった", "別の講師に決めた", "企画自体を中止"],
    });
    if (!ok) return;
    const reason = typedReason || null;
    setBusy(true);
    const { error } = await cancelRequest(r.request_id, reason);
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("依頼をキャンセルしました。");
    onChanged();
  }

  async function changePublish(state: "published" | "paused") {
    if (state === "paused") {
      const { ok } = await confirm({
        title: "公開を一時停止しますか？",
        message: "講師の「案件を探す」に表示されなくなり、新しい応募も受け付けません。すでに応募した講師には引き続き表示されます。いつでも再開できます。",
        confirmLabel: "一時停止する",
      });
      if (!ok) return;
    } else if (r.publish_state === "draft") {
      const { ok } = await confirm({
        title: "この依頼を公開しますか？",
        message:
          r.visibility === "invited"
            ? "公開すると、招待した講師に通知され、その講師の「案件を探す」にだけ表示されます。"
            : r.visibility === "registered"
            ? "公開すると、条件に合う講師に通知され、ログインした講師の「案件を探す」に表示されます。"
            : "公開すると、条件に合う講師に通知され、「案件を探す」に表示されます。",
        confirmLabel: "公開する",
      });
      if (!ok) return;
    }
    setBusy(true);
    const { error } = await setPublishState(r.request_id, state);
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    if (state === "published") flushMineNotices();
    showToast(state === "paused" ? "公開を一時停止しました。" : r.publish_state === "draft" ? "公開しました。" : "公開を再開しました。");
    onChanged();
  }

  async function handleComplete() {
    setBusy(true);
    const { error } = await completeRequest(r.request_id);
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("研修を完了として記録しました。");
    onChanged();
  }

  return (
    <div className={`req-row${cardOpen ? " is-open" : ""}`}>
      <button type="button" className="req-row__head" aria-expanded={cardOpen} onClick={toggleRow}>
        <span className="req-row__main">
          <span className="req-row__line1">
            {attention && <span className="req-row__dot" aria-hidden="true" />}
            <span className="req-row__title">{r.title}</span>
          </span>
          <span className="req-row__line2">{rowParts.join("　・　")}</span>
        </span>
        {proposals > 0 && <span className="req-badge req-badge--attn">講師の提案 {proposals}</span>}
        {r.publish_state === "paused" && <span className="req-badge req-badge--paused">公開停止中</span>}
        <span className={`req-badge req-badge--${st.key}`}>{st.label}</span>
        <svg className="req-row__chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {cardOpen && (
      <div className="req-row__body">
      <div className="request-card request-card--embedded">
      <div className="request-card__meta" style={{ marginBottom: 8 }}>
        <Link href={`/request-detail?id=${r.request_id}`} style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>依頼の詳細ページを開く</Link>
      </div>

      {!isBroadcast && r.publish_state !== "draft" && st.key !== "rejected" && (
        <ProgressStrip direct={{ status: r.status, replied: !!resp && resp.action === "quote" }} hint={next ? `次の対応：${next}` : null} />
      )}
      {isBroadcast && r.publish_state !== "draft" && (
        <ProgressStrip
          input={{
            status: r.status,
            applied: applicants.length > 0,
            interviewReleased: applicants.some((x) => x.interview_status === "released") || selectedResps.length > 0,
            decided: selectedResps.length > 0,
          }}
          hint={
            hasRoles && openRequest && selectedResps.length > 0 && totalRemaining(slotStats) > 0
              ? `決定した${selectedResps.length}名は研修の準備中です。あと${totalRemaining(slotStats)}名を募集しています。`
              : next
              ? `次の対応：${next}`
              : null
          }
        />
      )}
      <p className="request-card__desc">{r.description}</p>
      <div className="request-card__tags">
        <span className="instructor-card__tag">{FORMAT_LABEL[r.preferred_format] || r.preferred_format}</span>
        {budgetText(r) ? <span className="instructor-card__tag">{budgetText(r)}</span> : null}
        {r.participant_count ? <span className="instructor-card__tag">対象{r.participant_count}名</span> : null}
      </div>
      {costLines(r).length > 0 && (
        <div className="request-card__response" style={{ margin: "0 0 14px", fontSize: 13 }}>
          <strong>費用・支払い</strong>
          {costLines(r).join("　／　")}
        </div>
      )}
      <DetailsView r={r} showRoles={false} />
      {hasRoles && (
        <div className="request-card__response" style={{ margin: "0 0 14px", fontSize: 13 }}>
          <strong>募集職種と決定状況（決定／必要）</strong>
          {progressSummary(slotStats)}
          {totalRemaining(slotStats) > 0 ? (r.status === "pending" ? `　（あと${totalRemaining(slotStats)}名）` : `　（募集は終了しました。空き枠 ${totalRemaining(slotStats)}名）`) : "　（募集枠がすべて埋まりました）"}
          {r.status === "pending" && selectedResps.length > 0 && totalRemaining(slotStats) > 0 && (
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={handleCloseRecruiting}>
                {busy ? "処理中…" : "募集を終了する"}
              </button>
            </div>
          )}
        </div>
      )}

      {isBroadcast ? (
        <>
          {applicants.length === 0 ? (
            <>
              <EmptyNote title={r.publish_state === "draft" ? "下書きです" : r.publish_state === "paused" ? "公開を停止中です" : "まだ講師からの応募はありません"}>
                {r.publish_state === "draft" ? "まだ講師には表示されていません。公開すると、応募を受け付けられます。" : r.publish_state === "paused" ? "再開すると講師に表示されます。" : "応募が届くと、ここに表示されます。"}
              </EmptyNote>
              {r.publish_state === "draft" ? (
                <div className="request-card__actions">
                  <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => changePublish("published")}>
                    この内容で公開する
                  </button>
                  <Link href={`/edit-request?id=${r.request_id}`} className="btn btn--ghost btn--sm">
                    内容を編集する
                  </Link>
                  <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={handleCancel}>
                    下書きを取り消す
                  </button>
                </div>
              ) : (
                <div className="request-card__actions">
                  <Link href={`/request-detail?id=${r.request_id}`} className="btn btn--primary btn--sm btn--pulse" style={{ marginBottom: 14 }}>
                    おすすめの講師を見る
                  </Link>
                </div>
              )}
            </>
          ) : st.key === "pending" || st.key === "quoted" ? (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 0, ...(listOpen ? { border: "1.5px solid #5FD0AA", borderRadius: "var(--radius-s)", background: "#fff" } : {}) }}>
              <button
                type="button"
                aria-expanded={listOpen}
                onClick={() => setListOpen((value) => !value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "10px 12px",
                  background: "#fff",
                  border: listOpen ? "0" : "1px solid var(--color-border)",
                  borderRadius: "var(--radius-s)",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "var(--color-ink)",
                  textAlign: "left",
                }}
              >
                <span>応募した講師（{applicants.length}名）</span>
                {newApplicants > 0 && (
                  <span className="status-badge status-badge--rejected" style={{ fontSize: 10 }}>
                    NEW {newApplicants}
                  </span>
                )}
                {answerNeeded > 0 && (
                  <span style={{ padding: "2px 8px", borderRadius: "var(--radius-pill)", background: "#FFF1DB", color: "#9A5B0C", fontSize: 11 }}>
                    返事が必要 {answerNeeded}
                  </span>
                )}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ marginLeft: "auto", color: "var(--color-ink-soft)", transform: listOpen ? "rotate(180deg)" : undefined, transition: "transform .15s" }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {listOpen && (
                <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
                {sortedApplicants.map((a) => {
                  const { meeting, button } = meetingParts(a);
                  return (
                    <ApplicantRow
                      key={a.response_id}
                      name={instructorMap[a.instructor_id]?.name || "講師"}
                      response={a}
                      meeting={meeting}
                      meetingButton={button}
                      busy={busy}
                      onDecide={() => handleFinalizeApplicant(a.response_id, a.instructor_id)}
                      stage={stageOf(a, st.key === "accepted" || st.key === "completed")}
                      onRequestInterview={st.key === "pending" || st.key === "quoted" ? () => askInterview(a.response_id) : undefined}
                      budget={r}
                      extra={a.is_selected ? decidedTabsFor({ responseId: a.response_id, instructorId: a.instructor_id, name: nameOfDecided(a), roleLabel: a.role_slot_id ? roleSlots.find((x) => x.id === a.role_slot_id)?.name ?? null : null }) : undefined}
                      onStageChange={st.key === "accepted" || st.key === "completed" || a.is_selected ? undefined : (v) => changeStage(a.response_id, v)}
                      decidedLabel={a.is_selected ? `決定${hasRoles ? `：${roleSlots.find((x) => x.id === a.role_slot_id)?.name ?? ""}` : ""}` : null}
                      decideExtra={
                        hasRoles && slotsOpen.length > 1 ? (
                          <Select aria-label="決定する職種" value={slotPick[a.response_id] ?? slotsOpen.find((x) => x.name === a.apply_role)?.id ?? ""} onChange={(e) => setSlotPick({ ...slotPick, [a.response_id]: e.target.value })} style={{ minWidth: 150 }}>
                            <option value="">職種を選ぶ</option>
                            {slotsOpen.map((sl) => (
                              <option key={sl.id} value={sl.id}>
                                {sl.name}
                              </option>
                            ))}
                          </Select>
                        ) : null
                      }
                      // While nobody is decided yet the whole request can still be cancelled (after that, close recruiting instead).
                      onCancelRequest={st.key === "quoted" && selectedResps.length === 0 ? handleCancel : undefined}
                    />
                  );
                })}
                </div>
              )}
            </div>
          ) : null}
          {/* #45: keep the edit link after applications arrive (the edit page itself locks once a lecturer is decided). */}
          {r.publish_state !== "draft" && (st.key === "pending" || st.key === "quoted") && (applicants.length > 0 || !deadlinePassed(r.apply_deadline)) && (
            <div className="request-card__actions">
              {applicants.length > 0 && (
                <Link href={`/edit-request?id=${r.request_id}`} className="btn btn--ghost btn--sm">
                  内容を編集する
                </Link>
              )}
              {!deadlinePassed(r.apply_deadline) && (
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={handleCloseApplications}>
                  応募の受付を終了する
                </button>
              )}
              {/* Also here (not only inside an applicant row): the whole request can be cancelled while nobody is decided. */}
              {st.key === "quoted" && selectedResps.length === 0 && (
                <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={handleCancel}>
                  依頼をキャンセルする
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {resp ? (
            <div className="request-card__response">
              <strong>
                講師からの返信：{resp.action === "accept" ? "承諾" : resp.action === "quote" ? quoteText(resp) : "却下"}
              </strong>
              {resp.requester_seen_at === null && (
                <span className="status-badge status-badge--rejected" style={{ marginLeft: 6, fontSize: 10 }}>
                  NEW
                </span>
              )}
              {resp.message || "（メッセージなし）"}
            </div>
          ) : (
            <p className="request-card__desc" style={{ color: "var(--color-ink-soft)" }}>
              講師の返信をお待ちください。
            </p>
          )}
          {resp && meetingBlock(resp)}

          {st.key === "quoted" && resp && (
            <div className="request-card__actions">
              <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => confirmFinalize(resp.response_id, resp.instructor_id)}>
                この内容で依頼を確定する
              </button>
              <Link href={`/edit-request?id=${r.request_id}`} className="btn btn--ghost btn--sm">
                内容を編集する
              </Link>
              <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={handleCancel}>
                依頼をキャンセルする
              </button>
            </div>
          )}
        </>
      )}

      {/* One compact row: メモ・担当者 | 商流設定 | 依頼を複製 | 公開停止 (wraps only on narrow screens). */}
      {(r.requester_type !== "individual" || (isBroadcast && r.publish_state !== "draft")) && (
        <div className="request-card__tools">
          {r.requester_type !== "individual" && <InternalNote requestId={r.request_id} requesterId={userId} onSaved={() => void onChanged()} />}
          {r.requester_type !== "individual" && (
            <FlowPanel requestId={r.request_id} requesterId={userId} decidedName={(selectedResp ?? (resp?.is_selected ? resp : null)) ? "決定した講師" : null} severalInstructors={hasRoles} onChanged={onChanged} />
          )}
          {isBroadcast && r.publish_state !== "draft" && (
            <Link href={`/post-request?copy=${r.request_id}`} className="btn btn--ghost btn--sm tool-btn">
              <CopyIcon />
              依頼を複製
            </Link>
          )}
          {isBroadcast && (st.key === "pending" || st.key === "quoted") && (
            <button type="button" className="btn btn--ghost btn--sm tool-btn" disabled={busy} onClick={() => changePublish(r.publish_state === "paused" ? "published" : "paused")}>
              {r.publish_state === "paused" ? <EyeIcon /> : <EyeOffIcon />}
              {r.publish_state === "paused" ? "公開再開" : "公開停止"}
            </button>
          )}
        </div>
      )}

      {st.key === "pending" && (
        <div className="request-card__actions">
          <Link href={`/edit-request?id=${r.request_id}`} className="btn btn--ghost btn--sm">
            内容を編集する
          </Link>
          <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={handleCancel}>
            依頼をキャンセルする
          </button>
        </div>
      )}

      {isBroadcast && selectedResp && st.key !== "pending" && st.key !== "quoted" && meetings[selectedResp.response_id] && (
        meetingBlock(selectedResp)
      )}

      {(st.key === "accepted" || st.key === "completed") && (
        <CompanySurveyPanel
          requestId={r.request_id}
          title={r.title}
          participantCount={r.participant_count}
          completed={st.key === "completed"}
          individual={r.requester_type === "individual"}
          instructors={(selectedResps.length ? selectedResps.map((sr) => ({ id: sr.instructor_id, name: nameOfDecided(sr), role: roleSlots.find((x) => x.id === sr.role_slot_id)?.name ?? null })) : r.target_instructor_id ? [{ id: r.target_instructor_id, name: instrBase.name || null, role: null }] : [])}
        />
      )}

      {/* The decided lecturer(s): 注文書・請求書 and 連絡先 in tabs. With applicant rows they sit inside the lecturer's own row. */}
      {!inApplicantRows && decidedPeople.length > 0 && (
        <>
          {decidedPeople.map((p) => (
            <section key={p.responseId} className="dt-person">
              {hasRoles && (
                <div className="dt-person__name">
                  {p.name} 先生{p.roleLabel && <span className="dt-person__role">{p.roleLabel}</span>}
                </div>
              )}
              {decidedTabsFor(p)}
            </section>
          ))}
          {contactOn && st.key === "accepted" && (
            <div className="request-card__actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={handleComplete}>
                研修完了として記録する
              </button>
            </div>
          )}
        </>
      )}
      {inApplicantRows && contactOn && st.key === "accepted" && (
        <div className="request-card__actions">
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={handleComplete}>
            研修完了として記録する
          </button>
        </div>
      )}

      </div>
      </div>
      )}
    </div>
  );
}

function RequesterMypage({ user }: { user: CurrentUser }) {
  const { byResponse: meetings } = useMineMeetings(user.id);
  const [all, setAll] = useState<ReqWithJoins[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [instructorMap, setInstructorMap] = useState<Record<string, { name?: string | null; contact_email?: string | null; contact_phone?: string | null }>>({});
  const [currentTab, setCurrentTab] = useState("all");
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [recruitFilter, setRecruitFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [unseenCount, setUnseenCount] = useState(0);
  const [docStates, setDocStates] = useState<Record<string, DocState>>({});
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [proposalCounts, setProposalCounts] = useState<Record<string, number>>({});
  const [view, setView] = useState<"mine" | "partner">("mine");
  const [partnerCount, setPartnerCount] = useState(0);
  const openPartnerView = useCallback(() => setView("partner"), []);

  const load = useCallback(async () => {
    flushMineNotices();
    const { data, error } = await getRequestsForRequester(user.id);
    if (error) {
      setLoadError(error.message);
      return;
    }
    const rows = (data || []) as unknown as ReqWithJoins[];
    setAll(rows);
    try {
      setDocStates(await getDocStates(rows.flatMap((r) => (r.instructor_responses || []).filter((x) => x.is_selected).map((x) => x.response_id))));
    } catch {
      setDocStates({});
    }
    // 担当者 (company only): saved in the 社内メモ. Searched and shown in each row.
    if (user.role === "COMPANY") {
      const db = createBrowserClient() as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: { request_id: string; owner_name: string | null }[] | null }> } } };
      const { data: noteRows } = await db.from("request_internal_notes").select("request_id, owner_name").eq("requester_id", user.id);
      const map: Record<string, string> = {};
      for (const n of noteRows || []) if (n.owner_name?.trim()) map[n.request_id] = n.owner_name.trim();
      setOwners(map);
      setProposalCounts(await getNewProposalCounts(rows.map((x) => x.request_id)));
    }

    // New applicants of open requests stay "unseen" (red dot) until the company opens that request's row;
    // everything else (direct requests, declines, closed requests) is marked as seen right away.
    const isOpenRow = (r: ReqWithJoins) => {
      const key = requesterDisplayStatus(r).key;
      return !r.target_instructor_id && (key === "pending" || key === "quoted");
    };
    const isApplicant = (x: { action?: string | null }) => x.action === "accept" || x.action === "quote";
    const keepUnseen = (r: ReqWithJoins, x: { action?: string | null }) => isOpenRow(r) && isApplicant(x);
    const unseenAll = rows.flatMap((r) => (r.instructor_responses || []).filter((x) => x.requester_seen_at === null).map((x) => ({ r, x })));
    setUnseenCount(unseenAll.filter(({ r, x }) => keepUnseen(r, x)).length);
    markResponsesSeenByRequester(unseenAll.filter(({ r, x }) => !keepUnseen(r, x)).map(({ x }) => x.response_id));

    const allResponseInstructorIds = rows.flatMap((r) => (r.instructor_responses || []).map((x) => x.instructor_id));
    const targetIds = [...new Set([...rows.map((r) => resolveInstructorId(r)).filter((x): x is string => !!x), ...allResponseInstructorIds])];
    let map: Record<string, { name?: string | null; contact_email?: string | null; contact_phone?: string | null }> = {};
    if (targetIds.length) {
      map = await getInstructorNames(targetIds);
      // Show initials, not full names (Mine decides what else is public).
      const display = await fetchMineDisplay(targetIds);
      Object.keys(map).forEach((id) => {
        map[id] = { ...map[id], name: display[id]?.initials || initialsFromName(map[id]?.name) || null };
      });
    }
    // A released name belongs to ONE reply (one request), so it is not put into this
    // per-instructor map: otherwise a name released on one request would show on all of them.
    // The cards and rows read response.released_name themselves.
    const acceptedIds = [
      ...new Set(
        rows.flatMap((r) => {
          const own = r.status === "accepted" || r.status === "completed" ? resolveInstructorId(r) : null;
          // every decided instructor (several when the request has role slots)
          const chosen = (r.instructor_responses || []).filter((x) => x.is_selected).map((x) => x.instructor_id);
          return [...(own ? [own] : []), ...chosen];
        }),
      ),
    ];
    if (acceptedIds.length) {
      const unlocked = await getInstructorContacts(acceptedIds);
      Object.keys(unlocked).forEach((id) => {
        map[id] = { ...map[id], ...unlocked[id] };
      });
    }
    // Contact details of the decided instructor come from Mine (email, optional phone).
    const decided = rows.filter((r) => r.status === "accepted" || r.status === "completed" || (r.instructor_responses || []).some((x) => x.is_selected));
    if (decided.length) {
      try {
        const res = await fetch("/api/requests/decided-contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestIds: decided.map((r) => r.request_id) }),
          cache: "no-store",
        });
        if (res.ok) {
          const body = (await res.json()) as { items?: Record<string, { email: string | null; phone: string | null }>; byInstructor?: Record<string, { email: string | null; phone: string | null }> };
          for (const [id, contact] of Object.entries(body.byInstructor ?? {})) {
            map[id] = { ...map[id], contact_email: contact.email, contact_phone: contact.phone };
          }
          for (const r of decided) {
            const contact = body.items?.[r.request_id];
            const id = resolveInstructorId(r);
            if (contact && id) map[id] = { ...map[id], contact_email: contact.email, contact_phone: contact.phone };
          }
        }
      } catch {
        // keep what the old profile holds
      }
    }
    setInstructorMap(map);
  }, [user.id]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  // An order / invoice changed inside a card: refresh the red dots and the 要対応 list right away.
  useEffect(() => {
    if (!all) return;
    const ids = all.flatMap((r) => (r.instructor_responses || []).filter((x) => x.is_selected).map((x) => x.response_id));
    if (ids.length === 0) return;
    const refresh = () => {
      getDocStates(ids)
        .then(setDocStates)
        .catch(() => undefined);
    };
    window.addEventListener("kl-doc-changed", refresh);
    window.addEventListener("kl-order-changed", refresh);
    return () => {
      window.removeEventListener("kl-doc-changed", refresh);
      window.removeEventListener("kl-order-changed", refresh);
    };
  }, [all]);

  const filtered = useMemo(() => {
    if (!all) return [];
    return all
      .filter((r) => currentTab === "all" || requesterDisplayStatus(r).key === currentTab)
      .filter((r) => !year || new Date(r.created_at).getFullYear() === Number(year))
      .filter((r) => !recruitFilter || recruitStateOf(r) === recruitFilter)
      .filter((r) => !roleFilter || normalizeSlots(r.role_slots).some((sl) => sl.name === roleFilter))
      .filter((r) => !monthFilter || monthsOfDays(normalizeDays(r.schedule_days)).includes(monthFilter))
      .filter((r) => {
        if (!search.trim()) return true;
        const names = [r.target_instructor_id, ...(r.instructor_responses || []).map((x) => x.instructor_id)].map((id) => (id ? instructorMap[id]?.name ?? "" : ""));
        const hay = [
          r.title,
          r.description,
          r.location ?? "",
          r.request_id,
          owners[r.request_id] ?? "",
          names.join(" "),
          requesterDisplayStatus(r).label,
          nextActionOf(r) ?? "",
          budgetText(r) ?? "",
          r.visibility && r.visibility !== "public" ? VISIBILITY_TEXT[r.visibility] ?? "" : "",
        ].join(" ");
        return matchesSearch(search, hay);
      });
  }, [all, currentTab, search, year, recruitFilter, roleFilter, monthFilter, owners, instructorMap]);
  const roleOptions = useMemo(() => [...new Set((all || []).flatMap((r) => normalizeSlots(r.role_slots).map((sl) => sl.name)))], [all]);
  const monthOptions = useMemo(() => [...new Set((all || []).flatMap((r) => monthsOfDays(normalizeDays(r.schedule_days))))].sort(), [all]);
  const years = useMemo(() => [...new Set((all || []).map((r) => new Date(r.created_at).getFullYear()))].sort((x, y) => y - x), [all]);
  const mineLinked = useMineLinkedInstructors(
    (all || []).flatMap((r) => (r.instructor_responses || []).map((x) => x.instructor_id)),
  );

  const tabs: [string, string][] = [
    ["all", "すべて"],
    ...((all || []).some((r) => r.publish_state === "draft") ? ([["draft", "下書き"]] as [string, string][]) : []),
    ["pending", "対応待ち"],
    ["quoted", "応募・見積り"],
    ["accepted", "承諾済み"],
    ["completed", "完了"],
    ["rejected", "却下"],
    ["cancelled", "キャンセル"],
  ];

  return (
    <>
      <div className="mypage__head">
        <h1 className="mypage__title">マイページ（{user.role === "COMPANY" ? "企業" : "生徒"}）</h1>
        <p className="mypage__role">{user.name} としてログイン中</p>
      </div>
      <div style={{ marginBottom: 28 }}>
        <RequesterProfileCard userId={user.id} fallbackName={user.name} />
      </div>
      {user.role === "COMPANY" && (
        <div className="status-tabs" role="tablist" aria-label="表示の切り替え" style={{ marginBottom: 18 }}>
          <button type="button" role="tab" aria-selected={view === "mine"} className={`status-tab${view === "mine" ? " is-active" : ""}`} onClick={() => setView("mine")}>
            自社の依頼
          </button>
          <button type="button" role="tab" aria-selected={view === "partner"} className={`status-tab${view === "partner" ? " is-active" : ""}`} onClick={() => setView("partner")}>
            関係先の案件
            {partnerCount > 0 && <span className="status-tab__count">({partnerCount})</span>}
          </button>
        </div>
      )}
      {user.role === "COMPANY" && (
        <div hidden={view !== "partner"}>
          <PartnerRequests onCount={setPartnerCount} onPendingCode={openPartnerView} />
        </div>
      )}
      <div hidden={view !== "mine"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 className="section__title" style={{ fontSize: 18, margin: 0 }}>
          依頼一覧
          {unseenCount > 0 && <span className="status-badge status-badge--rejected" style={{ marginLeft: 6 }}>{unseenCount}</span>}
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {user.role === "COMPANY" && (
            <>
              <Link href="/my-instructors" className="btn btn--ghost btn--sm">
                自社の講師台帳
              </Link>
              <Link href="/my-partners" className="btn btn--ghost btn--sm">
                関係先の管理
              </Link>
            </>
          )}
          <Link href="/post-request" className="btn btn--primary btn--sm">
            研修を依頼する（公募）
          </Link>
        </div>
      </div>
      <div className="status-tabs">
        {tabs.map(([key, label]) => {
          const count = key === "all" ? (all?.length ?? 0) : (all || []).filter((r) => requesterDisplayStatus(r).key === key).length;
          return (
            <button key={key} type="button" className={`status-tab${currentTab === key ? " is-active" : ""}`} onClick={() => setCurrentTab(key)}>
              {label}
              <span className="status-tab__count">({count})</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
        <input type="search" placeholder={user.role === "COMPANY" ? "案件名・キーワード・案件番号・担当者で探す" : "案件名・キーワード・案件番号で探す"} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: "1 1 220px", minWidth: 0 }} />
        {years.length > 0 && (
          <Select aria-label="年" value={year} onChange={(e) => setYear(e.target.value)} style={{ flex: "0 0 120px" }}>
            <option value="">すべての年</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}年
              </option>
            ))}
          </Select>
        )}
        <Select aria-label="募集状況" value={recruitFilter} onChange={(e) => setRecruitFilter(e.target.value)} style={{ flex: "0 0 140px" }}>
          <option value="">募集状況：すべて</option>
          {(Object.keys(RECRUIT_STATE_LABEL) as RecruitState[]).map((k) => (
            <option key={k} value={k}>
              {RECRUIT_STATE_LABEL[k]}
            </option>
          ))}
        </Select>
        {roleOptions.length > 0 && (
          <Select aria-label="職種" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ flex: "0 0 140px" }}>
            <option value="">職種：すべて</option>
            {roleOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        )}
        {monthOptions.length > 0 && (
          <Select aria-label="開催月" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={{ flex: "0 0 150px" }}>
            <option value="">開催月：すべて</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
        )}
      </div>
      {loadError && <p style={{ color: "var(--color-danger)", fontSize: 13 }}>読み込みエラー：{loadError}</p>}
      {!loadError && all === null && <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>}
      {!loadError && all !== null && filtered.length === 0 && (
        <EmptyNote title="該当する依頼はありません">「講師を探す」から気になる講師に依頼を送ってみましょう。</EmptyNote>
      )}
      {filtered.map((r) => (
        <RequesterRequestCard
          key={r.request_id}
          r={r}
          userId={user.id}
          instructorMap={instructorMap}
          meetings={meetings}
          mineLinked={mineLinked}
          owner={owners[r.request_id]}
          onSeen={(n) => setUnseenCount((c) => Math.max(0, c - n))}
          proposals={proposalCounts[r.request_id] ?? 0}
          docs={docStates}
          onChanged={load}
        />
      ))}
      </div>
    </>
  );
}

export default function MyPage() {
  const { authReady, user } = useAuth();
  useRoleTheme(user?.role === "INSTRUCTOR" ? "instructor" : user ? "business" : null);

  if (!authReady) {
    return (
      <main className="mypage">
        <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mypage">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <span className="hanko hanko--logo" style={{ margin: "0 auto 16px" }}>
            研
          </span>
          <p className="empty-state__title">マイページを見るにはログインが必要です</p>
          <Link href="/login" className="btn btn--primary" style={{ marginTop: 16 }}>
            ログイン
          </Link>
        </div>
      </main>
    );
  }

  return <main className="mypage">{user.role === "INSTRUCTOR" ? <InstructorMypage user={user} /> : <RequesterMypage user={user} />}</main>;
}
