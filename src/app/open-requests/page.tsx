"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useRoleTheme } from "@/hooks/useRoleTheme";
import { ResponseManage } from "@/components/requests/ResponseManage";
import { budgetText, isHourly, quoteText } from "@/lib/requests/money";
import { requestFormatLabel } from "@/lib/requests/schedule";
import { getOpenRequestsPublicPreview, getOpenRequestsForInstructor } from "@/lib/requests/training-requests";
import { markResultsSeenByInstructor, submitInstructorResponse } from "@/lib/requests/instructor-responses";
import { useToast } from "@/components/common/Toast";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { flushMineNotices } from "@/lib/mine/flush-client";
import { getMyMatchingProfile } from "@/lib/instructor/profile";
import { getTrainingSubcategoryOptions } from "@/lib/instructor/expertise";
import type { DetailOption } from "@/lib/requests/detail-options";
import { loadDetailOptions } from "@/lib/requests/detail-options-load";
import { getRequesterContacts } from "@/lib/requester/profile";
import type { OpenRequestPublicPreviewRow, TrainingRequestRow, InstructorResponseRow } from "@/types/database";
import { Select } from "@/components/ui/Select";
import { normalizeSlots, slotsSummary } from "@/lib/requests/roles";
import { deadlinePassed, deadlineShort } from "@/lib/requests/deadline";

const HIDDEN_KEY = "kenshulink_hidden_open_requests";

type RequestWithJoins = TrainingRequestRow & {
  instructor_responses: InstructorResponseRow[];
  myResponse: InstructorResponseRow | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function ageLabel(iso: string | null) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "今日";
  if (days < 30) return `${days}日前`;
  return fmtDate(iso);
}
function isNew(iso: string | null) {
  return !!iso && Date.now() - new Date(iso).getTime() < 3 * 86400000;
}

function getHiddenIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]") || [];
  } catch {
    return [];
  }
}

function matchReasons(
  r: RequestWithJoins,
  myProfile: { workStyle: string | null; desiredRateMin: number | null; expertiseIds: Set<string> } | null
) {
  if (!myProfile) return [];
  const reasons: string[] = [];
  if (r.expertise_field && myProfile.expertiseIds.has(r.expertise_field)) reasons.push("分野");
  const formatOk =
    r.preferred_format === "both" ||
    (r.preferred_format === "online" && (myProfile.workStyle === "ONLINE" || myProfile.workStyle === "HYBRID")) ||
    (r.preferred_format === "offline" && (myProfile.workStyle === "ONSITE" || myProfile.workStyle === "HYBRID"));
  if (formatOk) reasons.push("形態");
  if (isHourly(r) && r.budget != null && myProfile.desiredRateMin != null && r.budget >= myProfile.desiredRateMin) reasons.push("予算");
  return reasons;
}
// おすすめ = 専門分野が合う案件だけ。形態・予算だけ合う案件は「参考」(#60).
function isRecommended(reasons: string[]) {
  return reasons.includes("分野");
}

function displayStatus(r: RequestWithJoins) {
  if (r.status === "completed") return { key: "completed", label: "完了" };
  if (r.status === "accepted") {
    return r.myResponse?.is_selected ? { key: "selected", label: "あなたに決定" } : { key: "not-selected", label: "応募終了" };
  }
  if (r.myResponse) {
    if (r.myResponse.action === "reject" || r.myResponse.action === "withdrawn") return { key: "rejected", label: r.myResponse.action === "withdrawn" ? "取り下げ済み" : "却下済み" };
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

function PublicPreviewList() {
  const [requests, setRequests] = useState<OpenRequestPublicPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await getOpenRequestsPublicPreview();
      if (error) {
        setError(error.message);
        return;
      }
      setRequests(data || []);
    })();
  }, []);

  return (
    <>
      <div className="mypage__head">
        <h1 className="mypage__title">公募中の依頼</h1>
        <p className="mypage__role">企業・個人から寄せられている依頼の一覧です（詳細の閲覧・応募には講師アカウントでのログインが必要です）</p>
      </div>
      {error && <p style={{ color: "var(--color-danger)", fontSize: 13 }}>読み込みエラー：{error}</p>}
      {!error && !requests && <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>}
      {!error && requests && requests.length === 0 && (
        <div className="empty-state">
          <p className="empty-state__title">現在、公募中の依頼はありません</p>
        </div>
      )}
      {requests?.map((r) => (
        <div key={r.request_id} className="request-card">
          <div className="request-card__top">
            <div>
              <div className="request-card__title">{r.title}</div>
              <div className="request-card__meta">
                <span>{r.requester_type === "company" ? "企業" : "生徒"}からの公募</span>
                <span>{fmtDate(r.created_at)}</span>
              </div>
            </div>
            <span className="status-badge status-badge--pending">募集中</span>
          </div>
          <p className="request-card__desc">{r.description}</p>
          <div className="request-card__tags">
            <span className="instructor-card__tag">{requestFormatLabel(r)}</span>
            {budgetText(r) ? <span className="instructor-card__tag">{budgetText(r)}</span> : null}
            {r.location ? <span className="instructor-card__tag">{r.location}</span> : null}
          </div>
          <div className="request-card__actions">
            <Link href={`/request-detail?id=${r.request_id}`} className="btn btn--primary btn--sm">
              詳細を見る
            </Link>
          </div>
        </div>
      ))}
    </>
  );
}

