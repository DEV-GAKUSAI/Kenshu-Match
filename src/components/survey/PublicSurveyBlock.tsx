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
  comment: string;
  author_label: string;
  score: number;
  instructor_reply: string | null;
  created_at: string;
};

const COMMENTS_SHOWN_FIRST = 3;

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Number(v).toFixed(1));

/** 研修アンケート result on the public instructor page. Shows nothing until there is an answer. */
export function PublicSurveyBlock({ instructorId }: { instructorId: string }) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: s } = await supabase.from("instructor_survey_summary").select("*").eq("instructor_id", instructorId).maybeSingle();
      if (!active || !s) return;
      setSummary(s as Summary);
      const { data: c } = await supabase
        .from("instructor_survey_comments")
        .select("answer_id, comment, author_label, score, instructor_reply, created_at")
        .eq("instructor_id", instructorId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (active) setComments((c as Comment[] | null) ?? []);
    })();
    return () => {
      active = false;
    };
  }, [supabase, instructorId]);

  if (!summary) return null;

  const shown = showAll ? comments : comments.slice(0, COMMENTS_SHOWN_FIRST);

  return (
    <details
      id="survey-result"
      className="detail-block"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary
        className="detail-block__title"
        style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 10, marginBottom: open ? undefined : 0 }}
      >
        <span>
          研修アンケート　<span style={{ color: "#f2b84b" }}>★</span> {fmt(summary.overall_avg)} / 4（{summary.answer_count}件）
        </span>
        <span aria-hidden style={{ marginLeft: "auto", color: "var(--color-primary)", fontSize: 14 }}>
          {open ? "▲" : "▼"}
        </span>
      </summary>
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
      {shown.map((c) => (
        <div className="review-item" key={c.answer_id}>
          <div className="review-item__top">
            <span className="review-item__name">{c.author_label}</span>
            <span className="review-item__rating">{fmt(c.score)} / 4</span>
          </div>
          <p className="review-item__comment">{c.comment}</p>
          {c.instructor_reply && (
            <div className="request-card__response">
              <strong>講師からの返信</strong>
              {c.instructor_reply}
            </div>
          )}
          <span className="review-item__date">{c.created_at.slice(0, 10)}</span>
        </div>
      ))}
      {!showAll && comments.length > COMMENTS_SHOWN_FIRST && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowAll(true)}>
          もっと見る（残り {comments.length - COMMENTS_SHOWN_FIRST}件）
        </button>
      )}
    </details>
  );
}
