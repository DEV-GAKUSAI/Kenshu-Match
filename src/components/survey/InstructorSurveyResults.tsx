"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useToast } from "@/components/common/Toast";
import { createClient } from "@/lib/supabase/client";
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
export function InstructorSurveyResults({ instructorId }: { instructorId: string }) {
  const { showToast } = useToast();
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [open, setOpen] = useState(false);
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

  if (!summary) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "12px 14px",
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-s)",
          cursor: "pointer",
          font: "inherit",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--color-ink)",
          textAlign: "left",
        }}
      >
        <span>研修アンケートの結果</span>
        <span style={{ color: "var(--color-ink-soft)", fontWeight: 600 }}>
          {fmt(summary.overall_avg)} / 4（{summary.answer_count}件）
        </span>
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
          style={{ marginLeft: "auto", color: "var(--color-ink-soft)", transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: "14px 4px 0", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>
            参加者 {fmt(summary.participant_avg)}（{summary.participant_count}件）／ 依頼企業 {fmt(summary.hirer_avg)}（{summary.hirer_count}件）／ リンク発行 {summary.links_issued}件
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

          {comments.map((c) => (
            <div key={c.answer_id} className="review-item">
              <div className="review-item__top">
                <span className="review-item__name">{c.author_label}</span>
                <span className="review-item__rating">{fmt(c.score)} / 4</span>
              </div>
              <p className="review-item__comment">{c.comment}</p>
              {c.instructor_reply && (
                <div className="request-card__response">
                  <strong>あなたの返信</strong>
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
        </div>
      )}
    </div>
  );
}
