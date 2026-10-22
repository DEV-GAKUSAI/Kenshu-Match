"use client";

import { useEffect, useState } from "react";
import { dayLine, normalizeDays } from "@/lib/requests/schedule";
import { normalizeSlots, slotsSummary } from "@/lib/requests/roles";
import { groupChosen, type DetailOption } from "@/lib/requests/detail-options";
import { loadDetailOptions } from "@/lib/requests/detail-options-load";

/** Shows the day-by-day schedule and the required conditions of a request (only what was filled in). */
export function DetailsView({
  r,
  showRoles = true,
}: {
  /** 募集職種 is shown here unless the page shows it itself (the company card has its own progress block). */
  showRoles?: boolean;
  r: { role_slots?: unknown; schedule_days?: unknown; all_days_required?: boolean | null; req_skills?: string | null; req_prep?: string | null; detail_option_ids?: string[] | null; detail_other_tools?: string | null };
}) {
  const [options, setOptions] = useState<DetailOption[]>([]);
  const hasIds = (r.detail_option_ids ?? []).length > 0;
  useEffect(() => {
    if (!hasIds) return;
    let alive = true;
    loadDetailOptions().then((o) => alive && setOptions(o));
    return () => {
      alive = false;
    };
  }, [hasIds]);
  const chosen = groupChosen(r.detail_option_ids, options);
  const otherTools = (r.detail_other_tools ?? "").trim();
  const days = normalizeDays(r.schedule_days);
  const slots = showRoles ? normalizeSlots(r.role_slots) : [];
  const skills = (r.req_skills ?? "").trim();
  const prep = (r.req_prep ?? "").trim();
  if (!days.length && !skills && !prep && !chosen.length && !otherTools && !slots.length) return null;
  return (
    <div className="request-card__response" style={{ margin: "0 0 14px", fontSize: 13 }}>
      {slots.length > 0 && (
        <div style={{ marginBottom: chosen.length || otherTools || days.length || skills || prep ? 10 : 0 }}>
          <strong>募集職種・人数</strong>
          {slotsSummary(slots)}
        </div>
      )}
      {(chosen.length > 0 || otherTools) && (
        <div style={{ marginBottom: days.length || skills || prep ? 10 : 0 }}>
          <strong>詳細条件</strong>
          {chosen.map((g) => (
            <div key={g.key}>
              {g.label}：{g.names.join("・")}
              {g.key === "tool" && otherTools ? `・${otherTools}` : ""}
            </div>
          ))}
          {otherTools && !chosen.some((g) => g.key === "tool") && <div>技術・製品・ツール：{otherTools}</div>}
        </div>
      )}
      {days.length > 0 && (
        <div style={{ marginBottom: skills || prep ? 8 : 0 }}>
          <strong>日程{r.all_days_required ? "（全日程の登壇が必要）" : ""}</strong>
          {days.map((d, i) => (
            <div key={i}>
              {i + 1}日目：{dayLine(d)}
            </div>
          ))}
        </div>
      )}
      {skills && (
        <div style={{ marginBottom: prep ? 8 : 0, whiteSpace: "pre-wrap" }}>
          <strong>必須スキル・経験</strong>
          {skills}
        </div>
      )}
      {prep && (
        <div style={{ whiteSpace: "pre-wrap" }}>
          <strong>事前に対応してほしいこと</strong>
          {prep}
        </div>
      )}
    </div>
  );
}
