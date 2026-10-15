"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/common/Toast";
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
  countUnseenNotSelectedResults,
  markResponsesSeenByRequester,
  submitInstructorResponse,
} from "@/lib/requests/instructor-responses";
import { submitReview, replyToReview } from "@/lib/requests/reviews";
import { finalizeResponse } from "@/lib/requests/actions";
import type { InstructorResponseRow, TrainingRequestRow, TrainingReviewRow } from "@/types/database";
import type { CurrentUser } from "@/lib/auth/auth";
import { ApplicantRow, applicantPriority } from "@/components/mine/ApplicantRow";
import { CompanySurveyPanel } from "@/components/survey/CompanySurveyPanel";
import { InstructorSurveyPanel } from "@/components/survey/InstructorSurveyPanel";
import { InstructorSurveyResults } from "@/components/survey/InstructorSurveyResults";
import { BookMineMeetingButton, MineMeetingLine, useMineLinkedInstructors, useMineMeetings } from "@/components/mine/MineMeeting";
import type { KenshuMineMeetingRow } from "@/types/database";
import "./mypage.css";

const FORMAT_LABEL: Record<string, string> = { online: "オンライン", offline: "対面", both: "オンライン・対面" };

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

type ReqWithJoins = TrainingRequestRow & { instructor_responses: InstructorResponseRow[]; training_reviews: TrainingReviewRow[] };

/* ===================================================================
   講師側マイページ
   =================================================================== */

function ProfileStatusCard({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<{ id: string; is_public: boolean; prefectures: string[] | null; self_pr: string | null; contact_email: string | null; contact_phone: string | null } | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const { data } = await getInstructorProfileSummary(userId);
      setProfile(data ?? null);
    })();
  }, [userId]);

  if (profile === undefined) return <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>プロフィール状況を読み込み中…</p>;

  if (!profile) {
    return (
      <div className="request-card">
        <p className="request-card__desc">プロフィールを作成すると「講師を探す」の検索結果に表示され、依頼を受けられるようになります。</p>
        <Link href="/instructor-profile-edit" className="btn btn--primary btn--sm">
          プロフィールを作成する
        </Link>
      </div>
    );
  }

  const missingContact = !profile.contact_email || !profile.contact_phone;

  return (
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
  );
}

