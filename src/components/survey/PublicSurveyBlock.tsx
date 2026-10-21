"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  hirer_count: number;
};
type Comment = {
  answer_id: string;
  role: "HIRER" | "PARTICIPANT";
  comment: string;
  author_label: string;
  score: number;
  instructor_reply: string | null;
  created_at: string;
};

const COMMENTS_SHOWN_FIRST = 3;
const STAR = "#f2b84b";

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Number(v).toFixed(1));

function roleChip(c: Comment) {
  const text = c.role === "HIRER" ? "依頼企業" : "参加者";
  // The name already says it (「参加者」, 「依頼企業（匿名）」): no second label.
  return c.author_label.startsWith(text) ? null : text;
}

function avatarLetter(c: Comment) {
  if (c.role === "HIRER") return "企";
  return c.author_label === "参加者" ? "参" : c.author_label.trim().slice(0, 1);
}

/** 研修アンケート result on the public instructor page. Shows nothing until there is an answer. */
export function PublicSurveyBlock({ instructorId, canReply = false, instructorName }: { instructorId: string; canReply?: boolean; instructorName?: string }) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showAll, setShowAll] = useState(false);
  // The instructor viewing their own page can answer a comment, thread-style.
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  async function sendReply(answerId: string) {
    setBusy(true);
    const { error } = await supabase.rpc("reply_training_survey_answer", { p_answer_id: answerId, p_reply: replyText });
    setBusy(false);
    if (error) return;
    setReplyId(null);
    setReplyText("");
    setReloadKey((k) => k + 1);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: s } = await supabase.from("instructor_survey_summary").select("*").eq("instructor_id", instructorId).maybeSingle();
      if (!active || !s) return;
      setSummary(s as Summary);
      const { data: c } = await supabase
        .from("instructor_survey_comments")
        .select("answer_id, role, comment, author_label, score, instructor_reply, created_at")
        .eq("instructor_id", instructorId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (active) setComments((c as Comment[] | null) ?? []);
    })();
    return () => {
      active = false;
    };
  }, [supabase, instructorId, reloadKey]);

  if (!summary) return null;

  const shown = showAll ? comments : comments.slice(0, COMMENTS_SHOWN_FIRST);

  return (
    <div id="survey-result" style={{ paddingBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px 32px", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 150 }}>
          <span style={{ color: STAR, fontSize: 30 }}>★</span>
          <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{fmt(summary.overall_avg)}</span>
          <span style={{ fontSize: 14, color: "var(--color-ink-soft)" }}>
            / 4（{summary.answer_count}件）
          </span>
        </div>
        <ul className="survey-avgs" style={{ flex: "1 1 320px", gap: 12 }}>
          {SURVEY_QUESTIONS.map((q) => {
            const v = summary[`${q.key}_avg` as keyof Summary] as number | null;
            return (
              <li key={q.key} style={{ fontSize: 12 }}>
                <span>{q.text}</span>
                <span className="survey-avgs__bar">
                  <span style={{ width: `${v ? (Number(v) / 4) * 100 : 0}%` }} />
                </span>
                <strong style={{ fontSize: 13 }}>{fmt(v)}</strong>
              </li>
            );
          })}
        </ul>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {shown.map((c) => {
          const chip = roleChip(c);
          const hirer = c.role === "HIRER";
          return (
            <div
              key={c.answer_id}
              style={{ background: "#f7faf9", border: "1px solid var(--color-border)", borderRadius: 12, padding: "14px 16px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span
                  aria-hidden
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    background: hirer ? "var(--color-primary)" : "#e4eae8",
                    color: hirer ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  {avatarLetter(c)}
                </span>
                <strong style={{ fontSize: 14 }}>{c.author_label}</strong>
                {chip && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 99,
                      background: hirer ? "color-mix(in srgb, var(--color-primary) 14%, #fff)" : "#e4eae8",
                      color: hirer ? "var(--color-primary)" : "var(--color-ink-soft)",
                    }}
                  >
                    {chip}
                  </span>
                )}
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 99,
                    background: "color-mix(in srgb, var(--color-primary) 12%, #fff)",
                    color: "var(--color-primary)",
                  }}
                >
                  <span style={{ color: STAR }}>★</span> {fmt(c.score)}
                </span>
              </div>
              <p style={{ margin: "10px 0 8px", fontSize: 14, lineHeight: 1.7, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{c.comment}</p>
              {c.instructor_reply && (
                <div style={{ display: "flex", gap: 10, margin: "4px 0 10px 18px", paddingLeft: 12, borderLeft: "3px solid var(--color-primary)" }}>
                  <span
                    aria-hidden
                    style={{ width: 28, height: 28, flex: "none", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: "color-mix(in srgb, var(--color-primary) 14%, #fff)", color: "var(--color-primary)" }}
                  >
                    講
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 13 }}>{instructorName ? `${instructorName} 先生の返信` : "講師からの返信"}</strong>
                    <p style={{ margin: "4px 0 0", fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.instructor_reply}</p>
                  </div>
                </div>
              )}
              {canReply && replyId !== c.answer_id && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setReplyId(c.answer_id);
                    setReplyText(c.instructor_reply ?? "");
                  }}
                >
                  {c.instructor_reply ? "返信を編集" : "返信する"}
                </button>
              )}
              {canReply && replyId === c.answer_id && (
                <div style={{ marginLeft: 18 }}>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    placeholder="返信メッセージ"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    style={{ width: "100%", padding: 10, border: "1px solid var(--color-border)", borderRadius: 10, font: "inherit", fontSize: 14 }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn btn--primary btn--sm" disabled={busy || !replyText.trim()} onClick={() => sendReply(c.answer_id)}>
                      返信を送信する
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReplyId(null)}>
                      閉じる
                    </button>
                  </div>
                </div>
              )}
              <div style={{ textAlign: "right", fontSize: 11, color: "var(--color-ink-soft)" }}>{c.created_at.slice(0, 10)}</div>
            </div>
          );
        })}
      </div>

      {!showAll && comments.length > COMMENTS_SHOWN_FIRST && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={{
            width: "100%",
            marginTop: 14,
            padding: "12px 16px",
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            border: "1px solid var(--color-primary)",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--color-primary) 8%, #fff)",
            color: "var(--color-primary)",
          }}
        >
          もっと見る（残り {comments.length - COMMENTS_SHOWN_FIRST}件）
        </button>
      )}
      {showAll && comments.length > COMMENTS_SHOWN_FIRST && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          style={{
            width: "100%",
            marginTop: 14,
            padding: "12px 16px",
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            border: "1px solid var(--color-primary)",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--color-primary) 8%, #fff)",
            color: "var(--color-primary)",
          }}
        >
          閉じる
        </button>
      )}
    </div>
  );
}
