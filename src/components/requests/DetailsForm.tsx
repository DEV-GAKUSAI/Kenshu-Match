"use client";

import { useEffect, useState } from "react";
import { cleanDays, EMPTY_DAY, MAX_DAYS, type DayFormat, type ScheduleDay } from "@/lib/requests/schedule";
import { Select } from "@/components/ui/Select";
import { JP_PREFECTURES } from "@/lib/requests/prefectures";
import { CONDITION_ITEMS, MAX_YEARS, conditionsPayload, pruneSkillConditions, type CondKey, type CondLevel, type Condition, type SkillKind } from "@/lib/requests/conditions";
import { loadDetailOptions } from "@/lib/requests/detail-options-load";
import { loadFieldNames } from "@/lib/requests/field-names";
import type { DetailOption } from "@/lib/requests/detail-options";
import { DetailConditionsForm } from "@/components/requests/DetailConditionsForm";

export type DetailsFormValue = {
  days: ScheduleDay[];
  allDaysRequired: boolean;
  skills: string;
  prep: string;
  /** 詳細条件 (ids from training_detail_options) and the typed-in other tools. */
  optionIds: string[];
  otherTools: string;
  /** 必須／歓迎の条件 (#59). */
  conditions: Condition[];
};

export const EMPTY_DETAILS: DetailsFormValue = { days: [], allDaysRequired: false, skills: "", prep: "", optionIds: [], otherTools: "", conditions: [] };

/** The fields to send with a new request. */
export function detailsPayload(v: DetailsFormValue, alwaysSendDetails = false) {
  const days = cleanDays(v.days);
  return {
    schedule_days: days,
    all_days_required: days.length > 1 && v.allDaysRequired,
    req_skills: v.skills.trim() || null,
    req_prep: v.prep.trim() || null,
    // Only sent when used (or when editing, so they can be cleared) — keeps new requests working before migration 191 is run.
    ...(alwaysSendDetails || v.conditions.length > 0 ? { req_conditions: conditionsPayload(v.conditions) } : {}),
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
  if (d.format !== "online" && d.prefecture) parts.push(d.prefecture);
  if (d.place) parts.push(d.place);
  if (d.venueTentative && d.format !== "online") parts.push("会場調整中");
  if (d.tentative) parts.push("日程調整中");
  return parts.join(" ・ ");
}

/** 日ごとの日程・場所・実施形態 (#43/#58) と 必須条件・事前対応 (#59). */
export function DetailsForm({ value, onChange, idPrefix = "req", fieldId }: { value: DetailsFormValue; onChange: (v: DetailsFormValue) => void; idPrefix?: string; fieldId?: string }) {
  const set = (patch: Partial<DetailsFormValue>) => onChange({ ...value, ...patch });
  // The request's own field and the ticked tools, by name: what a 分野・ツールの条件 can be set on.
  const [options, setOptions] = useState<DetailOption[]>([]);
  const [fieldNames, setFieldNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void loadDetailOptions().then((o) => active && setOptions(o));
    void loadFieldNames().then((n) => active && setFieldNames(n));
    return () => { active = false; };
  }, []);
  const fieldName = fieldId ? fieldNames[fieldId] : undefined;
  const targets: SkillTarget[] = [
    ...(fieldName ? [{ kind: "field" as const, name: fieldName }] : []),
    ...options.filter((o) => o.group_key === "tool" && value.optionIds.includes(o.id)).map((o) => ({ kind: "tool" as const, name: o.name })),
  ];
  const targetsKey = targets.map((t) => `${t.kind}:${t.name}`).join("|");
  // A condition on a tool or field that is no longer chosen is removed. Nothing is removed until the lists have loaded.
  useEffect(() => {
    if (options.length === 0) return;
    const keepFields = !!fieldId && !fieldName;
    const allowed = [...targets, ...(keepFields ? value.conditions.filter((c) => c.key === "skill" && c.kind === "field").map((c) => ({ kind: "field" as const, name: c.name as string })) : [])];
    const kept = pruneSkillConditions(value.conditions, allowed);
    if (kept.length !== value.conditions.length) onChange({ ...value, conditions: kept });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length, targetsKey, fieldId, fieldName, value.conditions]);
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
              <span style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>休憩（任意）</span>
              <input type="time" aria-label="休憩の開始" value={d.breakStart ?? ""} onChange={(e) => setDay(i, { breakStart: e.target.value })} />
              <span>〜</span>
              <input type="time" aria-label="休憩の終了" value={d.breakEnd ?? ""} onChange={(e) => setDay(i, { breakEnd: e.target.value })} />
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5, marginLeft: "auto" }}>
                <input type="checkbox" checked={!!d.tentative} onChange={(e) => setDay(i, { tentative: e.target.checked })} />
                この日の日程（日時）は調整中
              </label>
            </div>
            {d.format !== "online" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                <Select aria-label="都道府県" value={d.prefecture ?? ""} onChange={(e) => setDay(i, { prefecture: e.target.value })} style={{ flex: "0 1 180px" }}>
                  <option value="">都道府県（未定）</option>
                  {JP_PREFECTURES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5 }}>
                  <input type="checkbox" checked={!!d.venueTentative} onChange={(e) => setDay(i, { venueTentative: e.target.checked })} />
                  会場は調整中
                </label>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input type="text" maxLength={120} placeholder={d.format === "online" ? "オンラインの場合のツール等（例：Zoom）" : "会場名（例：東京本社 3階会議室）"} value={d.place} onChange={(e) => setDay(i, { place: e.target.value })} style={{ flex: "1 1 180px", minWidth: 0 }} />
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
      <ConditionsForm value={value.conditions} onChange={(conditions) => set({ conditions })} />
      <SkillConditionsForm targets={targets} value={value.conditions} onChange={(conditions) => set({ conditions })} />
    </>
  );
}

