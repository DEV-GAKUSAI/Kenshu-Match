"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useToast } from "@/components/common/Toast";
import { createClient } from "@/lib/supabase/client";
import { ProfileSection } from "@/components/mine/ProfileSection";
import { SURVEY_QUESTIONS } from "@/lib/survey/answers";

type Summary = {
  answer_count: number;
  overall_avg: number | null;
  q1_avg: number | null;
  q2_avg: number | null;
  q3_avg: number | null;
  q4_avg: number | null;
  q5_avg: number | null;
  participant_count: number;
  participant_avg: number | null;
  hirer_count: number;
  hirer_avg: number | null;
  links_issued: number;
  imported_count?: number;
};
type Comment = {
  answer_id: string;
  role: string;
  comment: string;
  author_label: string;
  score: number;
  instructor_reply: string | null;
  created_at: string;
};

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Number(v).toFixed(1));

/** The instructor's 研修アンケート results: averages, comments, reply and report. */
export function InstructorSurveyResults({ instructorId, bare = false, replyName }: { instructorId: string; bare?: boolean; replyName?: string | null }) {
  const { showToast } = useToast();
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [form, setForm] = useState<{ id: string; mode: "reply" | "report" } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: s } = await supabase.from("instructor_survey_summary").select("*").eq("instructor_id", instructorId).maybeSingle();
    setSummary((s as Summary | null) ?? null);
    const { data: c } = await supabase
      .from("instructor_survey_comments")
      .select("answer_id, role, comment, author_label, score, instructor_reply, created_at")
      .eq("instructor_id", instructorId)
      .order("created_at", { ascending: false });
    setComments((c as Comment[] | null) ?? []);
  }, [supabase, instructorId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    if (!form) return;
    setBusy(true);
    const { error } =
      form.mode === "reply"
        ? await supabase.rpc("reply_training_survey_answer", { p_answer_id: form.id, p_reply: text })
        : await supabase.rpc("report_training_survey_answer", { p_answer_id: form.id, p_reason: text });
    setBusy(false);
    if (error) return showToast("処理できませんでした。時間をおいてもう一度お試しください。");
    showToast(form.mode === "reply" ? "返信しました。" : "運営に報告しました。");
    setForm(null);
    setText("");
    await load();
  }

  if (!summary) {
    if (bare) return <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: "0 0 16px" }}>まだ回答はありません。</p>;
    return (
      <ProfileSection title="研修アンケートの結果">
        <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: 0 }}>まだ回答はありません。</p>
      </ProfileSection>
    );
  }

  const content = (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 16 }}>
      <div className="survey-tiles">
        <div className="survey-tile survey-tile--main">
          <span className="survey-tile__label">全体</span>
          <strong>
            <span style={{ color: "#f2b84b" }}>★</span> {fmt(summary.overall_avg)}
            <small> / 4（{summary.answer_count}件）</small>
          </strong>
        </div>
        <div className="survey-tile">
          <span className="survey-tile__label">参加者</span>
          <strong>
            {fmt(summary.participant_avg)}
            <small>（{summary.participant_count}件）</small>
          </strong>
        </div>
        <div className="survey-tile">
          <span className="survey-tile__label">依頼企業</span>
          <strong>
            {fmt(summary.hirer_avg)}
            <small>（{summary.hirer_count}件）</small>
          </strong>
        </div>
        {(summary.imported_count ?? 0) > 0 && (
          <div className="survey-tile">
            <span className="survey-tile__label">取込</span>
            <strong>
              {summary.imported_count}
              <small>件</small>
            </strong>
          </div>
        )}
      </div>
      <ul className="survey-avgs">
        {SURVEY_QUESTIONS.map((q) => {
          const v = summary[`${q.key}_avg` as keyof Summary] as number | null;
          return (
            <li key={q.key}>
              <span>{q.text}</span>
              <span className="survey-avgs__bar">
                <span style={{ width: `${v ? (Number(v) / 4) * 100 : 0}%` }} />
              </span>
              <strong>{fmt(v)}</strong>
            </li>
          );
        })}
      </ul>


      {showComments && comments.map((c) => (
        <div key={c.answer_id} className="review-item">
          <div className="review-item__top">
            <span className="review-item__name">{c.author_label}</span>
            <span className="review-item__rating">{fmt(c.score)} / 4</span>
          </div>
          <p className="review-item__comment">{c.comment}</p>
          {c.instructor_reply && (
            <div className="request-card__response">
              <strong>{replyName ? `${replyName} 先生の返信` : "あなたの返信"}</strong>
              {c.instructor_reply}
            </div>
          )}
          <div className="request-card__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setForm({ id: c.answer_id, mode: "reply" });
                setText(c.instructor_reply ?? "");
              }}
            >
              {c.instructor_reply ? "返信を編集" : "返信する"}
            </button>
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => {
                setForm({ id: c.answer_id, mode: "report" });
                setText("");
              }}
            >
              運営に報告
            </button>
          </div>
          {form?.id === c.answer_id && (
            <div className="form-field" style={{ marginTop: 10 }}>
              <textarea
                rows={3}
                maxLength={1000}
                placeholder={form.mode === "reply" ? "返信メッセージ" : "報告の理由（任意）"}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={send}>
                  {form.mode === "reply" ? "返信を送信する" : "報告する"}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setForm(null)}>
                  閉じる
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {comments.length > 0 && (
        <div>
          <button type="button" className="btn btn--ghost btn--sm" aria-expanded={showComments} onClick={() => setShowComments((v) => !v)}>
            {showComments ? "コメントを隠す" : `コメントを見る（${comments.length}件）`}
          </button>
        </div>
      )}
      </div>
  );
  if (bare) return content;

  return (
    <ProfileSection
      title="研修アンケートの結果"
      meta={
        <>
          {fmt(summary.overall_avg)} / 4（{summary.answer_count}件）
        </>
      }
    >
      {content}
    </ProfileSection>
  );
}
