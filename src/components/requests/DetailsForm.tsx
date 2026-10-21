"use client";

import { cleanDays, EMPTY_DAY, MAX_DAYS, type DayFormat, type ScheduleDay } from "@/lib/requests/schedule";

export type DetailsFormValue = {
  days: ScheduleDay[];
  allDaysRequired: boolean;
  skills: string;
  prep: string;
};

export const EMPTY_DETAILS: DetailsFormValue = { days: [], allDaysRequired: false, skills: "", prep: "" };

/** The fields to send with a new request. */
export function detailsPayload(v: DetailsFormValue) {
  const days = cleanDays(v.days);
  return {
    schedule_days: days,
    all_days_required: days.length > 1 && v.allDaysRequired,
    req_skills: v.skills.trim() || null,
    req_prep: v.prep.trim() || null,
  };
}

/** 日ごとの日程・場所・実施形態 (#43/#58) と 必須条件・事前対応 (#59). */
export function DetailsForm({ value, onChange, idPrefix = "req" }: { value: DetailsFormValue; onChange: (v: DetailsFormValue) => void; idPrefix?: string }) {
  const set = (patch: Partial<DetailsFormValue>) => onChange({ ...value, ...patch });
  const setDay = (i: number, patch: Partial<ScheduleDay>) => set({ days: value.days.map((d, k) => (k === i ? { ...d, ...patch } : d)) });
  return (
    <>
      <div className="form-field">
        <label>日ごとの日程・場所（任意）</label>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--color-ink-soft)" }}>
          日にちが複数ある場合や、日によって場所・形態が違う場合は、ここに日ごとに入力できます。未定の項目は空のままで構いません。
        </p>
        {value.days.map((d, i) => (
          <div key={i} className="request-card__response" style={{ margin: "0 0 8px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>{i + 1}日目</strong>
              <input type="date" aria-label="日付" value={d.date} onChange={(e) => setDay(i, { date: e.target.value })} />
              <input type="time" aria-label="開始" value={d.start} onChange={(e) => setDay(i, { start: e.target.value })} />
              <span>〜</span>
              <input type="time" aria-label="終了" value={d.end} onChange={(e) => setDay(i, { end: e.target.value })} />
              <select aria-label="形態" value={d.format} onChange={(e) => setDay(i, { format: e.target.value as DayFormat })}>
                <option value="undecided">形態未定</option>
                <option value="online">オンライン</option>
                <option value="offline">対面</option>
              </select>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => set({ days: value.days.filter((_, k) => k !== i) })}>
                削除
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input type="text" maxLength={120} placeholder="場所（例：東京本社）" value={d.place} onChange={(e) => setDay(i, { place: e.target.value })} style={{ flex: "1 1 180px", minWidth: 0 }} />
              <input type="text" maxLength={300} placeholder="この日の内容（任意）" value={d.content} onChange={(e) => setDay(i, { content: e.target.value })} style={{ flex: "2 1 240px", minWidth: 0 }} />
            </div>
          </div>
        ))}
        {value.days.length < MAX_DAYS && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => set({ days: [...value.days, { ...EMPTY_DAY }] })}>
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
