"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { formatOpenDateTime } from "@/lib/survey/answers";
import { surveyLinkUrl } from "@/lib/survey/links";
import { qrSvg } from "@/lib/survey/qr";

type SurveyRow = { survey_id: string; opens_at: string | null; closed_at: string | null };
type LinkRow = { link_id: string; token: string; used_at: string | null };

/**
 * The instructor's view of one request's survey: the QR codes to show at the
 * end of the training (view only, he cannot make more) and how many answered.
 */
export function InstructorSurveyPanel({ requestId }: { requestId: string }) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [survey, setSurvey] = useState<SurveyRow | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [index, setIndex] = useState(0);
  const [gate, setGate] = useState<{ open: boolean; opens_at: string | null } | null>(null);

  const load = useCallback(async () => {
    const { data: s } = await supabase
      .from("training_surveys")
      .select("survey_id, opens_at, closed_at")
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
      const list = (l as LinkRow[] | null) ?? [];
      setLinks(list);
      const firstOpen = list.findIndex((x) => !x.used_at);
      setIndex(firstOpen >= 0 ? firstOpen : 0);
    }
    const { data: g } = await supabase.rpc("get_training_survey_gate", { p_request_id: requestId });
    setGate((g as { open: boolean; opens_at: string | null } | null) ?? null);
    setLoaded(true);
  }, [supabase, requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded || !survey || links.length === 0) return null;

  const answered = links.filter((l) => l.used_at).length;
  const current = links[Math.min(index, links.length - 1)];
  const svg = qrSvg(surveyLinkUrl(typeof window === "undefined" ? "" : window.location.origin, current.token), 260);

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
        <span style={{ color: "var(--color-ink-soft)", fontWeight: 600 }}>
          回答 {answered} / {links.length}
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
        <div style={{ padding: "14px 14px 14px", borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {gate && !gate.open && (
            <p className="request-card__desc" style={{ margin: 0, color: "var(--color-ink-soft)" }}>
              {gate.opens_at ? `回答の受付：研修の終了後（${formatOpenDateTime(gate.opens_at)}以降）` : "回答の受付：研修が「完了」になってから"}
            </p>
          )}
          <div className="survey-qr" dangerouslySetInnerHTML={{ __html: svg }} />
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {Math.min(index, links.length - 1) + 1} / {links.length}
            {current.used_at && <span style={{ marginLeft: 8, color: "var(--color-primary)" }}>回答済み</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn--primary btn--sm" disabled={index <= 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              前へ
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={index >= links.length - 1}
              onClick={() => setIndex((i) => Math.min(links.length - 1, i + 1))}
            >
              次へ
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>
              更新
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
