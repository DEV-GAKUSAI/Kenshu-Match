"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/common/Toast";
import { useRoleTheme } from "@/hooks/useRoleTheme";
import {
  getOpenRequestPublicDetail,
  getTrainingRequestDetail,
  getTrainingRequestWithResponses,
} from "@/lib/requests/training-requests";
import { budgetText, costLines, isHourly, normalUnit, quoteText, UNIT_OPTIONS, type MoneyFields } from "@/lib/requests/money";
import { DetailsView } from "@/components/requests/DetailsView";
import { normalizeSlots } from "@/lib/requests/roles";
import { STAGE_LABEL, stageOf } from "@/lib/requests/stage";
import { deadlinePassed, deadlineShort } from "@/lib/requests/deadline";
import { requestFormatLabel } from "@/lib/requests/schedule";
import { ApplyFields, EMPTY_APPLY, applyPayload, type ApplyValue } from "@/components/requests/ApplyFields";
import { ResponseManage } from "@/components/requests/ResponseManage";
import { MyResponseDetails } from "@/components/requests/ApplicationDetails";
import { declineInterview, reapplyResponse, releaseInstructorName, submitInstructorResponse } from "@/lib/requests/instructor-responses";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { flushMineNotices } from "@/lib/mine/flush-client";
import { getRequesterContacts } from "@/lib/requester/profile";
import { withMineDisplay } from "@/lib/mine/display";
import { withSurveySummary } from "@/lib/survey/summary-client";
import { surveyScoreLabel } from "@/lib/survey/summary";
import { getMatchingCandidateInstructors } from "@/lib/instructor/profile";
import { getInstructorExpertiseInstructorIds } from "@/lib/instructor/expertise";
import type {
  InstructorPublicDirectoryRow,
  InstructorResponseRow,
  OpenRequestPublicPreviewRow,
  TrainingRequestRow,
} from "@/types/database";
import { Select } from "@/components/ui/Select";

const HIDDEN_KEY = "kenshulink_hidden_open_requests";

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

const BIG_TAG = { fontSize: 15, padding: "8px 16px", fontWeight: 700 } as const;

function Tags({ r }: { r: { preferred_format: string; location: string | null; preferred_schedule: string | null; schedule_days?: unknown; apply_deadline?: string | null; all_days_required?: boolean | null; req_skills?: string | null; req_prep?: string | null } & MoneyFields }) {
  const lines = costLines(r);
  return (
    <>
      <div className="request-card__tags" style={{ margin: "18px 0" }}>
        <span className="instructor-card__tag" style={BIG_TAG}>{requestFormatLabel(r)}</span>
        {budgetText(r) ? <span className="instructor-card__tag" style={BIG_TAG}>{budgetText(r)}</span> : null}
        {r.location ? <span className="instructor-card__tag">{r.location}</span> : null}
        {r.preferred_schedule ? <span className="instructor-card__tag">{r.preferred_schedule}</span> : null}
        {r.apply_deadline ? <span className="instructor-card__tag">応募締切：{deadlineShort(r.apply_deadline)}</span> : null}
      </div>
      {lines.length > 0 && (
        <div className="request-card__response" style={{ margin: "0 0 14px", fontSize: 13 }}>
          <strong>費用・支払い</strong>
          {lines.join("　／　")}
        </div>
      )}
      <DetailsView r={r} />
    </>
  );
}

function NotFoundBlock() {
  return (
    <div className="empty-state" style={{ paddingTop: 80 }}>
      <p className="empty-state__title">依頼が見つかりませんでした</p>
      <p className="empty-state__desc">削除されたか、公募が終了している可能性があります。</p>
      <p className="empty-state__desc">公開範囲が限られている依頼（登録講師限定・招待限定）は、対象の講師にだけ表示されます。</p>
      <Link href="/open-requests" className="btn btn--primary" style={{ marginTop: 16 }}>
        一覧に戻る
      </Link>
    </div>
  );
}

