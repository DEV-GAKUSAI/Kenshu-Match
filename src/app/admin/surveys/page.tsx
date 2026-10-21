"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { SurveyImportPanel } from "@/components/survey/SurveyImportPanel";

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

  const load = useCallback(async () => {
    const { data: s } = await supabase.from("training_surveys").select("*").order("created_at", { ascending: false });
    const list = (s as Survey[] | null) ?? [];
    setSurveys(list);
    const ids = list.map((x) => x.survey_id);
    if (ids.length) {
      const { data: a } = await supabase.from("training_survey_answers").select("*").in("survey_id", ids).order("created_at", { ascending: false });
      setAnswers((a as Answer[] | null) ?? []);
      const { data: l } = await supabase.from("training_survey_links").select("survey_id").in("survey_id", ids);
      const counts: Record<string, number> = {};
      ((l as { survey_id: string }[] | null) ?? []).forEach((row) => (counts[row.survey_id] = (counts[row.survey_id] ?? 0) + 1));
      setLinkCounts(counts);
      const { data: t } = await supabase.from("training_requests").select("request_id, title").in("request_id", list.map((x) => x.request_id).filter((x): x is string => !!x));
      setTitles(Object.fromEntries(((t as { request_id: string; title: string }[] | null) ?? []).map((row) => [row.request_id, row.title])));
    }
    const { data: pt } = await supabase.from("past_trainings").select("past_training_id, title, held_on, instructor_id").order("created_at", { ascending: false });
    setPastList((pt as { past_training_id: string; title: string; held_on: string; instructor_id: string }[] | null) ?? []);
    const { data: ip } = await supabase.from("instructor_profiles").select("id").limit(500);
    const ids2 = ((ip as { id: string }[] | null) ?? []).map((row) => row.id);
    const { data: us } = ids2.length ? await supabase.from("users").select("id, name").in("id", ids2) : { data: [] };
    setInstructors(
      ((us as { id: string; name: string | null }[] | null) ?? [])
        .map((row) => ({ id: row.id, name: row.name || row.id }))
        .sort((x, y) => x.name.localeCompare(y.name, "ja")),
    );
    const { data: c } = await supabase
      .from("training_requests")
      .select("request_id, title, status")
      .in("status", ["accepted", "completed"])
      .order("created_at", { ascending: false })
      .limit(300);
    setCandidates((c as { request_id: string; title: string; status: string }[] | null) ?? []);
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

  if (!authReady) return null;
  if (!user || user.role !== "ADMIN") return null;

  return (
    <main className="mypage">
      <div className="mypage__head">
        <h1 className="mypage__title">研修アンケート管理</h1>
        <p className="mypage__role">
          <Link href="/admin">← 管理者ダッシュボード</Link>
        </p>
      </div>

      <div className="request-card">
        <div className="request-card__title">アンケート結果を取り込む</div>
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
            <select value={pickedRequest} onChange={(e) => setPickedRequest(e.target.value)} style={{ maxWidth: "100%", marginBottom: 10 }}>
              <option value="">依頼を選ぶ</option>
              {candidates.map((c) => (
                <option key={c.request_id} value={c.request_id}>
                  {c.title}（{c.status === "completed" ? "完了" : "承諾済み"}）
                </option>
              ))}
            </select>
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
                <select value={pf.instructor} onChange={(e) => setPf({ ...pf, instructor: e.target.value })}>
                  <option value="">講師を選ぶ</option>
                  {instructors.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
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
            <select value={pickedPast} onChange={(e) => setPickedPast(e.target.value)} style={{ maxWidth: "100%", marginBottom: 10 }}>
              <option value="">選ぶ</option>
              {pastList.map((p) => (
                <option key={p.past_training_id} value={p.past_training_id}>
                  {p.title}（{p.held_on}）
                </option>
              ))}
            </select>
            {pickedPast && <SurveyImportPanel key={pickedPast} pastTrainingId={pickedPast} onChanged={() => void load()} />}
          </>
        )}
      </div>

      {!loaded && <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>}
      {loaded && surveys.length === 0 && (
        <div className="empty-state">
          <p className="empty-state__title">アンケートはまだありません</p>
        </div>
      )}

      {surveys.map((s) => {
        const mine = answers.filter((a) => a.survey_id === s.survey_id);
        const reported = mine.filter((a) => a.reported_at && !a.is_hidden).length;
        return (
          <div key={s.survey_id} className="request-card">
            <div className="request-card__top">
              <div>
                <div className="request-card__title">{s.past_training_id ? `【過去の研修】${pastList.find((p) => p.past_training_id === s.past_training_id)?.title ?? ""}` : titles[s.request_id ?? ""] || s.request_id}</div>
                <div className="request-card__meta">
                  <span>リンク {linkCounts[s.survey_id] ?? 0} / 上限 {s.max_links}</span>
                  <span>回答 {mine.length}{mine.some((a) => a.source === "import") ? `（取込 ${mine.filter((a) => a.source === "import").length}）` : ""}</span>
                  {s.closed_at && <span>受付終了</span>}
                </div>
              </div>
              {reported > 0 && <span className="status-badge status-badge--rejected">報告 {reported}</span>}
            </div>

            {!s.past_training_id && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "10px 0" }}>
              <input
                type="number"
                min={0}
                placeholder="新しい上限"
                value={capInput[s.survey_id] ?? ""}
                onChange={(e) => setCapInput((prev) => ({ ...prev, [s.survey_id]: e.target.value }))}
                style={{ maxWidth: 140 }}
              />
              <button type="button" className="btn btn--primary btn--sm" onClick={() => saveCap(s.survey_id)}>
                上限を変更する
              </button>
            </div>
            )}

            {mine.map((a) => (
              <div key={a.answer_id} className="review-item" style={a.is_hidden ? { opacity: 0.55 } : undefined}>
                <div className="review-item__top">
                  <span className="review-item__name">
                    {a.role === "HIRER" ? "依頼企業" : "参加者"}
                    {a.display_name ? `（${a.display_name}）` : ""}
                    {a.is_hidden && "　非表示"}
                  </span>
                  <span className="review-item__rating">
                    {a.q1}・{a.q2}・{a.q3}・{a.q4}・{a.q5}
                  </span>
                </div>
                {a.comment && <p className="review-item__comment">{a.comment}</p>}
                {a.reported_at && (
                  <p className="review-item__comment" style={{ color: "var(--color-danger)" }}>
                    講師からの報告：{a.reported_reason || "（理由なし）"}
                  </p>
                )}
                <div className="request-card__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHidden(a.answer_id, !a.is_hidden)}>
                    {a.is_hidden ? "表示に戻す" : "非表示にする"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </main>
  );
}
