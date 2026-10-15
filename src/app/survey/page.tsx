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
  type SurveyScores,
} from "@/lib/survey/answers";

type LinkInfo = { state: SurveyLinkState; title?: string | null; opens_at?: string | null };

function SurveyForm() {
  const token = useSearchParams().get("t");
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [answers, setAnswers] = useState<Partial<SurveyScores>>({});
  const [comment, setComment] = useState("");
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
    if (unansweredCount(answers) > 0) {
      setShowMissing(true);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answers, comment, name }),
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
          <QuestionList answers={answers} onChange={setAnswers} showMissing={showMissing} />

          <div className="form-field">
            <label htmlFor="surveyComment">コメント（任意）</label>
            <textarea id="surveyComment" rows={4} maxLength={COMMENT_MAX} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
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