function displayStatus(r: TrainingRequestRow, myResponse: InstructorResponseRow | null) {
  if (r.status === "completed") return { key: "completed", label: "完了" };
  if (r.status === "accepted") {
    return myResponse?.is_selected ? { key: "selected", label: "あなたに決定" } : { key: "not-selected", label: "応募終了" };
  }
  if (myResponse) {
    if (myResponse.action === "reject" || myResponse.action === "withdrawn") return { key: "rejected", label: myResponse.action === "withdrawn" ? "取り下げ済み" : "却下済み" };
    return { key: "quoted", label: "返信済み（依頼者の確定待ち）" };
  }
  return { key: "pending", label: "募集中" };
}
function badgeClass(key: string) {
  if (key === "quoted") return "quoted";
  if (key === "rejected" || key === "not-selected") return "rejected";
  if (key === "selected") return "accepted";
  return key;
}

function PublicDetail({ requestId, onLoginGate }: { requestId: string; onLoginGate: () => void }) {
  const [r, setR] = useState<OpenRequestPublicPreviewRow | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const { data, error } = await getOpenRequestPublicDetail(requestId);
      setR(error || !data ? null : data);
    })();
  }, [requestId]);

  if (r === undefined) return <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>;
  if (r === null) return <NotFoundBlock />;

  return (
    <>
      <Link href="/open-requests" className="breadcrumb">
        ← 一覧に戻る
      </Link>
      <div className="request-card">
        <div className="request-card__top">
          <div>
            <div className="request-card__title" style={{ fontSize: 20 }}>
              {r.title}
            </div>
            <div className="request-card__meta">
              <span>{r.requester_type === "company" ? "企業" : "生徒"}からの公募</span>
              <span>{fmtDate(r.created_at)}</span>
            </div>
          </div>
          <span className="status-badge status-badge--pending">募集中</span>
        </div>
        <Tags r={r} />
        <p className="request-card__desc" style={{ whiteSpace: "pre-wrap" }}>
          {r.description}
        </p>
        <div className="request-card__actions" style={{ marginTop: 24 }}>
          <button type="button" className="btn btn--primary" onClick={onLoginGate}>
            ログインして応募する
          </button>
        </div>
      </div>
    </>
  );
}

type ReqWithJoins = TrainingRequestRow & { instructor_responses: InstructorResponseRow[] };

