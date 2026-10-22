"use client";

import { useState } from "react";
import { cleanDays, EMPTY_DAY, MAX_DAYS, type DayFormat, type ScheduleDay } from "@/lib/requests/schedule";
import { Select } from "@/components/ui/Select";
import { DetailConditionsForm } from "@/components/requests/DetailConditionsForm";

export type DetailsFormValue = {
  days: ScheduleDay[];
  allDaysRequired: boolean;
  skills: string;
  prep: string;
  /** 詳細条件 (ids from training_detail_options) and the typed-in other tools. */
  optionIds: string[];
  otherTools: string;
};

export const EMPTY_DETAILS: DetailsFormValue = { days: [], allDaysRequired: false, skills: "", prep: "", optionIds: [], otherTools: "" };

/** The fields to send with a new request. */
export function detailsPayload(v: DetailsFormValue, alwaysSendDetails = false) {
  const days = cleanDays(v.days);
  return {
    schedule_days: days,
    all_days_required: days.length > 1 && v.allDaysRequired,
    req_skills: v.skills.trim() || null,
    req_prep: v.prep.trim() || null,
    // Only sent when used (or when editing, so choices can be cleared) — keeps new requests working before migration 164 is run.
    ...(alwaysSendDetails || v.optionIds.length > 0 || v.otherTools.trim()
      ? { detail_option_ids: v.optionIds, detail_other_tools: v.otherTools.trim() || null }
      : {}),
  };
}

const FORMAT_LABEL: Record<string, string> = { undecided: "形態未定", online: "オンライン", offline: "対面" };

/** One-line summary shown on a closed day row. */
function daySummary(d: ScheduleDay): string {
  const parts: string[] = [];
  if (d.date) {
    const [, m, dd] = d.date.split("-");
    parts.push(m && dd ? `${Number(m)}/${Number(dd)}` : d.date);
  }
  if (d.start || d.end) parts.push(`${d.start || "--:--"}〜${d.end || "--:--"}`);
  parts.push(FORMAT_LABEL[d.format] || "形態未定");
  if (d.place) parts.push(d.place);
  return parts.join(" ・ ");
}

/** 日ごとの日程・場所・実施形態 (#43/#58) と 必須条件・事前対応 (#59). */
export function DetailsForm({ value, onChange, idPrefix = "req" }: { value: DetailsFormValue; onChange: (v: DetailsFormValue) => void; idPrefix?: string }) {
  const set = (patch: Partial<DetailsFormValue>) => onChange({ ...value, ...patch });
  // Which day rows are open. A newly added day opens so it can be filled in; the rest stay closed.
  const [openDays, setOpenDays] = useState<Set<number>>(() => new Set());
  const toggleDay = (i: number) => setOpenDays((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const removeDay = (i: number) => {
    set({ days: value.days.filter((_, k) => k !== i) });
    setOpenDays((prev) => new Set([...prev].filter((k) => k !== i).map((k) => (k > i ? k - 1 : k))));
  };
  const addDay = () => {
    setOpenDays((prev) => new Set(prev).add(value.days.length));
    set({ days: [...value.days, { ...EMPTY_DAY }] });
  };
  const setDay = (i: number, patch: Partial<ScheduleDay>) => set({ days: value.days.map((d, k) => (k === i ? { ...d, ...patch } : d)) });
  return (
    <>
      <DetailConditionsForm value={{ optionIds: value.optionIds, otherTools: value.otherTools }} onChange={(c) => set(c)} />
      <div className="form-field">
        <label>日ごとの日程・場所（任意）</label>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--color-ink-soft)" }}>
          日にちが複数ある場合や、日によって場所・形態が違う場合は、ここに日ごとに入力できます。未定の項目は空のままで構いません。
        </p>
        {value.days.map((d, i) => {
          const isOpen = openDays.has(i);
          return (
          <div
            key={i}
            style={{ margin: "0 0 8px", background: "#fff", border: isOpen ? "1.5px solid #5FD0AA" : "1px solid var(--color-border)", borderRadius: "var(--radius-s)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggleDay(i)}
                style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, background: "none", border: 0, padding: 0, font: "inherit", textAlign: "left", cursor: "pointer", color: "var(--color-ink)" }}
              >
                <strong style={{ fontSize: 13, flex: "none" }}>{i + 1}日目</strong>
                {!isOpen && (
                  <span style={{ fontSize: 12.5, color: "var(--color-ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{daySummary(d)}</span>
                )}
                <span aria-hidden style={{ marginLeft: "auto", flex: "none", color: "#17B08A", fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeDay(i)}>
                削除
              </button>
            </div>
            {isOpen && (
            <div style={{ padding: "10px", borderTop: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="date" aria-label="日付" value={d.date} onChange={(e) => setDay(i, { date: e.target.value })} />
              <input type="time" aria-label="開始" value={d.start} onChange={(e) => setDay(i, { start: e.target.value })} />
              <span>〜</span>
              <input type="time" aria-label="終了" value={d.end} onChange={(e) => setDay(i, { end: e.target.value })} />
              <Select aria-label="形態" value={d.format} onChange={(e) => setDay(i, { format: e.target.value as DayFormat })}>
                <option value="undecided">形態未定</option>
                <option value="online">オンライン</option>
                <option value="offline">対面</option>
              </Select>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input type="text" maxLength={120} placeholder="場所（例：東京本社）" value={d.place} onChange={(e) => setDay(i, { place: e.target.value })} style={{ flex: "1 1 180px", minWidth: 0 }} />
              <input type="text" maxLength={300} placeholder="この日の内容（任意）" value={d.content} onChange={(e) => setDay(i, { content: e.target.value })} style={{ flex: "2 1 240px", minWidth: 0 }} />
            </div>
            </div>
            )}
          </div>
          );
        })}
        {value.days.length < MAX_DAYS && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={addDay}>
            ＋ 日を追加する
          </button>
        )}
        {value.days.length > 1 && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 13.5 }}>
            <input type="checkbox" checked={value.allDaysRequired} onChange={(e) => set({ allDaysRequired: e.target.checked })} />
            全日程に登壇できる講師が必要です（一部の日だけの参加は不可）
          </label>
        )}
      </div>

      <div className="form-field">
        <label htmlFor={`${idPrefix}Skills`}>必須スキル・経験（任意）</label>
        <textarea id={`${idPrefix}Skills`} rows={2} maxLength={1000} placeholder="例：SQLの実務経験3年以上、研修登壇の実績" value={value.skills} onChange={(e) => set({ skills: e.target.value })} />
      </div>
      <div className="form-field">
        <label htmlFor={`${idPrefix}Prep`}>事前に対応してほしいこと（任意）</label>
        <textarea id={`${idPrefix}Prep`} rows={2} maxLength={1000} placeholder="例：事前打合せ1回、教材の作成、模擬講義" value={value.prep} onChange={(e) => set({ prep: e.target.value })} />
      </div>
    </>
  );
}
