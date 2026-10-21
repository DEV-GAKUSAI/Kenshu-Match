"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { SurveyImportPanel } from "@/components/survey/SurveyImportPanel";
import "../../mypage/mypage.css";
import { Select } from "@/components/ui/Select";

type Survey = {
  survey_id: string;
  request_id: string | null;
  past_training_id: string | null;
  instructor_id: string;
  max_links: number;
  opens_at: string | null;
  closed_at: string | null;
  created_at: string;
};
type Answer = {
  answer_id: string;
  survey_id: string;
  role: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  q5: number;
  comment: string | null;
  display_name: string | null;
  is_anonymous: boolean;
  is_hidden: boolean;
  source?: "link" | "import";
  reported_at: string | null;
  reported_reason: string | null;
  created_at: string;
};

/** 研修アンケート admin: hide an answer, raise a survey's link limit. */
export default function AdminSurveysPage() {
  const { user, authReady } = useAuth();
  const { showToast } = useToast();
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [linkCounts, setLinkCounts] = useState<Record<string, number>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [capInput, setCapInput] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<{ request_id: string; title: string; status: string }[]>([]);
  const [pickedRequest, setPickedRequest] = useState("");
  const [mode, setMode] = useState<"request" | "past">("request");
  const [pastList, setPastList] = useState<{ past_training_id: string; title: string; held_on: string; instructor_id: string }[]>([]);
  const [instructors, setInstructors] = useState<{ id: string; name: string }[]>([]);
  const [pickedPast, setPickedPast] = useState("");
  const [pf, setPf] = useState({ instructor: "", title: "", heldOn: "", company: "" });
  const [creating, setCreating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "reported" | "past">("all");
  const [query, setQuery] = useState("");
  const [shownCount, setShownCount] = useState(10);
  const [allAnswers, setAllAnswers] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    // Fetch everything first, then set the state in one go, so the page does not jump while loading.
    const { data: s } = await supabase.from("training_surveys").select("*").order("created_at", { ascending: false });
    const list = (s as Survey[] | null) ?? [];
    const ids = list.map((x) => x.survey_id);
    let answerRows: Answer[] = [];
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: a } = await supabase.from("training_survey_answers").select("*").in("survey_id", ids).order("created_at", { ascending: false });
      answerRows = (a as Answer[] | null) ?? [];
      const { data: l } = await supabase.from("training_survey_links").select("survey_id").in("survey_id", ids);
      ((l as { survey_id: string }[] | null) ?? []).forEach((row) => (counts[row.survey_id] = (counts[row.survey_id] ?? 0) + 1));
    }
    const { data: pt } = await supabase.from("past_trainings").select("past_training_id, title, held_on, instructor_id").order("created_at", { ascending: false });
    const { data: ip } = await supabase.from("instructor_profiles").select("id").limit(500);
    const ids2 = ((ip as { id: string }[] | null) ?? []).map((row) => row.id);
    const { data: us } = ids2.length ? await supabase.from("users").select("id, name").in("id", ids2) : { data: [] };
    const { data: c } = await supabase.rpc("admin_survey_requests");
    const reqs = (c as { request_id: string; title: string; status: string }[] | null) ?? [];
    setSurveys(list);
    setAnswers(answerRows);
    setLinkCounts(counts);
    setPastList((pt as { past_training_id: string; title: string; held_on: string; instructor_id: string }[] | null) ?? []);
    setInstructors(
      ((us as { id: string; name: string | null }[] | null) ?? [])
        .map((row) => ({ id: row.id, name: row.name || row.id }))
        .sort((x, y) => x.name.localeCompare(y.name, "ja")),
    );
    setCandidates(reqs);
    // titles of the surveys (the admin cannot read the requests table directly)
    setTitles(Object.fromEntries(reqs.map((row) => [row.request_id, row.title])));
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    if (authReady && user?.role === "ADMIN") void load();
  }, [authReady, user, load]);

  async function setHidden(answerId: string, hidden: boolean) {
    const { error } = await supabase.rpc("admin_set_survey_answer_hidden", { p_answer_id: answerId, p_hidden: hidden });
    if (error) return showToast("処理できませんでした。");
    await load();
  }

  async function createPast() {
    if (!pf.instructor || !pf.title.trim() || !pf.heldOn) return showToast("講師・研修名・実施日を入力してください。");
    setCreating(true);
    const { data, error } = await supabase.rpc("admin_create_past_training", {
      p_instructor_id: pf.instructor,
      p_title: pf.title,
      p_held_on: pf.heldOn,
      p_company_name: pf.company || null,
    });
    setCreating(false);
    if (error) {
      const m = error.message;
      return showToast(m.includes("bad_date") ? "実施日は今日以前の日付にしてください。" : m.includes("bad_title") ? "研修名は1〜120文字で入力してください。" : "登録できませんでした。");
    }
    showToast("過去の研修を登録しました。続けて結果を取り込めます。");
    setPf({ instructor: "", title: "", heldOn: "", company: "" });
    await load();
    setPickedPast(data as string);
  }

  async function saveCap(surveyId: string) {
    const n = Number(capInput[surveyId]);
    if (!Number.isInteger(n) || n < 0) return showToast("0以上の整数を入力してください。");
    const { error } = await supabase.rpc("admin_set_survey_link_cap", { p_survey_id: surveyId, p_max_links: n });
    if (error) return showToast("処理できませんでした。");
    showToast("上限を変更しました。");
    setCapInput((prev) => ({ ...prev, [surveyId]: "" }));
    await load();
  }

  const rows = surveys.map((s) => {
    const mine = answers.filter((a) => a.survey_id === s.survey_id);
    const title = s.past_training_id
      ? `【過去の研修】${pastList.find((p) => p.past_training_id === s.past_training_id)?.title ?? ""}`
      : titles[s.request_id ?? ""] || s.request_id || "";
    return {
      s,
      mine,
      title,
      reported: mine.filter((a) => a.reported_at && !a.is_hidden).length,
      instructorName: instructors.find((i) => i.id === s.instructor_id)?.name ?? "",
    };
  });
  const q = query.trim().toLowerCase();
  const visible = rows
    .filter((r) => (filter === "reported" ? r.reported > 0 : filter === "past" ? !!r.s.past_training_id : true))
    .filter((r) => !q || r.title.toLowerCase().includes(q) || r.instructorName.toLowerCase().includes(q))
    .sort((x, y) => (y.reported > 0 ? 1 : 0) - (x.reported > 0 ? 1 : 0));

  if (!authReady) return null;
  if (!user || user.role !== "ADMIN") return null;

  return (
    <main className="list-page">
      <div className="list-page__head">
        <h1 className="list-page__title">研修アンケート管理</h1>
        <p className="list-page__count">
          {loaded ? (
            <>
              全 <strong>{surveys.length}</strong> 件・<Link href="/admin">← 管理者ダッシュボード</Link>
            </>
          ) : (
            "読み込み中…"
          )}
        </p>
      </div>

      <div className="request-card" style={loaded ? undefined : { display: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div className="request-card__title">アンケート結果を取り込む</div>
          <button type="button" className={`btn btn--sm ${importOpen ? "btn--ghost" : "btn--primary"}`} onClick={() => setImportOpen((v) => !v)}>
            {importOpen ? "閉じる" : "結果を取り込む"}
          </button>
        </div>
        {importOpen && (<>
        <div style={{ display: "flex", gap: 8, margin: "8px 0 12px" }}>
          <button type="button" className={`btn btn--sm ${mode === "request" ? "btn--primary" : "btn--ghost"}`} onClick={() => setMode("request")}>
            依頼を選ぶ
          </button>
          <button type="button" className={`btn btn--sm ${mode === "past" ? "btn--primary" : "btn--ghost"}`} onClick={() => setMode("past")}>
            過去の研修
          </button>
        </div>

        {mode === "request" && (
          <>
            <p className="request-card__meta" style={{ margin: "0 0 10px" }}>承諾済み・完了の依頼を選んで、Excel／CSVの結果を取り込みます（研修の初日前でも可）。</p>
            <Select value={pickedRequest} onChange={(e) => setPickedRequest(e.target.value)} style={{ maxWidth: "100%", marginBottom: 10 }}>
              <option value="">依頼を選ぶ</option>
              {candidates.map((c) => (
                <option key={c.request_id} value={c.request_id}>
                  {c.title}（{c.status === "completed" ? "完了" : "承諾済み"}）
                </option>
              ))}
            </Select>
            {pickedRequest && <SurveyImportPanel key={pickedRequest} requestId={pickedRequest} onChanged={() => void load()} />}
          </>
        )}

        {mode === "past" && (
          <>
            <p className="request-card__meta" style={{ margin: "0 0 10px" }}>Kenshu Link に無かった過去の研修を登録して、その結果を取り込みます。結果は講師の評価に反映されます。</p>
            <div className="request-card__response" style={{ margin: "0 0 12px" }}>
              <strong>過去の研修を新しく登録する</strong>
              <div className="form-field">
                <label>講師</label>
                <Select value={pf.instructor} onChange={(e) => setPf({ ...pf, instructor: e.target.value })}>
                  <option value="">講師を選ぶ</option>
                  {instructors.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="form-field">
                <label>研修名</label>
                <input type="text" maxLength={120} value={pf.title} onChange={(e) => setPf({ ...pf, title: e.target.value })} />
              </div>
              <div className="form-field">
                <label>実施日</label>
                <input type="date" max={new Date().toISOString().slice(0, 10)} value={pf.heldOn} onChange={(e) => setPf({ ...pf, heldOn: e.target.value })} />
              </div>
              <div className="form-field">
                <label>会社名（任意）</label>
                <input type="text" maxLength={80} value={pf.company} onChange={(e) => setPf({ ...pf, company: e.target.value })} />
              </div>
              <button type="button" className="btn btn--primary btn--sm" disabled={creating} onClick={createPast}>
                登録する
              </button>
            </div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>登録済みの過去の研修</label>
            <Select value={pickedPast} onChange={(e) => setPickedPast(e.target.value)} style={{ maxWidth: "100%", marginBottom: 10 }}>
              <option value="">選ぶ</option>
              {pastList.map((p) => (
                <option key={p.past_training_id} value={p.past_training_id}>
                  {p.title}（{p.held_on}）
                </option>
              ))}
            </Select>
            {pickedPast && <SurveyImportPanel key={pickedPast} pastTrainingId={pickedPast} onChanged={() => void load()} />}
          </>
        )}
        </>)}
      </div>

      {loaded && surveys.length === 0 && (
        <div className="empty-state">
          <p className="empty-state__title">アンケートはまだありません</p>
        </div>
      )}

      {loaded && surveys.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "4px 0 12px" }}>
            <input
              type="search"
              placeholder="研修名・講師名で探す"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShownCount(10);
              }}
              style={{ flex: "1 1 200px", minWidth: 0 }}
            />
            {([["all", "すべて"], ["reported", `報告あり（${rows.filter((r) => r.reported > 0).length}）`], ["past", "過去の研修"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`btn btn--sm ${filter === k ? "btn--primary" : "btn--ghost"}`}
                onClick={() => {
                  setFilter(k);
                  setShownCount(10);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {visible.length === 0 && <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>該当するアンケートはありません。</p>}
        </>
      )}

      {visible.slice(0, shownCount).map((r) => {
        const s = r.s;
        const mine = r.mine;
        const isOpen = openId === s.survey_id;
        const imported = mine.filter((a) => a.source === "import").length;
        const showAll = allAnswers[s.survey_id];
        const listed = showAll ? mine : mine.slice(0, 5);
        return (
          <div key={s.survey_id} className={`req-row${r.reported > 0 ? " req-row--attn" : ""}${isOpen ? " is-open" : ""}`}>
            <button type="button" className="req-row__head" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : s.survey_id)}>
              <span className="req-row__main">
                <span className="req-row__line1">
                  {r.reported > 0 && <span className="req-row__dot" aria-label="報告あり" />}
                  <span className="req-row__title">{r.title}</span>
                </span>
                <span className="req-row__line2">
                  {r.instructorName ? `${r.instructorName} ・ ` : ""}回答 {mine.length}
                  {imported > 0 ? `（取込 ${imported}）` : ""} ・ リンク {linkCounts[s.survey_id] ?? 0}
                  {s.closed_at ? " ・ 受付終了" : ""}
                </span>
              </span>
              {r.reported > 0 && <span className="req-badge req-badge--attn">報告 {r.reported}</span>}
              {s.past_training_id && <span className="req-badge req-badge--completed">過去の研修</span>}
              <svg className="req-row__chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isOpen && (
              <div className="req-row__body">
                {!s.past_training_id && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0" }}>
                    <span style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>リンク上限 {s.max_links}</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="新しい上限"
                      value={capInput[s.survey_id] ?? ""}
                      onChange={(e) => setCapInput((prev) => ({ ...prev, [s.survey_id]: e.target.value }))}
                      style={{ maxWidth: 120 }}
                    />
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => saveCap(s.survey_id)}>
                      上限を変更する
                    </button>
                  </div>
                )}

                {mine.length === 0 && <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: "12px 0 0" }}>回答はまだありません。</p>}
                {listed.map((a) => (
                  <div key={a.answer_id} className="review-item" style={a.is_hidden ? { opacity: 0.55 } : undefined}>
                    <div className="review-item__top">
                      <span className="review-item__name">
                        {a.role === "HIRER" ? "依頼企業" : "参加者"}
                        {a.display_name ? `（${a.display_name}）` : ""}
                        {a.is_hidden && "　非表示"}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="review-item__rating">
                          {a.q1}・{a.q2}・{a.q3}・{a.q4}・{a.q5}
                        </span>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHidden(a.answer_id, !a.is_hidden)}>
                          {a.is_hidden ? "表示に戻す" : "非表示にする"}
                        </button>
                      </span>
                    </div>
                    {a.comment && <p className="review-item__comment">{a.comment}</p>}
                    {a.reported_at && (
                      <p className="review-item__comment" style={{ color: "var(--color-danger)" }}>
                        講師からの報告：{a.reported_reason || "（理由なし）"}
                      </p>
                    )}
                  </div>
                ))}
                {mine.length > 5 && (
                  <div className="req-more">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAllAnswers((prev) => ({ ...prev, [s.survey_id]: !showAll }))}>
                      {showAll ? "回答を閉じる" : `すべて見る（あと${mine.length - 5}件）`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {visible.length > shownCount && (
        <div className="req-more">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShownCount((n) => n + 10)}>
            もっと見る（あと{visible.length - shownCount}件）
          </button>
        </div>
      )}
    </main>
  );
}