function InstructorDetailView({ requestId, instructorId, focusRespond }: { requestId: string; instructorId: string; focusRespond: boolean }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [r, setR] = useState<ReqWithJoins | null | undefined>(undefined);
  const [requesterInfo, setRequesterInfo] = useState<{ name?: string; email?: string; phone?: string | null; company_name?: string | null } | null>(null);
  const [quotePrice, setQuotePrice] = useState("");
  const [apply, setApply] = useState<ApplyValue>(EMPTY_APPLY);
  const [quoteTax, setQuoteTax] = useState<"" | "included" | "excluded">("");
  const [quoteMessage, setQuoteMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  async function load() {
    const { data, error } = await getTrainingRequestDetail(requestId);
    if (error || !data) {
      setR(null);
      return;
    }
    const row = data as unknown as ReqWithJoins;
    setR(row);

    const myResponse = (row.instructor_responses || []).find((x) => x.instructor_id === instructorId) || null;
    const st = displayStatus(row, myResponse);
    if (st.key === "selected") {
      const map = await getRequesterContacts([row.requester_id]);
      setRequesterInfo(map[row.requester_id] || null);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  useEffect(() => {
    if (focusRespond && r) {
      actionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusRespond, r]);

  if (r === undefined) {
    // Show what the list already told us, so the page does not flash empty.
    let preview: { id?: string; title?: string; description?: string; requester_type?: string } | null = null;
    try {
      const raw = sessionStorage.getItem("kl_request_preview");
      preview = raw ? JSON.parse(raw) : null;
    } catch {
      preview = null;
    }
    if (preview && preview.id === requestId && preview.title) {
      return (
        <>
          <Link href="/open-requests" className="breadcrumb">
            ← 一覧に戻る
          </Link>
          <div className="request-card">
            <div className="request-card__title" style={{ fontSize: 20 }}>
              {preview.title}
            </div>
            <div className="request-card__meta">
              <span>{preview.requester_type === "company" ? "企業" : "生徒"}からの公募</span>
            </div>
            <p className="request-card__desc" style={{ whiteSpace: "pre-wrap" }}>
              {preview.description}
            </p>
            <div className="skeleton-bar" />
            <div className="skeleton-bar skeleton-bar--short" />
          </div>
        </>
      );
    }
    return (
      <div className="request-card">
        <div className="skeleton-bar" />
        <div className="skeleton-bar skeleton-bar--short" />
        <div className="skeleton-bar" />
      </div>
    );
  }
  if (r === null) return <NotFoundBlock />;

  const myResponse = (r.instructor_responses || []).find((x) => x.instructor_id === instructorId) || null;
  const st = displayStatus(r, myResponse);

  function hideRequest() {
    let ids: string[] = [];
    try {
      ids = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]") || [];
    } catch {
      /* ignore */
    }
    if (!ids.includes(requestId)) ids.push(requestId);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
  }

  async function respond(action: "accept" | "reject") {
    setBusy(true);
    const { error } = await submitInstructorResponse(requestId, instructorId, action);
    setBusy(false);
    if (error) {
      showToast(`エラー：${error.message}`);
      return;
    }
    flushMineNotices();
    showToast(action === "accept" ? "依頼を承諾しました。依頼者の確定操作をお待ちください。" : "この依頼を却下しました。");
    load();
  }

  // Interview step (same as the マイページ banner): agree to release the name, or decline.
  async function handleRelease() {
    if (!myResponse) return;
    const { ok } = await confirm({
      title: "氏名を公開しますか？",
      message: "面談に同意し、氏名（フルネーム）を企業に公開します。",
      confirmLabel: "情報を公開する",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await releaseInstructorName(myResponse.response_id);
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("氏名を公開しました。企業の決定をお待ちください。");
    load();
  }

  async function handleDecline() {
    if (!myResponse) return;
    const { ok } = await confirm({
      title: "面談を辞退しますか？",
      message: "この面談依頼を辞退します。",
      confirmLabel: "辞退する",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await declineInterview(myResponse.response_id);
    setBusy(false);
    if (error) return showToast(`エラー：${error.message}`);
    showToast("面談を辞退しました。");
    load();
  }

  async function submitApply() {
    const raw = quotePrice.trim();
    let price: number | null = null;
    if (raw) {
      price = Number(raw);
      if (!Number.isInteger(price) || price < 1) {
        showToast("見積り金額は1円以上の整数で入力してください");
        return;
      }
    }
    const message = quoteMessage.trim() || null;
    if (normalizeSlots(r?.role_slots).length > 0 && !apply.role.trim()) {
      showToast("希望する役割・職種を選んでください");
      return;
    }
    setBusy(true);
    const ap = applyPayload(apply);
    const { error } =
      myResponse && myResponse.action === "withdrawn"
        ? await reapplyResponse(myResponse.response_id, { price, tax: quoteTax || null, message, ...ap })
        : await submitInstructorResponse(requestId, instructorId, price ? "quote" : "accept", { quote_price: price, quote_tax_mode: quoteTax || null, message, ...ap });
    setBusy(false);
    if (error) {
      showToast(`エラー：${error.message}`);
      return;
    }
    flushMineNotices();
    setReapplying(false);
    showToast(myResponse ? "再度応募しました。依頼者の確定操作をお待ちください。" : "応募しました。依頼者の確定操作をお待ちください。");
    load();
  }

  return (
    <>
      <Link href="/open-requests" className="breadcrumb">
        ← 一覧に戻る
      </Link>
      <div className="request-card">
        <div className="request-card__top">
          <div>
            <div className="request-card__title" style={{ fontSize: 20 }}>
              {r.title}
            </div>
            <div className="request-card__meta">
              <span>
                {r.requester_type === "company" ? "企業" : "生徒"}
                {r.target_instructor_id ? "からの直接依頼" : "からの公募"}
              </span>
              <span>{fmtDate(r.created_at)}</span>
            </div>
          </div>
          <span className={`status-badge status-badge--${badgeClass(st.key)}`}>{st.label}</span>
        </div>
        <Tags r={r} />
        <p className="request-card__desc" style={{ whiteSpace: "pre-wrap" }}>
          {r.description}
        </p>

        {myResponse && (
          <div className="request-card__response" style={{ marginTop: 20 }}>
            <strong>
              あなたの対応：
              {myResponse.action === "accept" ? "承諾" : myResponse.action === "quote" ? quoteText(myResponse) : myResponse.action === "withdrawn" ? "取り下げ" : "却下"}
            </strong>
            {myResponse.message ? myResponse.message : "（メッセージなし）"}
            <MyResponseDetails response={myResponse} />
            <ResponseManage response={myResponse} request={r} onChanged={load} />
            {(myResponse.action === "accept" || myResponse.action === "quote") && (
              <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--color-ink-soft)" }}>
                <span>選考状況：{STAGE_LABEL[stageOf(myResponse, r.status === "accepted" || r.status === "completed")]}</span>
              </div>
            )}
            {myResponse.action === "withdrawn" && r.status === "pending" && !myResponse.is_selected && !reapplying && !deadlinePassed(r.apply_deadline) && (
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => setReapplying(true)}>
                  再度応募する
                </button>
              </div>
            )}
          </div>
        )}

        {myResponse?.interview_status === "requested" && r.status === "pending" && (
          <div className="contact-box" style={{ marginTop: 20 }}>
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

        {(!myResponse || reapplying) && r.status === "pending" && deadlinePassed(r.apply_deadline) && (
          <p className="request-card__desc" style={{ marginTop: 20, color: "var(--color-ink-soft)" }}>
            応募の受付は終了しました（締切：{r.apply_deadline ? deadlineShort(r.apply_deadline) : ""}）。
          </p>
        )}

        {(!myResponse || reapplying) && r.status === "pending" && !deadlinePassed(r.apply_deadline) && (
          <>
            <div className="inline-quote-form is-open" ref={actionsRef} style={{ marginTop: 24 }}>
              <div className="form-field">
                <label>
                  見積り金額（{UNIT_OPTIONS.find((o) => o.value === normalUnit(r.budget_unit))?.label}・円）<span className="field-optional">任意</span>
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="number" min={1} step={1} placeholder="例：14000" value={quotePrice} onChange={(e) => setQuotePrice(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                  <Select aria-label="税" value={quoteTax} onChange={(e) => setQuoteTax(e.target.value as "" | "included" | "excluded")} style={{ flex: "0 0 120px" }}>
                    <option value="">税の指定なし</option>
                    <option value="included">税込</option>
                    <option value="excluded">税別</option>
                  </Select>
                </div>
              </div>
              <ApplyFields value={apply} onChange={setApply} roleOptions={normalizeSlots(r.role_slots).map((x) => x.name)} />
              <div className="form-field">
                <label>
                  メッセージ<span className="field-optional">任意</span>
                </label>
                <textarea rows={2} placeholder="補足があればご記入ください" value={quoteMessage} onChange={(e) => setQuoteMessage(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={submitApply}>
                  {myResponse ? "再度応募する" : "応募する"}
                </button>
                {myResponse && (
                  <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setReapplying(false)}>
                    やめる
                  </button>
                )}
              </div>
            </div>
            {!myResponse && (
            <div className="request-card__actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => respond("reject")}>
                興味なし（却下）
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  hideRequest();
                  showToast("この依頼を非表示にしました。");
                  setTimeout(() => {
                    router.push("/open-requests");
                  }, 700);
                }}
              >
                この依頼を非表示にする
              </button>
            </div>
            )}
          </>
        )}

        {st.key === "selected" && (
          <>
            <div className="contact-box" style={{ marginTop: 20 }}>
              <strong>連絡先：</strong>
              {requesterInfo ? (
                <>
                  <div>{requesterInfo.company_name ? `会社名：${requesterInfo.company_name}` : `担当者：${requesterInfo.name}`}</div>
                  <div>メール：{requesterInfo.email}</div>
                  <div>電話番号：{requesterInfo.phone || "未登録"}</div>
                </>
              ) : (
                "読み込み中…"
              )}
            </div>
            <p className="request-card__desc" style={{ color: "var(--color-ink-soft)", marginTop: 12 }}>
              この依頼はあなたに決定しました。注文書・請求書などの進捗は、マイページの「受け取った依頼」から確認できます。
            </p>
          </>
        )}
      </div>
    </>
  );
}

function OwnerDetailView({ requestId, userId }: { requestId: string; userId: string }) {
  const [r, setR] = useState<(TrainingRequestRow & { instructor_responses: InstructorResponseRow[] }) | null | undefined>(undefined);
  const [notOwner, setNotOwner] = useState(false);
  const [matched, setMatched] = useState<{ ins: InstructorPublicDirectoryRow; reasons: string[] }[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await getTrainingRequestWithResponses(requestId);
      if (error || !data) {
        setR(null);
        return;
      }
      const row = data as unknown as TrainingRequestRow & { instructor_responses: InstructorResponseRow[] };
      if (row.requester_id !== userId) {
        setNotOwner(true);
        return;
      }
      setR(row);

      const { data: instructors, error: insError } = await getMatchingCandidateInstructors();
      if (insError || !instructors) {
        setMatched([]);
        return;
      }
      let expertiseMatchIds = new Set<string>();
      if (row.expertise_field) {
        expertiseMatchIds = await getInstructorExpertiseInstructorIds(row.expertise_field);
      }
      function reasonsFor(ins: InstructorPublicDirectoryRow) {
        const reasons: string[] = [];
        if (expertiseMatchIds.has(ins.id)) reasons.push("分野");
        const formatOk =
          row.preferred_format === "both" ||
          (row.preferred_format === "online" && (ins.work_style === "ONLINE" || ins.work_style === "HYBRID")) ||
          (row.preferred_format === "offline" && (ins.work_style === "ONSITE" || ins.work_style === "HYBRID"));
        if (formatOk) reasons.push("形態");
        if (isHourly(row) && row.budget != null && ins.desired_rate_min != null && ins.desired_rate_min <= row.budget) reasons.push("予算");
        return reasons;
      }
      // おすすめ = 専門分野が合う講師だけ。形態・予算だけ合う講師は「参考候補」(#60).
      function isRecommended(reasons: string[]) {
        return reasons.includes("分野");
      }
      const shown = await withSurveySummary(await withMineDisplay(instructors as InstructorPublicDirectoryRow[]));
      const result = shown
        .map((ins) => ({ ins, reasons: reasonsFor(ins) }))
        .filter((x) => x.reasons.length > 0)
        .sort((a, b) => {
          const strongDiff = (isRecommended(b.reasons) ? 1 : 0) - (isRecommended(a.reasons) ? 1 : 0);
          if (strongDiff !== 0) return strongDiff;
          return b.reasons.length - a.reasons.length;
        })
        .slice(0, 6);
      setMatched(result);
    })();
  }, [requestId, userId]);

  if (r === undefined && !notOwner) return <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>;
  if (r === null || notOwner) {
    return (
      <div className="empty-state" style={{ paddingTop: 80 }}>
        <p className="empty-state__title">{notOwner ? "この依頼は表示できません" : "依頼が見つかりませんでした"}</p>
        <p className="empty-state__desc">
          {notOwner
            ? "この依頼は、依頼を作成した企業・個人のアカウントでのみ詳細を確認できます。"
            : "削除されたか、リンクが正しくない可能性があります。"}
        </p>
        <Link href="/mypage" className="btn btn--primary" style={{ marginTop: 16 }}>
          マイページに戻る
        </Link>
      </div>
    );
  }

  if (!r) return null;

  return (
    <>
      <Link href="/mypage" className="breadcrumb">
        ← マイページに戻る
      </Link>
      <div className="request-card">
        <div className="request-card__top">
          <div>
            <div className="request-card__title" style={{ fontSize: 20 }}>
              {r.title}
            </div>
            <div className="request-card__meta">
              <span>{fmtDate(r.created_at)}</span>
              {r.publish_state === "paused" && <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: "#eceff1", color: "#546e7a" }}>公開停止中</span>}
              {r.publish_state === "draft" && <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: "#eceff1", color: "#546e7a" }}>下書き</span>}
            </div>
          </div>
        </div>
        <Tags r={r} />
        <p className="request-card__desc" style={{ whiteSpace: "pre-wrap" }}>
          {r.description}
        </p>
        <p className="request-card__desc" style={{ color: "var(--color-ink-soft)" }}>
          応募件数：{(r.instructor_responses || []).length}件
        </p>
      </div>

      <div style={{ marginTop: 28 }}>
        <h2 className="section__title" style={{ fontSize: 16 }}>
          この依頼に合いそうな講師
        </h2>
        <div style={{ marginTop: 12 }}>
          {matched === null && <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>}
          {matched?.length === 0 && <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>現在、条件に合う講師が見つかりませんでした。</p>}
          {matched?.map(({ ins, reasons }) => {
            const isRecommended = reasons.includes("分野");
            return (
              <Link href={`/instructor-detail?id=${ins.id}`} key={ins.id} style={{ display: "block", marginBottom: 10 }}>
                <div className="request-card">
                  <div className="request-card__top">
                    <div>
                      <div className="request-card__title">{ins.name || "（名前未設定）"}</div>
                      <div className="request-card__meta">
                        <span>{(ins.prefectures || []).join("、") || "エリア未設定"}</span>
                      </div>
                    </div>
                    {ins.survey_count && ins.survey_avg != null ? (
                      <span className="status-badge status-badge--accepted">
                        <span style={{ color: "#f2b84b" }}>★</span> {surveyScoreLabel(ins.survey_avg, ins.survey_count)}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={`notice-banner${isRecommended ? " is-visible" : ""}`}
                    style={{ margin: "8px 0", fontSize: 12, ...(isRecommended ? {} : { opacity: 0.65, background: "var(--color-bg)" }) }}
                  >
                    {isRecommended ? `おすすめ：${reasons.join("・")}が合致` : `参考候補（分野は未一致）：${reasons.join("・")}が合致`}
                  </div>
                  <p className="request-card__desc">{ins.self_pr || "自己紹介は未登録です。"}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

function RequestDetailInner() {
  const searchParams = useSearchParams();
  const { authReady, user } = useAuth();
  useRoleTheme("instructor");

  const requestId = searchParams.get("id");
  const focusRespond = searchParams.get("focus") === "respond";
  const [loginGateOpen, setLoginGateOpen] = useState(false);

  if (!requestId) {
    return (
      <main className="detail-page" style={{ maxWidth: 760 }}>
        <NotFoundBlock />
      </main>
    );
  }

  return (
    <main className="detail-page" style={{ maxWidth: 760 }}>
      {!authReady ? (
        <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>
      ) : !user ? (
        <PublicDetail requestId={requestId} onLoginGate={() => setLoginGateOpen(true)} />
      ) : user.role === "INSTRUCTOR" ? (
        <InstructorDetailView requestId={requestId} instructorId={user.id} focusRespond={focusRespond} />
      ) : (
        <OwnerDetailView requestId={requestId} userId={user.id} />
      )}

      <div className={`modal-overlay${loginGateOpen ? " is-open" : ""}`} onClick={(e) => e.target === e.currentTarget && setLoginGateOpen(false)}>
        <div className="modal-box" style={{ maxWidth: 420, textAlign: "center" }}>
          <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setLoginGateOpen(false)}>
            ×
          </button>
          <span className="hanko hanko--logo login-gate__icon" style={{ margin: "0 auto 16px" }}>
            研
          </span>
          <p className="modal-title">ログインが必要です</p>
          <p className="modal-desc">依頼に応募するには、講師アカウントでログインしてください。</p>
          <div className="form-actions" style={{ flexDirection: "column" }}>
            <Link href="/login" className="btn btn--primary btn--block">
              ログイン
            </Link>
            <Link href="/register" className="btn btn--ghost btn--block">
              新規登録
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function RequestDetailPage() {
  return (
    <Suspense fallback={<main className="detail-page" style={{ maxWidth: 760 }} />}>
      <RequestDetailInner />
    </Suspense>
  );
}