export default function OpenRequestsPage() {
  const { authReady, user } = useAuth();
  useRoleTheme("instructor");
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [reloadKey, setReloadKey] = useState(0);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [undoHide, setUndoHide] = useState<{ id: string; title: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [allRequests, setAllRequests] = useState<RequestWithJoins[]>([]);
  const [requesterMap, setRequesterMap] = useState<
    Record<string, { name?: string; email?: string; phone?: string | null; company_name?: string | null }>
  >({});
  const [myProfile, setMyProfile] = useState<{ workStyle: string | null; desiredRateMin: number | null; expertiseIds: Set<string> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<"recommended" | "open" | "mine">("recommended");
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  // 検索・絞り込み (#61)
  const [q, setQ] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [fField, setFField] = useState("");
  const [fArea, setFArea] = useState("");
  const [fFormat, setFFormat] = useState("");
  const [fRate, setFRate] = useState("");
  const [fAudience, setFAudience] = useState("");
  const [fTool, setFTool] = useState("");
  const [detailOptions, setDetailOptions] = useState<DetailOption[]>([]);
  const [fieldOptions, setFieldOptions] = useState<{ id: string; name: string; categoryName: string }[]>([]);

  useEffect(() => {
    if (!authReady) return;
    if (!user || user.role !== "INSTRUCTOR") {
      return;
    }
    (async () => {
      setHiddenIds(getHiddenIds());

      const profile = await getMyMatchingProfile(user.id);
      setMyProfile(profile);
      loadDetailOptions().then(setDetailOptions);
      const { data: subs } = await getTrainingSubcategoryOptions();
      setFieldOptions(
        ((subs as unknown as { id: string; name: string; training_categories: { name: string } | null }[] | null) ?? []).map((x) => ({
          id: x.id,
          name: x.name,
          categoryName: x.training_categories?.name || "",
        })),
      );

      const { data, error } = await getOpenRequestsForInstructor();
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const rows = (data || []) as unknown as (TrainingRequestRow & {
        instructor_responses: InstructorResponseRow[];
      })[];
      const withResponses: RequestWithJoins[] = rows.map((r) => ({
        ...r,
        myResponse: (r.instructor_responses || []).find((x) => x.instructor_id === user.id) || null,
      }));
      setAllRequests(withResponses);

      const notSelectedResponseIds = withResponses
        .filter((r) => r.status === "accepted" && r.myResponse && !r.myResponse.is_selected)
        .map((r) => r.myResponse!.response_id);
      await markResultsSeenByInstructor(notSelectedResponseIds);

      const selectedRequesterIds = withResponses
        .filter((r) => r.status === "accepted" && r.myResponse?.is_selected)
        .map((r) => r.requester_id);
      if (selectedRequesterIds.length) {
        setRequesterMap(await getRequesterContacts(selectedRequesterIds));
      }

      setLoading(false);
    })();
  }, [authReady, user, reloadKey]);

  function saveHidden(ids: string[]) {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
    setHiddenIds(ids);
  }

  function hideOne(id: string, title: string) {
    saveHidden(Array.from(new Set([...getHiddenIds(), id])));
    setUndoHide({ id, title });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoHide(null), 7000);
  }

  function undoHideNow() {
    if (!undoHide) return;
    saveHidden(getHiddenIds().filter((x) => x !== undoHide.id));
    setUndoHide(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }

  async function quickApply(r: RequestWithJoins) {
    if (!user) return;
    if (deadlinePassed(r.apply_deadline)) {
      showToast("応募の締切を過ぎています。");
      return;
    }
    // A request with roles needs a role choice, which only the detail page asks for.
    if (normalizeSlots(r.role_slots).length > 0) {
      window.location.assign(`/request-detail?id=${r.request_id}`);
      return;
    }
    const lines = [
      budgetText(r),
      r.participant_count ? `対象${r.participant_count}名` : null,
      r.preferred_schedule || null,
    ].filter(Boolean);
    const { ok } = await confirm({
      title: "この案件に応募しますか？",
      message: [r.title, ...lines].join("\n"),
      confirmLabel: "応募する",
    });
    if (!ok) return;
    // Smooth: fade the card out while saving, then move it without a full reload.
    setApplyingId(r.request_id);
    setLeavingId(r.request_id);
    const [{ error }] = await Promise.all([
      submitInstructorResponse(r.request_id, user.id, "accept"),
      new Promise((resolve) => setTimeout(resolve, 350)),
    ]);
    setApplyingId(null);
    setLeavingId(null);
    if (error) {
      showToast(`エラー：${error.message}`);
      return;
    }
    flushMineNotices();
    showToast("応募しました。依頼者の確定操作をお待ちください。");
    setAllRequests((prev) =>
      prev.map((x) =>
        x.request_id === r.request_id
          ? { ...x, myResponse: { response_id: `tmp-${r.request_id}`, request_id: r.request_id, instructor_id: user.id, action: "accept", quote_price: null, message: null, is_selected: false } as unknown as InstructorResponseRow }
          : x
      )
    );
    setReloadKey((k) => k + 1);
  }

  const counts = useMemo(() => {
    const open = allRequests.filter((r) => r.status === "pending" && !r.myResponse && !hiddenIds.includes(r.request_id));
    const mine = allRequests.filter((r) => r.myResponse);
    const recommended = open.filter((r) => matchReasons(r, myProfile).length > 0);
    return { open: open.length, mine: mine.length, recommended: recommended.length };
  }, [allRequests, hiddenIds, myProfile]);

  type Tab = "recommended" | "open" | "mine";
  function listForTab(tab: Tab) {
    if (tab === "recommended") {
      return allRequests
        .filter((r) => r.status === "pending" && !r.myResponse && !hiddenIds.includes(r.request_id) && matchReasons(r, myProfile).length > 0)
        .sort((a, b) => {
          const ra = matchReasons(a, myProfile);
          const rb = matchReasons(b, myProfile);
          const strongDiff = (isRecommended(rb) ? 1 : 0) - (isRecommended(ra) ? 1 : 0);
          if (strongDiff !== 0) return strongDiff;
          return rb.length - ra.length;
        });
    }
    if (tab === "open") {
      return allRequests.filter((r) => r.status === "pending" && !r.myResponse && !hiddenIds.includes(r.request_id));
    }
    return allRequests.filter((r) => r.myResponse);
  }

  function passesFilters(r: RequestWithJoins) {
    const kw = q.trim().toLowerCase();
    const area = fArea.trim().toLowerCase();
    const rate = Number(fRate) || 0;
    if (kw) {
      const hay = `${r.title} ${r.description} ${r.preferred_schedule ?? ""} ${r.request_id}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    if (fField && r.expertise_field !== fField) return false;
    if (area && !(r.location ?? "").toLowerCase().includes(area)) return false;
    if (fFormat && r.preferred_format !== fFormat && r.preferred_format !== "both") return false;
    if (rate && !(isHourly(r) && r.budget != null && r.budget >= rate)) return false;
    if (fAudience && !(r.detail_option_ids ?? []).includes(fAudience)) return false;
    if (fTool && !(r.detail_option_ids ?? []).includes(fTool)) return false;
    return true;
  }

  const filtered = useMemo(
    () => listForTab(currentTab).filter(passesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRequests, currentTab, hiddenIds, myProfile, q, fField, fArea, fFormat, fRate, fAudience, fTool],
  );

  // When the current tab shows nothing: how many matches the other tabs have (applied requests only show under 応募済み).
  const otherTabHits = useMemo(() => {
    const names: Record<Tab, string> = { recommended: "あなたに合う案件", open: "応募可能", mine: "応募済み" };
    return (["recommended", "open", "mine"] as Tab[])
      .filter((t) => t !== currentTab)
      .map((t) => ({ tab: t, name: names[t], n: listForTab(t).filter(passesFilters).length }))
      .filter((x) => x.n > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRequests, currentTab, hiddenIds, myProfile, q, fField, fArea, fFormat, fRate, fAudience, fTool]);

  const filterActive = !!(q.trim() || fField || fArea.trim() || fFormat || fRate || fAudience || fTool);

  if (!authReady || (user && user.role === "INSTRUCTOR" && loading)) {
    return (
      <main className="mypage">
        <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mypage">
        <PublicPreviewList />
      </main>
    );
  }

  if (user.role !== "INSTRUCTOR") {
    return (
      <main className="mypage">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <p className="empty-state__title">講師アカウントのみご利用いただけます</p>
          <p className="empty-state__desc">公募中の依頼への応募は、講師アカウントでログインした場合のみ利用できます。</p>
          <Link href="/mypage" className="btn btn--primary" style={{ marginTop: 16 }}>
            マイページに戻る
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mypage">
      <div className="mypage__head">
        <h1 className="mypage__title">公募中の依頼</h1>
        <p className="mypage__role">特定の講師を指定せずに募集されている依頼の一覧です</p>
      </div>

      <div className="status-tabs">
        {(
          [
            ["recommended", "あなたに合う案件", counts.recommended],
            ["open", "応募可能", counts.open],
            ["mine", "応募済み", counts.mine],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={`status-tab${currentTab === key ? " is-active" : ""}`}
            onClick={() => setCurrentTab(key)}
          >
            {label}
            <span className="status-tab__count">({count})</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 12px" }}>
        <input
          type="search"
          placeholder="キーワード・案件番号で探す"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: "1 1 220px", minWidth: 0 }}
        />
        <button type="button" className={`btn btn--sm ${filterOpen || filterActive ? "btn--primary" : "btn--ghost"}`} onClick={() => setFilterOpen((v) => !v)}>
          絞り込み{filterActive ? "（中）" : ""}
        </button>
      </div>
      {filterOpen && (
        <div className="request-card" style={{ marginBottom: 12 }}>
          <div className="form-row">
            <div className="form-field">
              <label>分野</label>
              <Select value={fField} onChange={(e) => setFField(e.target.value)}>
                <option value="">すべて</option>
                {[...new Set(fieldOptions.map((o) => o.categoryName))].map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {fieldOptions
                      .filter((o) => o.categoryName === cat)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
            </div>
            <div className="form-field">
              <label>形態</label>
              <Select value={fFormat} onChange={(e) => setFFormat(e.target.value)}>
                <option value="">すべて</option>
                <option value="online">オンライン</option>
                <option value="offline">対面</option>
              </Select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>地域（実施場所）</label>
              <input type="text" placeholder="例：東京" value={fArea} onChange={(e) => setFArea(e.target.value)} />
            </div>
            <div className="form-field">
              <label>時間あたり単価（円以上）</label>
              <input type="number" min={0} step={1000} placeholder="例：10000" value={fRate} onChange={(e) => setFRate(e.target.value)} />
            </div>
          </div>
          {detailOptions.length > 0 && (
            <div className="form-row">
              <div className="form-field">
                <label>対象者</label>
                <Select value={fAudience} onChange={(e) => setFAudience(e.target.value)}>
                  <option value="">すべて</option>
                  {detailOptions
                    .filter((o) => o.group_key === "audience")
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="form-field">
                <label>技術・製品・ツール</label>
                <Select value={fTool} onChange={(e) => setFTool(e.target.value)}>
                  <option value="">すべて</option>
                  {detailOptions
                    .filter((o) => o.group_key === "tool")
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </Select>
              </div>
            </div>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setQ("");
              setFAudience("");
              setFTool("");
              setFField("");
              setFArea("");
              setFFormat("");
              setFRate("");
            }}
          >
            条件をクリア
          </button>
        </div>
      )}

      {error && <p style={{ color: "var(--color-danger)", fontSize: 13 }}>読み込みエラー：{error}</p>}

      {!error && filtered.length === 0 && (
        <div className="empty-state">
          <p className="empty-state__title">
            {filterActive
              ? "条件に合う案件はありません"
              : currentTab === "recommended"
              ? "現在、あなたに合う案件はありません"
              : currentTab === "open"
                ? "現在、応募可能な公募依頼はありません"
                : "まだ応募した公募依頼はありません"}
          </p>
          {otherTabHits.length > 0 && (
            <p className="empty-state__desc">
              {otherTabHits.map((h, i) => (
                <span key={h.tab}>
                  {i > 0 ? "　" : ""}
                  <button type="button" onClick={() => setCurrentTab(h.tab)} style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "var(--color-primary)", textDecoration: "underline", cursor: "pointer" }}>
                    「{h.name}」に{h.n}件あります
                  </button>
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {filtered.map((r) => {
        const st = displayStatus(r);
        const reasons = currentTab === "recommended" ? matchReasons(r, myProfile) : [];
        const requester = requesterMap[r.requester_id];
        return (
          <div className={`request-card request-card--open${reasons.length > 0 && isRecommended(reasons) ? " is-match" : ""}${leavingId === r.request_id ? " is-leaving" : ""}`} key={r.request_id}>
            <div className="request-card__top">
              <div>
                <div className="request-card__title">
                  {r.title}
                  {isNew(r.created_at) && r.status === "pending" && !r.myResponse && <span className="new-chip">NEW</span>}
                </div>
                <div className="request-card__meta">
                  <span>{r.requester_type === "company" ? "企業" : "生徒"}からの公募</span>
                  <span title={fmtDate(r.created_at)}>{ageLabel(r.created_at)}</span>
                  <span>案件番号 {r.request_id.slice(0, 8)}</span>
                </div>
              </div>
              <span className={`status-badge status-badge--${badgeClass(st.key)}`}>{st.label}</span>
            </div>

            {reasons.length > 0 && (
              <div className={`match-banner${isRecommended(reasons) ? " is-strong" : ""}`}>
                {isRecommended(reasons) && <span className="match-banner__star">★</span>}
                <span className="match-banner__text">{isRecommended(reasons) ? "あなたにぴったりの案件です" : "参考：分野は一致していませんが、条件に一部合っています"}</span>
                <span className="match-banner__chips">
                  {reasons.map((x) => (
                    <span className="match-chip" key={x}>{x} ✓</span>
                  ))}
                </span>
              </div>
            )}

            <p className="request-card__desc request-card__desc--clamp">{r.description}</p>
            <div className="request-card__tags">
              {budgetText(r) ? <span className="open-tag open-tag--budget">{budgetText(r)}</span> : null}
              <span className="open-tag">{requestFormatLabel(r)}</span>
              {r.participant_count ? <span className="open-tag">対象{r.participant_count}名</span> : null}
              {normalizeSlots(r.role_slots).length > 0 ? <span className="open-tag">募集：{slotsSummary(normalizeSlots(r.role_slots))}</span> : null}
              {r.location ? <span className="open-tag">{r.location}</span> : null}
              {r.preferred_schedule ? <span className="open-tag">{r.preferred_schedule}</span> : null}
              {r.apply_deadline ? <span className="open-tag">{deadlinePassed(r.apply_deadline) ? "受付終了" : `応募締切：${deadlineShort(r.apply_deadline)}`}</span> : null}
            </div>

            {r.myResponse && (
              <div className="request-card__response">
                <strong>
                  あなたの対応：
                  {r.myResponse.action === "accept"
                    ? "承諾"
                    : r.myResponse.action === "quote"
                      ? quoteText(r.myResponse)
                      : r.myResponse.action === "withdrawn"
                        ? "取り下げ"
                        : "却下"}
                </strong>
                {r.myResponse.message ? r.myResponse.message : "（メッセージなし）"}
                <ResponseManage response={r.myResponse} request={r} onChanged={() => setReloadKey((k) => k + 1)} />
              </div>
            )}

            {!r.myResponse && r.status === "pending" && (
              <div className="request-card__actions">
                <button type="button" className="btn btn--primary btn--sm" disabled={applyingId === r.request_id || deadlinePassed(r.apply_deadline)} onClick={() => quickApply(r)}>
                  応募する
                </button>
                <Link
                  href={`/request-detail?id=${r.request_id}`}
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    try {
                      sessionStorage.setItem("kl_request_preview", JSON.stringify({ id: r.request_id, title: r.title, description: r.description, requester_type: r.requester_type, created_at: r.created_at }));
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  詳細を見る
                </Link>
                <button type="button" className="hide-link" onClick={() => hideOne(r.request_id, r.title)}>
                  非表示
                </button>
              </div>
            )}

            {st.key === "selected" && (
              <>
                <div className="contact-box">
                  <strong>連絡先：</strong>
                  {requester ? (
                    <>
                      <div>{requester.company_name ? `会社名：${requester.company_name}` : `担当者：${requester.name}`}</div>
                      <div>メール：{requester.email}</div>
                      <div>電話番号：{requester.phone || "未登録"}</div>
                    </>
                  ) : (
                    "読み込み中…"
                  )}
                </div>
                <p className="request-card__desc" style={{ color: "var(--color-ink-soft)" }}>
                  この依頼はあなたに決定しました。マイページの「受け取った依頼」からは表示されないため、進捗はこのページで確認してください。
                </p>
              </>
            )}
          </div>
        );
      })}
      {undoHide && (
        <div className="undo-bar" role="status">
          <span>「{undoHide.title}」を非表示にしました</span>
          <button type="button" onClick={undoHideNow}>
            元に戻す
          </button>
        </div>
      )}
    </main>
  );
}
