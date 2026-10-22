"use client";

import { useEffect, useState } from "react";
import { DETAIL_GROUPS, summarizeChosen, type DetailGroupKey, type DetailOption } from "@/lib/requests/detail-options";
import { loadDetailOptions } from "@/lib/requests/detail-options-load";

export type DetailConditionsValue = { optionIds: string[]; otherTools: string };

/** The ids to save: 対象資格 only counts when 資格対策あり is chosen. */
export function cleanOptionIds(ids: readonly string[], options: readonly DetailOption[]): string[] {
  const byId = new Map(options.map((o) => [o.id, o]));
  const prepYes = ids.some((id) => {
    const o = byId.get(id);
    return o?.group_key === "cert_prep" && o.name === "資格対策あり";
  });
  return ids.filter((id) => {
    const o = byId.get(id);
    if (!o) return false;
    return o.group_key !== "cert" || prepYes;
  });
}

/** 詳細条件（任意）: a closed row that opens to tick-tags per group. */
export function DetailConditionsForm({ value, onChange }: { value: DetailConditionsValue; onChange: (v: DetailConditionsValue) => void }) {
  const [options, setOptions] = useState<DetailOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    loadDetailOptions().then((o) => alive && setOptions(o));
    return () => {
      alive = false;
    };
  }, []);

  if (options.length === 0) return null; // catalogue not available (e.g. SQL not run yet): hide the whole part

  const chosen = new Set(value.optionIds);
  const prepYes = options.some((o) => o.group_key === "cert_prep" && o.name === "資格対策あり" && chosen.has(o.id));
  const summary = summarizeChosen(cleanOptionIds(value.optionIds, options), options, value.otherTools);

  function toggle(group: DetailGroupKey, single: boolean, opt: DetailOption) {
    const inGroup = options.filter((o) => o.group_key === group).map((o) => o.id);
    let next: string[];
    if (chosen.has(opt.id)) {
      next = value.optionIds.filter((id) => id !== opt.id);
    } else if (single) {
      next = [...value.optionIds.filter((id) => !inGroup.includes(id)), opt.id];
    } else if (group === "industry") {
      // 業界指定なし excludes the other industries
      const none = options.find((o) => o.group_key === "industry" && o.name === "業界指定なし");
      next = opt.id === none?.id ? [...value.optionIds.filter((id) => !inGroup.includes(id)), opt.id] : [...value.optionIds.filter((id) => id !== none?.id), opt.id];
    } else {
      next = [...value.optionIds, opt.id];
    }
    onChange({ ...value, optionIds: cleanOptionIds(next, options) });
  }

  return (
    <div className="form-field">
      <div style={{ background: "#fff", border: open ? "1.5px solid #5FD0AA" : "1px solid var(--color-border)", borderRadius: "var(--radius-s)" }}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: 0, font: "inherit", textAlign: "left", cursor: "pointer", color: "var(--color-ink)" }}
        >
          <strong style={{ fontSize: 13.5, flex: "none" }}>詳細条件（任意）</strong>
          {!open && (
            <span style={{ fontSize: 12.5, color: "var(--color-ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary || "対象者・ツール・レベルなど"}</span>
          )}
          <span aria-hidden style={{ marginLeft: "auto", flex: "none", color: "#17B08A", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div style={{ padding: "4px 12px 12px", borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 14 }}>
            {DETAIL_GROUPS.filter((g) => g.key !== "cert" || prepYes).map((g) => (
              <div key={g.key} style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                  {g.label}
                  <span style={{ fontWeight: 400, color: "var(--color-ink-soft)", marginLeft: 6 }}>{g.single ? "1つ選択" : "複数選択可"}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {options
                    .filter((o) => o.group_key === g.key)
                    .map((o) => {
                      const on = chosen.has(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(g.key, g.single, o)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 99,
                            fontSize: 13,
                            cursor: "pointer",
                            border: on ? "1.5px solid #17B08A" : "1px solid var(--color-border)",
                            background: on ? "#E8F7F1" : "#fff",
                            color: on ? "#0F7A5F" : "var(--color-ink)",
                            fontWeight: on ? 700 : 400,
                          }}
                        >
                          {o.name}
                        </button>
                      );
                    })}
                </div>
                {g.key === "tool" && (
                  <input
                    type="text"
                    maxLength={200}
                    placeholder="リストにないツール・製品（任意）"
                    aria-label="その他のツール・製品"
                    value={value.otherTools}
                    onChange={(e) => onChange({ ...value, otherTools: e.target.value })}
                    style={{ marginTop: 8, width: "100%" }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
