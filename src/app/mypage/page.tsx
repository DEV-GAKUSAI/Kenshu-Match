"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "@/lib/requests/instructor-responses";
import { ApplyFields, EMPTY_APPLY, applyPayload, type ApplyValue } from "@/components/requests/ApplyFields";
import { DetailsView } from "@/components/requests/DetailsView";
import { InvoicePanel } from "@/components/requests/InvoicePanel";
import { OrderPanel } from "@/components/requests/OrderPanel";
import { FlowPanel } from "@/components/requests/FlowPanel";
import { InternalNote } from "@/components/requests/InternalNote";
import { ResponseManage } from "@/components/requests/ResponseManage";
import { finalizeResponse } from "@/lib/requests/actions";
import { budgetText, costLines, normalUnit, quoteText, UNIT_OPTIONS } from "@/lib/requests/money";
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

      <p className="request-card__desc">{r.description}</p>
      <div className="request-card__tags">
        <span className="instructor-card__tag">{FORMAT_LABEL[r.preferred_format] || r.preferred_format}</span>
        {budgetText(r) ? <span className="instructor-card__tag">{budgetText(r)}</span> : null}
        {r.participant_count ? <span className="instructor-card__tag">対象{r.participant_count}名</span> : null}
        {r.location ? <span className="instructor-card__tag">{r.location}</span> : null}
        {r.preferred_schedule ? <span className="instructor-card__tag">{r.preferred_schedule}</span> : null}
      </div>

      {myResponse && (
        <div className="request-card__response">
          <strong>
            あなたの対応：
            {myResponse.action === "accept" ? "承諾" : myResponse.action === "quote" ? quoteText(myResponse) : myResponse.action === "withdrawn" ? "取り下げ" : "却下"}
          </strong>
          {myResponse.message || "（メッセージなし）"}
          <ResponseManage response={myResponse} request={r} onChanged={onChanged} />
        </div>
      )}
      {myResponse?.is_selected && (r.status === "accepted" || r.status === "completed") && <OrderPanel responseId={myResponse.response_id} role="instructor" />}
      {myResponse?.is_selected && (r.status === "accepted" || r.status === "completed") && <InvoicePanel responseId={myResponse.response_id} role="instructor" />}

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

      {(st.key === "accepted" || st.key === "completed") && (
        <div className="contact-box">
          <strong>連絡先：</strong>
          {requester ? (
            <>
              <div>{(requester as { company_name?: string }).company_name ? `会社名：${(requester as { company_name?: string }).company_name}` : `担当者：${requester.name}`}</div>
              <div>メール：{requester.email}</div>
              <div>電話番号：{requester.phone || "未登録"}</div>
            </>
          ) : (
            "読み込み中…"
          )}
        </div>
      )}

      {(st.key === "accepted" || st.key === "completed") && <InstructorSurveyPanel requestId={r.request_id} />}

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
                <input type="number" min={0} step={1000} placeholder="例：14000" value={quotePrice} onChange={(e) => setQuotePrice(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                <Select aria-label="税" value={quoteTax} onChange={(e) => setQuoteTax(e.target.value as "" | "included" | "excluded")} style={{ flex: "0 0 120px" }}>
                  <option value="">税の指定なし</option>
                  <option value="included">税込</option>
                  <option value="excluded">税別</option>
                </Select>
              </div>
            </div>
            <ApplyFields value={apply} onChange={setApply} />
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
function instructorAttention(r: ReqWithJoins, myResponse: InstructorResponseRow | null): { label: string } | null {
  if (r.status !== "pending") return null;
  if (!myResponse) return { label: "要対応" };
  if (myResponse.interview_status === "requested") return { label: "面談の依頼" };
  return null;
}

function InstructorRequestRow({
  r,
  userId,
  requester,
  meetings,
  onChanged,
}: {
  r: ReqWithJoins;
  userId: string;
  requester: { name?: string; email?: string; phone?: string | null; company_name?: string | null } | undefined;
  meetings: Record<string, KenshuMineMeetingRow>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const myResponse = (r.instructor_responses || []).find((x) => x.instructor_id === userId) || null;
  const st = instructorDisplayStatus(r, myResponse);
  const attn = instructorAttention(r, myResponse);
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
  const badgeKey = attn ? "attn" : st.key;
  const badgeLabel = attn ? attn.label : st.key === "quoted" ? "返信済み" : st.label;
  return (
    <div className={`req-row${attn ? " req-row--attn" : ""}${open ? " is-open" : ""}`}>
      <button type="button" className="req-row__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="req-row__main">
          <span className="req-row__line1">
            {attn && <span className="req-row__dot" aria-hidden="true" />}
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

  const load = useCallback(async () => {
    flushMineNotices();
    const { data, error } = await getRequestsForInstructor(user.id);
    if (error) {
      setLoadError(error.message);
      return;
    }
    const rows = (data || []) as unknown as ReqWithJoins[];
    setAll(rows);

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
        <div className="empty-state">
          <p className="empty-state__title">該当する依頼はありません</p>
        </div>
      )}
      {(() => {
        const needs = (r: ReqWithJoins) => !!instructorAttention(r, (r.instructor_responses || []).find((x) => x.instructor_id === user.id) || null);
        const ordered = [...filtered.filter(needs), ...filtered.filter((r) => !needs(r))];
        const shown = ordered.slice(0, shownCount);
        const attnShown = shown.filter(needs);
        const restShown = shown.filter((r) => !needs(r));
        const row = (r: ReqWithJoins) => (
          <InstructorRequestRow key={r.request_id} r={r} userId={user.id} requester={requesterMap[r.requester_id]} meetings={meetings} onChanged={load} />
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
  if (anyActionable) return { key: "quoted", label: "見積り提示中" };
  return { key: "pending", label: "対応待ち" };
}

function RequesterRequestCard({
  r,
  userId,
  instructorMap,
  meetings,
  mineLinked,
  onChanged,
}: {
  r: ReqWithJoins;
  userId: string;
  instructorMap: Record<string, { name?: string | null; contact_email?: string | null; contact_phone?: string | null }>;
  meetings: Record<string, KenshuMineMeetingRow>;
  mineLinked: Set<string>;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const st = requesterDisplayStatus(r);
  const requestOpen = r.status !== "cancelled" && r.status !== "completed";
  /** Meeting line + 「面談を予約」 for one instructor reply (Mine booking, Phase 3c). */
  const meetingParts = (response: InstructorResponseRow) => {
    const meeting = meetings[response.response_id];
    const canBook =
      requestOpen &&
      (response.action === "accept" || response.action === "quote") &&
      mineLinked.has(response.instructor_id) &&
      (!meeting || meeting.status === "cancelled" || Date.parse(meeting.ends_at) <= Date.now());
    // Mine Phase 3d: change the time or cancel an upcoming meeting.
    const canChange = requestOpen && !!meeting && meeting.status !== "cancelled" && Date.parse(meeting.ends_at) > Date.now();
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
  const instrBase = instructorMap[r.target_instructor_id || (selectedResp || resp)?.instructor_id || ""] || {};
  // Full name only when the instructor released it for THIS request (direct accept, or 情報を公開する).
  const releasedForThis = (r.target_instructor_id ? resp : selectedResp)?.released_name?.trim() || null;
  const instr = releasedForThis ? { ...instrBase, name: releasedForThis } : instrBase;
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

  async function finalize(responseId: string, instructorId: string) {
    setBusy(true);
    const { error } = await finalizeResponse({ requestId: r.request_id, responseId, instructorId });
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("依頼を確定しました。連絡先が開示されます。");
    onChanged();
  }

  async function handleFinalizeApplicant(responseId: string, instructorId: string) {
    const { ok } = await confirm({
      title: "この講師に決定しますか？",
      message: "他の応募者には決定されなかった旨が表示されます。",
      confirmLabel: "決定する",
    });
    if (!ok) return;
    await finalize(responseId, instructorId);
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

  async function handleComplete() {
    setBusy(true);
    const { error } = await completeRequest(r.request_id);
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("研修を完了として記録しました。");
    onChanged();
  }

  return (
    <div className="request-card">
      <div className="request-card__top">
        <div>
          <div className="request-card__title">{r.title}</div>
          <div className="request-card__meta">
            <span>{isBroadcast ? (st.key === "accepted" || st.key === "completed" ? `決定：${instr.name || "講師"} 先生` : "公募依頼") : `依頼先：${instr.name || "講師"} 先生`}</span>
            <span>{fmtDate(r.created_at)}</span>
            <span>案件番号 {r.request_id.slice(0, 8)}</span>
          </div>
        </div>
        <span className={`status-badge status-badge--${st.key === "quoted" ? "quoted" : st.key === "rejected" ? "rejected" : st.key}`}>{st.label}</span>
      </div>

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
      <DetailsView r={r} />

      {isBroadcast ? (
        <>
          {applicants.length === 0 ? (
            <>
              <p className="request-card__desc" style={{ color: "var(--color-ink-soft)" }}>
                まだ講師からの応募はありません。
              </p>
              <div className="request-card__actions">
                <Link href={`/request-detail?id=${r.request_id}`} className="btn btn--primary btn--sm btn--pulse" style={{ marginBottom: 14 }}>
                  おすすめの講師を見る
                </Link>
              </div>
            </>
          ) : st.key === "pending" || st.key === "quoted" ? (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
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
                  background: listOpen ? "#E3F8EF" : "#fff",
                  border: listOpen ? "1px solid #8FD9BF" : "1px solid var(--color-border)",
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
              {listOpen &&
                sortedApplicants.map((a) => {
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
                      // While nobody is chosen yet the whole request can still be cancelled.
                      onCancelRequest={st.key === "quoted" ? handleCancel : undefined}
                    />
                  );
                })}
            </div>
          ) : null}
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
              <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => finalize(resp.response_id, resp.instructor_id)}>
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

      <InternalNote requestId={r.request_id} requesterId={userId} />
      <FlowPanel requestId={r.request_id} requesterId={userId} decidedName={(selectedResp ?? (resp?.is_selected ? resp : null)) ? "決定した講師" : null} />

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
        <CompanySurveyPanel requestId={r.request_id} title={r.title} participantCount={r.participant_count} completed={st.key === "completed"} />
      )}

      {(st.key === "accepted" || st.key === "completed") && (selectedResp || (resp?.is_selected ? resp : null)) && (
        <>
          <OrderPanel responseId={(selectedResp ?? resp)!.response_id} role="requester" />
          <InvoicePanel responseId={(selectedResp ?? resp)!.response_id} role="requester" />
        </>
      )}

      {st.key === "accepted" && (
        <>
          <div className="contact-box">
            <strong>連絡先：</strong>
            <div>名前：{instr.name || "講師"}</div>
            <div>メール：{instr.contact_email || "未登録"}</div>
            <div>電話番号：{instr.contact_phone || "未登録"}</div>
          </div>
          <div className="request-card__actions">
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={handleComplete}>
              研修完了として記録する
            </button>
          </div>
        </>
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
  const [unseenCount, setUnseenCount] = useState(0);

  const load = useCallback(async () => {
    flushMineNotices();
    const { data, error } = await getRequestsForRequester(user.id);
    if (error) {
      setLoadError(error.message);
      return;
    }
    const rows = (data || []) as unknown as ReqWithJoins[];
    setAll(rows);

    const unseenResponseIds = rows.flatMap((r) => (r.instructor_responses || []).filter((x) => x.requester_seen_at === null).map((x) => x.response_id));
    setUnseenCount(unseenResponseIds.length);
    markResponsesSeenByRequester(unseenResponseIds);

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
    const acceptedIds = rows.filter((r) => r.status === "accepted" || r.status === "completed").map((r) => resolveInstructorId(r)).filter((x): x is string => !!x);
    if (acceptedIds.length) {
      const unlocked = await getInstructorContacts(acceptedIds);
      Object.keys(unlocked).forEach((id) => {
        map[id] = { ...map[id], ...unlocked[id] };
      });
    }
    // Contact details of the decided instructor come from Mine (email, optional phone).
    const decided = rows.filter((r) => r.status === "accepted" || r.status === "completed");
    if (decided.length) {
      try {
        const res = await fetch("/api/requests/decided-contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestIds: decided.map((r) => r.request_id) }),
          cache: "no-store",
        });
        if (res.ok) {
          const body = (await res.json()) as { items?: Record<string, { email: string | null; phone: string | null }> };
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

  const filtered = useMemo(() => {
    if (!all) return [];
    const kw = search.trim().toLowerCase();
    return all
      .filter((r) => currentTab === "all" || requesterDisplayStatus(r).key === currentTab)
      .filter((r) => !year || new Date(r.created_at).getFullYear() === Number(year))
      .filter((r) => !kw || `${r.title} ${r.description} ${r.location ?? ""} ${r.request_id}`.toLowerCase().includes(kw));
  }, [all, currentTab, search, year]);
  const years = useMemo(() => [...new Set((all || []).map((r) => new Date(r.created_at).getFullYear()))].sort((x, y) => y - x), [all]);
  const mineLinked = useMineLinkedInstructors(
    (all || []).flatMap((r) => (r.instructor_responses || []).map((x) => x.instructor_id)),
  );

  const tabs = [
    ["all", "すべて"],
    ["pending", "対応待ち"],
    ["quoted", "見積り提示中"],
    ["accepted", "承諾済み"],
    ["completed", "完了"],
    ["rejected", "却下"],
    ["cancelled", "キャンセル"],
  ] as const;

  return (
    <>
      <div className="mypage__head">
        <h1 className="mypage__title">マイページ（{user.role === "COMPANY" ? "企業" : "生徒"}）</h1>
        <p className="mypage__role">{user.name} としてログイン中</p>
      </div>
      <div style={{ marginBottom: 28 }}>
        <RequesterProfileCard userId={user.id} fallbackName={user.name} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 className="section__title" style={{ fontSize: 18, margin: 0 }}>
          依頼一覧
          {unseenCount > 0 && <span className="status-badge status-badge--rejected" style={{ marginLeft: 6 }}>{unseenCount}</span>}
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/my-instructors" className="btn btn--ghost btn--sm">
            自社の講師台帳
          </Link>
          <Link href="/my-partners" className="btn btn--ghost btn--sm">
            関係先の管理
          </Link>
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
        <input type="search" placeholder="案件名・キーワード・案件番号で探す" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: "1 1 220px", minWidth: 0 }} />
        {years.length > 1 && (
          <Select aria-label="年" value={year} onChange={(e) => setYear(e.target.value)} style={{ flex: "0 0 120px" }}>
            <option value="">すべての年</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}年
              </option>
            ))}
          </Select>
        )}
      </div>
      {loadError && <p style={{ color: "var(--color-danger)", fontSize: 13 }}>読み込みエラー：{loadError}</p>}
      {!loadError && all === null && <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>}
      {!loadError && all !== null && filtered.length === 0 && (
        <div className="empty-state">
          <p className="empty-state__title">該当する依頼はありません</p>
          <p className="empty-state__desc">「講師を探す」から気になる講師に依頼を送ってみましょう。</p>
        </div>
      )}
      {filtered.map((r) => (
        <RequesterRequestCard
          key={r.request_id}
          r={r}
          userId={user.id}
          instructorMap={instructorMap}
          meetings={meetings}
          mineLinked={mineLinked}
          onChanged={load}
        />
      ))}
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