const LEVEL_TEXT: Record<"" | CondLevel, string> = { "": "指定しない", must: "必須", nice: "歓迎" };

/** 必須／歓迎の条件 (#59): each item is 指定しない / 必須 / 歓迎. Lecturers answer 可／不可／要相談 when applying. */
function ConditionsForm({ value, onChange }: { value: Condition[]; onChange: (v: Condition[]) => void }) {
  const get = (key: CondKey) => value.find((c) => c.key === key);
  const setLevel = (key: CondKey, level: "" | CondLevel) => {
    const rest = value.filter((c) => c.key !== key);
    if (!level) return onChange(rest);
    const prev = get(key);
    onChange([...rest, { key, level, ...(key === "years" ? { years: prev?.years ?? 3 } : {}) }]);
  };
  const setYears = (n: number) => onChange(value.map((c) => (c.key === "years" ? { ...c, years: n } : c)));
  return (
    <div className="form-field">
      <label>必須・歓迎の条件（任意）</label>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--color-ink-soft)" }}>
        決めている条件だけ選んでください。応募する講師は、選んだ条件ごとに「可・不可・要相談」を答えます。
      </p>
      {CONDITION_ITEMS.map((item) => {
        const c = get(item.key);
        return (
          <div key={item.key} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 8px" }}>
            <span style={{ flex: "1 1 160px", fontSize: 13.5 }}>{item.label}</span>
            {item.key === "years" && c && (
              <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <input
                  type="number"
                  aria-label="経験年数"
                  min={1}
                  max={MAX_YEARS}
                  value={c.years ?? ""}
                  onChange={(e) => setYears(Math.max(1, Math.min(MAX_YEARS, Math.floor(Number(e.target.value)) || 1)))}
                  style={{ width: 72 }}
                />
                年以上
              </span>
            )}
            <Select aria-label={`${item.label}の指定`} value={c?.level ?? ""} onChange={(e) => setLevel(item.key, e.target.value as "" | CondLevel)} style={{ flex: "0 1 140px" }}>
              {(Object.keys(LEVEL_TEXT) as ("" | CondLevel)[]).map((k) => (
                <option key={k || "none"} value={k}>
                  {LEVEL_TEXT[k]}
                </option>
              ))}
            </Select>
          </div>
        );
      })}
    </div>
  );
}

type SkillTarget = { kind: SkillKind; name: string };

/** 分野・ツールの条件 (#60): for the request's field and each ticked tool: 指定しない / 必須 / 歓迎, minimum years and 登壇実績. */
function SkillConditionsForm({ targets, value, onChange }: { targets: SkillTarget[]; value: Condition[]; onChange: (v: Condition[]) => void }) {
  if (targets.length === 0) return null;
  const find = (t: SkillTarget) => value.find((c) => c.key === "skill" && c.kind === t.kind && c.name === t.name);
  const replace = (t: SkillTarget, next: Condition | null) => {
    const rest = value.filter((c) => !(c.key === "skill" && c.kind === t.kind && c.name === t.name));
    onChange(next ? [...rest, next] : rest);
  };
  const setLevel = (t: SkillTarget, level: "" | CondLevel) => {
    if (!level) return replace(t, null);
    const prev = find(t);
    replace(t, { key: "skill", level, kind: t.kind, name: t.name, ...(prev?.years ? { years: prev.years } : {}), ...(prev?.spoke ? { spoke: true } : {}) });
  };
  const patch = (t: SkillTarget, p: Partial<Condition>) => {
    const c = find(t);
    if (!c) return;
    const next = { ...c, ...p };
    if (!next.years) delete next.years;
    if (!next.spoke) delete next.spoke;
    replace(t, next);
  };
  return (
    <div className="form-field">
      <label>分野・ツールの条件（任意）</label>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--color-ink-soft)" }}>
        この依頼の分野と、選んだツールについて、経験年数や登壇実績を求められます。講師が登録した内容と照らし合わせて「確認済み・未確認・不一致」が表示されます。
      </p>
      {targets.map((t) => {
        const c = find(t);
        return (
          <div key={`${t.kind}:${t.name}`} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 8px" }}>
            <span style={{ flex: "1 1 160px", fontSize: 13.5, overflowWrap: "anywhere" }}>
              {t.name}
              <span style={{ marginLeft: 6, fontSize: 11.5, color: "var(--color-ink-soft)" }}>{t.kind === "field" ? "分野" : "ツール"}</span>
            </span>
            {c && (
              <>
                <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input
                    type="number"
                    aria-label={`${t.name}の経験年数`}
                    min={1}
                    max={MAX_YEARS}
                    placeholder="任意"
                    value={c.years ?? ""}
                    onChange={(e) => patch(t, { years: e.target.value === "" ? undefined : Math.max(1, Math.min(MAX_YEARS, Math.floor(Number(e.target.value)) || 1)) })}
                    style={{ width: 72 }}
                  />
                  年以上
                </span>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={c.spoke === true} onChange={(e) => patch(t, { spoke: e.target.checked })} />
                  登壇実績
                </label>
              </>
            )}
            <Select aria-label={`${t.name}の指定`} value={c?.level ?? ""} onChange={(e) => setLevel(t, e.target.value as "" | CondLevel)} style={{ flex: "0 1 140px" }}>
              {(Object.keys(LEVEL_TEXT) as ("" | CondLevel)[]).map((k) => (
                <option key={k || "none"} value={k}>
                  {LEVEL_TEXT[k]}
                </option>
              ))}
            </Select>
          </div>
        );
      })}
    </div>
  );
}
