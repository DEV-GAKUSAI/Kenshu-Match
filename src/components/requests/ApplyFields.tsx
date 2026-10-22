"use client";
import { Select } from "@/components/ui/Select";

export type ApplyValue = { allDays: "" | "all" | "partial" | "none"; role: string; experience: string; materials: "" | "existing" | "create" | "either" };

export const EMPTY_APPLY: ApplyValue = { allDays: "", role: "", experience: "", materials: "" };

/** The fixed items sent with an application (#54). */
export function applyPayload(v: ApplyValue) {
  return {
    apply_all_days: v.allDays || null,
    apply_role: v.role.trim() || null,
    apply_experience: v.experience.trim() || null,
    apply_materials: v.materials || null,
  };
}

export const ALL_DAYS_TEXT = { all: "全日程OK", partial: "一部の日程のみ", none: "日程は要相談" } as const;
export const MATERIALS_TEXT = { existing: "既存の教材を使う", create: "教材を新しく作る", either: "どちらも可" } as const;

/** 応募内容の定型項目: 全日程の可否・希望職種・関連実績・教材対応. All optional. */
export function ApplyFields({ value, onChange, roleOptions }: { value: ApplyValue; onChange: (v: ApplyValue) => void; roleOptions?: string[] }) {
  const set = (patch: Partial<ApplyValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className="form-row">
        <div className="form-field">
          <label>
            全日程への対応<span className="field-optional">任意</span>
          </label>
          <Select value={value.allDays} onChange={(e) => set({ allDays: e.target.value as ApplyValue["allDays"] })}>
            <option value="">選ばない</option>
            <option value="all">{ALL_DAYS_TEXT.all}</option>
            <option value="partial">{ALL_DAYS_TEXT.partial}</option>
            <option value="none">{ALL_DAYS_TEXT.none}</option>
          </Select>
        </div>
        <div className="form-field">
          <label>
            教材の対応<span className="field-optional">任意</span>
          </label>
          <Select value={value.materials} onChange={(e) => set({ materials: e.target.value as ApplyValue["materials"] })}>
            <option value="">選ばない</option>
            <option value="existing">{MATERIALS_TEXT.existing}</option>
            <option value="create">{MATERIALS_TEXT.create}</option>
            <option value="either">{MATERIALS_TEXT.either}</option>
          </Select>
        </div>
      </div>
      <div className="form-field">
        <label>
          希望する役割・職種
          {roleOptions && roleOptions.length > 0 ? <span className="field-optional" style={{ color: "var(--color-danger, #c0392b)" }}>必須</span> : <span className="field-optional">任意</span>}
        </label>
        {roleOptions && roleOptions.length > 0 ? (
          <Select value={value.role} onChange={(e) => set({ role: e.target.value })}>
            <option value="">選んでください</option>
            {roleOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        ) : (
          <input type="text" maxLength={100} placeholder="例：メイン講師、サブ講師" value={value.role} onChange={(e) => set({ role: e.target.value })} />
        )}
      </div>
      <div className="form-field">
        <label>
          関連する実績<span className="field-optional">任意</span>
        </label>
        <textarea rows={2} maxLength={1000} placeholder="例：同じテーマの研修を20回以上実施" value={value.experience} onChange={(e) => set({ experience: e.target.value })} />
      </div>
    </>
  );
}
