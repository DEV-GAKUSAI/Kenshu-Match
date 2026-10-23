"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useToast } from "@/components/common/Toast";
import { createClient } from "@/lib/supabase/client";
import { QuestionList } from "@/components/survey/QuestionList";
import { SurveyImportPanel } from "@/components/survey/SurveyImportPanel";
import { COMMENT_MAX, formatOpenDateTime, unansweredCount, type SurveyInstructor, type SurveyScores } from "@/lib/survey/answers";
import { linkCap, surveyLinkUrl, errorMessage } from "@/lib/survey/links";
import { qrSvg } from "@/lib/survey/qr";

type SurveyRow = { survey_id: string; max_links: number; opens_at: string | null; closed_at: string | null };
type Gate = { open: boolean; opens_at: string | null };
type LinkRow = { link_id: string; token: string; used_at: string | null };
type HirerForm = { answers: Partial<SurveyScores>; comment: string; anonymous: boolean; missing: boolean };
const EMPTY_HIRER_FORM: HirerForm = { answers: {}, comment: "", anonymous: true, missing: false };

/** The company's side of 研修アンケート: make the participants' links and QR codes. */
export function CompanySurveyPanel({
  requestId,
  title,
  participantCount,
  completed,
  individual = false,
  instructors,
}: {
  requestId: string;
  title: string;
  participantCount: number | null;
  /** The request is marked 研修完了: the company can now give its own answer. */
  completed: boolean;
  /** The request was made by a 生徒 (not a company): wording says 「あなた」, not 「貴社」. */
  individual?: boolean;
  /** The chosen instructors (several when the request has role slots). The company answers once for each. */
  instructors: SurveyInstructor[];
}) {
  const { showToast } = useToast();
  // The survey tables are new, so they are not in the generated types yet.
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [survey, setSurvey] = useState<SurveyRow | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [count, setCount] = useState("");
  const [gate, setGate] = useState<Gate | null>(null);
  const [busy, setBusy] = useState(false);
  // The company's own answer
  // (one form per instructor; key = instructor id, "" when the instructor list is empty)
  const [hirerDoneIds, setHirerDoneIds] = useState<string[]>([]);
  const [hirerForms, setHirerForms] = useState<Record<string, HirerForm>>({});
  const several = instructors.length > 1;
  const formOf = (id: string): HirerForm => hirerForms[id] ?? EMPTY_HIRER_FORM;
  const patchForm = (id: string, patch: Partial<HirerForm>) =>
    setHirerForms((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_HIRER_FORM), ...patch } }));

  const load = useCallback(async () => {
    const { data: s } = await supabase
      .from("training_surveys")
      .select("survey_id, max_links, opens_at, closed_at")
      .eq("request_id", requestId)
      .maybeSingle();
    const row = (s as SurveyRow | null) ?? null;
    setSurvey(row);
    if (row) {
      const { data: l } = await supabase
        .from("training_survey_links")
        .select("link_id, token, used_at")
        .eq("survey_id", row.survey_id)
        .order("created_at", { ascending: true });
      setLinks((l as LinkRow[] | null) ?? []);
      const { data: g } = await supabase.rpc("get_training_survey_gate", { p_request_id: requestId });
      setGate((g as Gate | null) ?? null);
      const { data: mine } = await supabase.from("training_survey_answers").select("instructor_id").eq("survey_id", row.survey_id);
      setHirerDoneIds(((mine as { instructor_id: string }[] | null) ?? []).map((x) => x.instructor_id));
    } else {
      setLinks([]);
      setHirerDoneIds([]);
    }
    setLoaded(true);
  }, [supabase, requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cap = survey?.max_links ?? (participantCount ? linkCap(participantCount) : 0);
  const remaining = Math.max(0, cap - links.length);
  const answered = links.filter((l) => l.used_at).length;
  const closed = !!survey?.closed_at;

  async function prepare(addLinks: number, opensAt: string | null) {
    setBusy(true);
    const { error } = await supabase.rpc("prepare_training_survey", {
      p_request_id: requestId,
      p_add_links: addLinks,
      p_opens_at: opensAt,
    });
    setBusy(false);
    if (error) {
      showToast(errorMessage(error.message, cap));
      return false;
    }
    await load();
    return true;
  }

  async function handleCreate() {
    const n = Number(count || remaining);
    if (!Number.isInteger(n) || n < 1 || n > remaining) {
      showToast(`作成できるのは1〜${remaining}件です。`);
      return;
    }
    const ok = await prepare(n, null);
    if (ok) {
      setCount("");
      showToast(`${n}件のリンクを作成しました。`);
    }
  }

  async function handleToggleClosed() {
    setBusy(true);
    const { error } = await supabase.rpc("set_training_survey_closed", { p_request_id: requestId, p_closed: !closed });
    setBusy(false);
    if (error) return showToast(errorMessage(error.message, cap));
    await load();
  }

  async function handleHirerSubmit(id: string) {
    const f = formOf(id);
    if (unansweredCount(f.answers) > 0) {
      patchForm(id, { missing: true });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_training_survey_hirer_answer", {
      p_request_id: requestId,
      p_q1: f.answers.q1,
      p_q2: f.answers.q2,
      p_q3: f.answers.q3,
      p_q4: f.answers.q4,
      p_q5: f.answers.q5,
      p_comment: f.comment.trim() || null,
      p_is_anonymous: f.anonymous,
      p_instructor_id: id || null,
    });
    setBusy(false);
    if (error) return showToast(errorMessage(error.message, cap));
    if ((data as { state?: string } | null)?.state === "used") showToast("すでに回答済みです。");
    else showToast("ご回答ありがとうございました。");
    await load();
  }

  async function handleCopy() {
    const text = links.map((l) => surveyLinkUrl(window.location.origin, l.token)).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${links.length}件のリンクをコピーしました。`);
    } catch {
      showToast("コピーできませんでした。");
    }
  }

  function handlePrint() {
    const origin = window.location.origin;
    const cards = links
      .map(
        (l, i) =>
          `<div class="card"><div class="qr">${qrSvg(surveyLinkUrl(origin, l.token), 150)}</div><div class="no">${i + 1} / ${links.length}</div></div>`,
      )
      .join("");
    const w = window.open("", "_blank");
    if (!w) return showToast("ポップアップがブロックされました。許可してからもう一度お試しください。");
    w.document.write(
      `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>研修アンケート</title><style>
      body{font-family:sans-serif;margin:16px}h1{font-size:16px;margin:0 0 12px}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      .card{border:1px dashed #999;padding:8px;text-align:center;break-inside:avoid}
      .no{font-size:11px;color:#555}svg{width:100%;height:auto;max-width:150px}
      @media print{body{margin:6mm}}
      </style></head><body><h1>${escapeHtml(title)}　研修アンケート</h1><div class="grid">${cards}</div></body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  const summary = !loaded ? "" : links.length ? `参加者の回答 ${answered} / ${links.length}` : "リンク未作成";

  return (
    <div style={{ marginTop: 12, ...(open ? { border: "1.5px solid #5FD0AA", borderRadius: "var(--radius-s)", background: "#fff" } : {}) }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "10px 12px",
          background: "#fff",
          border: open ? "0" : "1px solid var(--color-border)",
          borderRadius: "var(--radius-s)",
          cursor: "pointer",
          font: "inherit",
          fontSize: 12.5,
          fontWeight: 700,
          color: "var(--color-ink)",
          textAlign: "left",
        }}
      >
        <span>研修アンケート</span>
        {summary && <span style={{ color: "var(--color-ink-soft)", fontWeight: 600 }}>{summary}</span>}
        {closed && <span className="status-badge status-badge--completed" style={{ fontSize: 10 }}>受付終了</span>}
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
        <div style={{ padding: "14px 14px 14px", borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 14 }}>
          {completed && loaded &&
            (instructors.length ? instructors : [{ id: "", name: null, role: null }]).map((ins) => {
              const done = hirerDoneIds.includes(ins.id) || (ins.id === "" && hirerDoneIds.length > 0);
              const f = formOf(ins.id);
              const who = several ? `（${ins.role ? `${ins.role}　` : ""}${ins.name ?? "講師"} 先生）` : "";
              return done ? (
                <p key={ins.id || "single"} className="request-card__desc" style={{ margin: 0 }}>
                  <strong>{individual ? "あなたの回答" : "貴社の回答"}{who}：</strong>回答済み
                </p>
              ) : (
                <div key={ins.id || "single"} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <strong style={{ fontSize: 13.5, marginBottom: 8 }}>{individual ? "あなたの回答" : "貴社の回答"}{who}</strong>
                  <QuestionList answers={f.answers} onChange={(next) => patchForm(ins.id, { answers: next })} showMissing={f.missing} />
                  <div className="form-field" style={{ margin: 0 }}>
                    <label htmlFor={`survey-comment-${requestId}-${ins.id}`}>コメント（任意）</label>
                    <textarea
                      id={`survey-comment-${requestId}-${ins.id}`}
                      rows={3}
                      maxLength={COMMENT_MAX}
                      value={f.comment}
                      onChange={(e) => patchForm(ins.id, { comment: e.target.value })}
                    />
                  </div>
                  <div className="survey-scale" role="radiogroup" style={{ gridTemplateColumns: "1fr 1fr", margin: "10px 0" }}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={f.anonymous}
                      className={`survey-scale__btn${f.anonymous ? " is-selected" : ""}`}
                      onClick={() => patchForm(ins.id, { anonymous: true })}
                    >
                      匿名で送る
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!f.anonymous}
                      className={`survey-scale__btn${!f.anonymous ? " is-selected" : ""}`}
                      onClick={() => patchForm(ins.id, { anonymous: false })}
                    >
                      {individual ? "お名前を表示して送る" : "会社名を表示して送る"}
                    </button>
                  </div>
                  <div>
                    <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => handleHirerSubmit(ins.id)}>
                      送信する
                    </button>
                  </div>
                </div>
              );
            })}

          {!participantCount ? (
            <p className="request-card__desc" style={{ color: "var(--color-ink-soft)", margin: 0 }}>
              対象人数が登録されていないため、リンクを作成できません。運営にご連絡ください。
            </p>
          ) : (
            <>
              <p className="request-card__desc" style={{ margin: 0, color: "var(--color-ink-soft)" }}>
                {!survey
                  ? "講師が決まると、参加者用のリンクとQRコードが自動で作られます。"
                  : gate?.open
                    ? "参加者は、いまからこのリンクで回答できます。"
                    : gate?.opens_at
                      ? `研修の最終日の終了後（${formatOpenDateTime(gate.opens_at)}以降）に回答できます。それまでは回答を受け付けません。`
                      : "研修日程が未入力のため、「研修完了」にすると回答できるようになります。"}
              </p>

              {!individual && remaining > 0 && (
                <div className="form-field" style={{ margin: 0 }}>
                  <label htmlFor={`survey-count-${requestId}`}>作成するリンク数（あと{remaining}件まで）</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="number"
                      id={`survey-count-${requestId}`}
                      min={1}
                      max={remaining}
                      step={1}
                      placeholder={String(remaining)}
                      value={count}
                      onChange={(e) => setCount(e.target.value)}
                      style={{ maxWidth: 120 }}
                    />
                    <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleCreate}>
                      リンクを作成する
                    </button>
                  </div>
                </div>
              )}

              {links.length > 0 && (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn btn--primary btn--sm" onClick={handlePrint}>
                      QRシートを印刷
                    </button>
                    <button type="button" className="btn btn--primary btn--sm" onClick={handleCopy}>
                      リンクをコピー
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={handleToggleClosed}>
                      {closed ? "受付を再開する" : "受付を終了する"}
                    </button>
                  </div>
                  <ol className="survey-links">
                    {links.map((l, i) => (
                      <li key={l.link_id}>
                        <span>{i + 1}</span>
                        <span className={l.used_at ? "is-used" : ""}>{l.used_at ? "回答済み" : "未回答"}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}

          {several ? (
            <p className="request-card__desc" style={{ margin: 0, color: "var(--color-ink-soft)" }}>
              複数名の依頼では、回答ファイルの取り込みはまだ使えません。
            </p>
          ) : (
            <SurveyImportPanel requestId={requestId} />
          )}
        </div>
      )}
    </div>
  );
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