function instructorDisplayStatus(r: ReqWithJoins, myResponse: InstructorResponseRow | null) {
  if (r.status === "cancelled") return { key: "cancelled", label: "依頼者によりキャンセル" };
  if (r.status === "completed") return { key: "completed", label: "完了" };
  if (r.status === "accepted") return { key: "accepted", label: "承諾済み" };
  if (myResponse) {
    if (myResponse.action === "reject" || myResponse.action === "withdrawn") return { key: "rejected", label: "却下済み" };
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
}: {
  r: ReqWithJoins;
  userId: string;
  requester: { name?: string; email?: string; phone?: string | null } | undefined;
  meetings: Record<string, KenshuMineMeetingRow>;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const myResponse = (r.instructor_responses || []).find((x) => x.instructor_id === userId) || null;
  const st = instructorDisplayStatus(r, myResponse);
  const review = (r.training_reviews || [])[0] || null;
  const meeting = myResponse ? meetings[myResponse.response_id] : undefined;

  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quotePrice, setQuotePrice] = useState("");
  const [quoteMessage, setQuoteMessage] = useState("");
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);

  async function respond(action: "accept" | "reject") {
    setBusy(true);
    const { error } = await submitInstructorResponse(r.request_id, userId, action);
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast(action === "accept" ? "依頼を承諾しました。依頼者の確定操作をお待ちください。" : "依頼を却下しました。");
    onChanged();
  }

  async function submitQuote() {
    const price = Number(quotePrice) || null;
    if (!price) return showToast("見積り金額を入力してください");
    setBusy(true);
    const { error } = await submitInstructorResponse(r.request_id, userId, "quote", { quote_price: price, message: quoteMessage.trim() || null });
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("見積りを送信しました。");
    onChanged();
  }

  async function submitReply() {
    if (!replyText.trim() || !review) return showToast("返信内容を入力してください");
    setBusy(true);
    const { error } = await replyToReview(review.review_id, replyText.trim());
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("返信を投稿しました。");
    onChanged();
  }

  return (
    <div className="request-card">
      <div className="request-card__top">
        <div>
          <div className="request-card__title">{r.title}</div>
          <div className="request-card__meta">
            <span>{r.requester_type === "company" ? "企業" : "生徒"}からの依頼</span>
            <span>{fmtDate(r.created_at)}</span>
          </div>
        </div>
        <span className={`status-badge status-badge--${st.key === "quoted" ? "quoted" : st.key === "rejected" ? "rejected" : st.key}`}>{st.label}</span>
      </div>

      <p className="request-card__desc">{r.description}</p>
      <div className="request-card__tags">
        <span className="instructor-card__tag">{FORMAT_LABEL[r.preferred_format] || r.preferred_format}</span>
        {r.budget ? <span className="instructor-card__tag">予算 ¥{Number(r.budget).toLocaleString()}</span> : null}
        {r.participant_count ? <span className="instructor-card__tag">対象{r.participant_count}名</span> : null}
        {r.location ? <span className="instructor-card__tag">{r.location}</span> : null}
        {r.preferred_schedule ? <span className="instructor-card__tag">{r.preferred_schedule}</span> : null}
      </div>

      {myResponse && (
        <div className="request-card__response">
          <strong>
            あなたの対応：
            {myResponse.action === "accept" ? "承諾" : myResponse.action === "quote" ? `見積り ¥${Number(myResponse.quote_price || 0).toLocaleString()}` : "却下"}
          </strong>
          {myResponse.message || "（メッセージなし）"}
        </div>
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

      {meeting && <MineMeetingLine meeting={meeting} viewer="instructor" />}

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
              <label>見積り金額（時間あたり）</label>
              <input type="number" min={0} step={1000} placeholder="例：14000" value={quotePrice} onChange={(e) => setQuotePrice(e.target.value)} />
            </div>
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

      {review && (
        <>
          <div className="review-item" style={{ marginTop: 14 }}>
            <div className="review-item__top">
              <span className="review-item__name">依頼者からのレビュー</span>
              <span className="review-item__rating">★ {review.rating}</span>
            </div>
            <p className="review-item__comment">{review.comment || "（コメントなし）"}</p>
          </div>
          {review.instructor_reply ? (
            <div className="request-card__response">
              <strong>あなたの返信</strong>
              {review.instructor_reply}
            </div>
          ) : (
            <>
              <div className="request-card__actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReplyOpen((v) => !v)}>
                  レビューに返信する
                </button>
              </div>
              <div className={`inline-quote-form${replyOpen ? " is-open" : ""}`}>
                <div className="form-field">
                  <label>返信メッセージ</label>
                  <textarea rows={2} placeholder="ご感想へのお礼や補足をご記入ください" value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                </div>
                <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={submitReply}>
                  返信を送信する
                </button>
              </div>
            </>
          )}
        </>
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
  const [openRequestsUnseen, setOpenRequestsUnseen] = useState(0);

  const load = useCallback(async () => {
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
    countUnseenNotSelectedResults(user.id).then(setOpenRequestsUnseen);
  }, [load, user.id]);

  const filtered = useMemo(() => {
    if (!all) return [];
    if (currentTab === "all") return all;
    return all.filter((r) => {
      const myResponse = (r.instructor_responses || []).find((x) => x.instructor_id === user.id) || null;
      return instructorDisplayStatus(r, myResponse).key === currentTab;
    });
  }, [all, currentTab, user.id]);

  const tabs = [
    ["all", "すべて"],
    ["pending", "対応待ち"],
    ["quoted", "返信済み"],
    ["accepted", "承諾済み"],
    ["completed", "完了"],
    ["rejected", "却下"],
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
      <InstructorSurveyResults instructorId={user.id} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 className="section__title" style={{ fontSize: 18, margin: 0 }}>
          受け取った依頼
        </h2>
        <Link href="/open-requests" className="btn btn--ghost btn--sm">
          公募中の依頼を見る →{openRequestsUnseen > 0 && <span className="status-badge status-badge--rejected" style={{ marginLeft: 6 }}>{openRequestsUnseen}</span>}
        </Link>
      </div>
      <div className="status-tabs">
        {tabs.map(([key, label]) => {
          const count = key === "all" ? (all?.length ?? 0) : (all || []).filter((r) => {
            const myResponse = (r.instructor_responses || []).find((x) => x.instructor_id === user.id) || null;
            return instructorDisplayStatus(r, myResponse).key === key;
          }).length;
          return (
            <button key={key} type="button" className={`status-tab${currentTab === key ? " is-active" : ""}`} onClick={() => setCurrentTab(key)}>
              {label}
              <span className="status-tab__count">({count})</span>
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
      {filtered.map((r) => (
        <InstructorRequestCard key={r.request_id} r={r} userId={user.id} requester={requesterMap[r.requester_id]} meetings={meetings} onChanged={load} />
      ))}
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
    const canChange = !!meeting && meeting.status !== "cancelled" && Date.parse(meeting.ends_at) > Date.now();
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
        {meeting && <MineMeetingLine meeting={meeting} viewer="requester" actions={canChange ? button : undefined} />}
        {!canChange && button && <div style={{ marginTop: 8, marginBottom: 12 }}>{button}</div>}
      </>
    );
  };
  const isBroadcast = !r.target_instructor_id;
  const resp = (r.instructor_responses || [])[0] || null;
  const selectedResp = (r.instructor_responses || []).find((x) => x.is_selected);
  const instr = instructorMap[r.target_instructor_id || (selectedResp || resp)?.instructor_id || ""] || {};
  const review = (r.training_reviews || [])[0] || null;
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");

  async function finalize(responseId: string, instructorId: string) {
    setBusy(true);
    const { error } = await finalizeResponse({ requestId: r.request_id, responseId, instructorId });
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("依頼を確定しました。連絡先が開示されます。");
    onChanged();
  }

  async function handleFinalizeApplicant(responseId: string, instructorId: string) {
    if (!confirm("この講師に決定しますか？他の応募者には決定されなかった旨が表示されます。")) return;
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
    const reason = prompt("キャンセル理由を入力してください（任意）") || null;
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
    showToast("研修を完了として記録しました。レビューを投稿できます。");
    onChanged();
  }

  async function handleSubmitReview() {
    if (!stars) return showToast("評価（星）を選択してください");
    const instructorId = r.target_instructor_id || (selectedResp || resp)?.instructor_id;
    if (!instructorId) return;
    setBusy(true);
    const { error } = await submitReview({ request_id: r.request_id, reviewer_id: userId, instructor_id: instructorId, rating: stars, comment: comment.trim() || null });
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("レビューを投稿しました。ありがとうございます！");
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
          </div>
        </div>
        <span className={`status-badge status-badge--${st.key === "quoted" ? "quoted" : st.key === "rejected" ? "rejected" : st.key}`}>{st.label}</span>
      </div>

      <p className="request-card__desc">{r.description}</p>
      <div className="request-card__tags">
        <span className="instructor-card__tag">{FORMAT_LABEL[r.preferred_format] || r.preferred_format}</span>
        {r.budget ? <span className="instructor-card__tag">予算 ¥{Number(r.budget).toLocaleString()}</span> : null}
        {r.participant_count ? <span className="instructor-card__tag">対象{r.participant_count}名</span> : null}
      </div>

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
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
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
                講師からの返信：{resp.action === "accept" ? "承諾" : resp.action === "quote" ? `見積り ¥${Number(resp.quote_price || 0).toLocaleString()}` : "却下"}
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
              <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={handleCancel}>
                依頼をキャンセルする
              </button>
            </div>
          )}
        </>
      )}

      {st.key === "pending" && (
        <div className="request-card__actions">
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

      {st.key === "completed" &&
        (review ? (
          <>
            <div className="request-card__response">
              <strong>投稿済みレビュー：★ {review.rating}</strong>
              {review.comment || ""}
            </div>
            {review.instructor_reply && (
              <div className="request-card__response">
                <strong>講師からの返信</strong>
                {review.instructor_reply}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="request-card__actions">
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setReviewOpen((v) => !v)}>
                レビューを投稿する
              </button>
            </div>
            <div className={`review-form-inline${reviewOpen ? " is-open" : ""}`}>
              <div className="star-picker">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={n <= stars ? "is-filled" : ""} onClick={() => setStars(n)}>
                    ★
                  </button>
                ))}
              </div>
              <div className="form-field">
                <textarea rows={2} placeholder="研修の感想をご記入ください" value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleSubmitReview}>
                レビューを送信する
              </button>
            </div>
          </>
        ))}
    </div>
  );
}

function RequesterMypage({ user }: { user: CurrentUser }) {
  const { byResponse: meetings } = useMineMeetings(user.id);
  const [all, setAll] = useState<ReqWithJoins[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [instructorMap, setInstructorMap] = useState<Record<string, { name?: string | null; contact_email?: string | null; contact_phone?: string | null }>>({});
  const [currentTab, setCurrentTab] = useState("all");
  const [unseenCount, setUnseenCount] = useState(0);

  const load = useCallback(async () => {
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
    const acceptedIds = rows.filter((r) => r.status === "accepted" || r.status === "completed").map((r) => resolveInstructorId(r)).filter((x): x is string => !!x);
    if (acceptedIds.length) {
      const unlocked = await getInstructorContacts(acceptedIds);
      Object.keys(unlocked).forEach((id) => {
        map[id] = { ...map[id], ...unlocked[id] };
      });
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
    if (currentTab === "all") return all;
    return all.filter((r) => requesterDisplayStatus(r).key === currentTab);
  }, [all, currentTab]);
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
        <Link href="/post-request" className="btn btn--primary btn--sm">
          研修を依頼する（公募）
        </Link>
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
