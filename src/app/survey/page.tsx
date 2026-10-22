"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { QuestionList } from "@/components/survey/QuestionList";
import {
  COMMENT_MAX,
  NAME_MAX,
  isSurveyToken,
  linkStateMessage,
  unansweredCount,
  type SurveyLinkState,
  type SurveyInstructor,
  type SurveyScores,
} from "@/lib/survey/answers";

type LinkInfo = { state: SurveyLinkState; title?: string | null; opens_at?: string | null; instructors?: SurveyInstructor[] };

/** 「メイン講師　山田 太郎 先生」: the heading above each instructor's questions when there are several. */
function instructorHeading(i: SurveyInstructor): string {
  const who = i.name ? `${i.name} 先生` : "講師";
  return i.role ? `${i.role}　${who}` : who;
}

function SurveyForm() {
  const token = useSearchParams().get("t");
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Answers and comment per instructor (key = instructor id; "" for the old one-instructor form).
  const [answersBy, setAnswersBy] = useState<Record<string, Partial<SurveyScores>>>({});
  const [commentBy, setCommentBy] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [showMissing, setShowMissing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isSurveyToken(token)) {
      setInfo({ state: "invalid" });
      return;
    }
    let active = true;
    fetch(`/api/survey?t=${token}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: LinkInfo) => active && setInfo(data))
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const targets = info?.instructors?.length ? info.instructors.map((i) => i.id) : [""];
    if (targets.some((id) => unansweredCount(answersBy[id] ?? {}) > 0)) {
      setShowMissing(true);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          targets[0] === ""
            ? { token, answers: answersBy[""], comment: commentBy[""] ?? "", name }
            : { token, name, entries: targets.map((id) => ({ instructorId: id, answers: answersBy[id], comment: commentBy[id] ?? "" })) },
        ),
      });
      const data = (await res.json().catch(() => null)) as { state?: SurveyLinkState } | null;
      if (!res.ok || !data?.state) {
        setError("送信できませんでした。時間をおいてもう一度お試しください。");
      } else if (data.state === "ok") {
        setDone(true);
      } else {
        setInfo((prev) => ({ ...(prev ?? { state: data.state! }), state: data.state! }));
      }
    } catch {
      setError("送信できませんでした。時間をおいてもう一度お試しください。");
    }
    setSubmitting(false);
  }

  if (loadError) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="notice-banner is-visible">読み込めませんでした。ページを開き直してください。</div>
        </div>
      </main>
    );
  }
  if (!info) return <main className="auth-page" />;

  if (done) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p className="auth-card__eyebrow">THANK YOU</p>
          <h1 className="auth-card__title">ご回答ありがとうございました</h1>
        </div>
      </main>
    );
  }

  if (info.state !== "ok") {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p className="auth-card__eyebrow">研修アンケート</p>
          <p className="auth-card__desc">{linkStateMessage(info.state, info.opens_at)}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card survey-card">
        <p className="auth-card__eyebrow">研修アンケート</p>
        {info.title && <h1 className="auth-card__title">{info.title}</h1>}

        {error && <div className="notice-banner is-visible">{error}</div>}

        <form noValidate onSubmit={handleSubmit}>
          {(info.instructors?.length ? info.instructors : [{ id: "", name: null, role: null }]).map((ins, idx, all) => (
            <section key={ins.id || "single"} style={all.length > 1 ? { marginBottom: 28 } : undefined}>
              {all.length > 1 && (
                <h2 style={{ fontSize: 16, margin: "0 0 12px", padding: "8px 12px", background: "var(--color-accent-soft)", borderRadius: "var(--radius-s)" }}>
                  {idx + 1}. {instructorHeading(ins)}
                </h2>
              )}
              <QuestionList
                answers={answersBy[ins.id] ?? {}}
                onChange={(next) => setAnswersBy((prev) => ({ ...prev, [ins.id]: next }))}
                showMissing={showMissing}
              />
              <div className="form-field">
                <label htmlFor={`surveyComment-${ins.id || "single"}`}>{all.length > 1 ? "この講師へのコメント（任意）" : "コメント（任意）"}</label>
                <textarea
                  id={`surveyComment-${ins.id || "single"}`}
                  rows={4}
                  maxLength={COMMENT_MAX}
                  value={commentBy[ins.id] ?? ""}
                  onChange={(e) => setCommentBy((prev) => ({ ...prev, [ins.id]: e.target.value }))}
                />
              </div>
            </section>
          ))}
          <div className="form-field">
            <label htmlFor="surveyName">お名前（任意）</label>
            <input id="surveyName" type="text" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
              {submitting ? "送信中…" : "送信する"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

export default function SurveyPage() {
  return (
    <Suspense fallback={<main className="auth-page" />}>
      <SurveyForm />
    </Suspense>
  );
}
