"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useToast } from "@/components/common/Toast";
import { createClient } from "@/lib/supabase/client";
import { linkCap, surveyLinkUrl, errorMessage } from "@/lib/survey/links";
import { qrSvg } from "@/lib/survey/qr";

type SurveyRow = { survey_id: string; max_links: number; opens_at: string | null; closed_at: string | null };
type LinkRow = { link_id: string; token: string; used_at: string | null };

/** The company's side of 研修アンケート: make the participants' links and QR codes. */
export function CompanySurveyPanel({
  requestId,
  title,
  participantCount,
}: {
  requestId: string;
  title: string;
  participantCount: number | null;
}) {
  const { showToast } = useToast();
  // The survey tables are new, so they are not in the generated types yet.
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [survey, setSurvey] = useState<SurveyRow | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [count, setCount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);

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
      if (row.opens_at) setStartDate(toDateInput(row.opens_at));
    } else {
      setLinks([]);
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
    const ok = await prepare(n, startDate ? dateInputToIso(startDate) : survey?.opens_at ?? null);
    if (ok) {
      setCount("");
      showToast(`${n}件のリンクを作成しました。`);
    }
  }

  async function handleSaveDate() {
    if (!startDate) return;
    if (await prepare(0, dateInputToIso(startDate))) showToast("開始日を保存しました。");
  }

  async function handleToggleClosed() {
    setBusy(true);
    const { error } = await supabase.rpc("set_training_survey_closed", { p_request_id: requestId, p_closed: !closed });
    setBusy(false);
    if (error) return showToast(errorMessage(error.message, cap));
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

  const summary = !loaded ? "" : links.length ? `回答 ${answered} / ${links.length}` : "未作成";

  return (
    <div style={{ marginTop: 12 }}>
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
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
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
        <div style={{ padding: "14px 4px 4px", display: "flex", flexDirection: "column", gap: 14 }}>
          {!participantCount ? (
            <p className="request-card__desc" style={{ color: "var(--color-ink-soft)", margin: 0 }}>
              対象人数が登録されていないため、リンクを作成できません。運営にご連絡ください。
            </p>
          ) : (
            <>
              <div className="form-field" style={{ margin: 0 }}>
                <label htmlFor={`survey-start-${requestId}`}>開始日（この日から回答できます）</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="date"
                    id={`survey-start-${requestId}`}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ maxWidth: 200 }}
                  />
                  {survey && (
                    <button type="button" className="btn btn--primary btn--sm" disabled={busy || !startDate} onClick={handleSaveDate}>
                      保存する
                    </button>
                  )}
                </div>
              </div>

              {remaining > 0 && (
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
        </div>
      )}
    </div>
  );
}

function toDateInput(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(iso));
}

function dateInputToIso(date: string): string {
  return `${date}T00:00:00+09:00`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
