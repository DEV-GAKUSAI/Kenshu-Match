"use client";

import { useState } from "react";
import { MAX_SLOTS, ROLE_PRESETS, cleanSlots, newSlotId, slotsSummary, type RoleSlot } from "@/lib/requests/roles";

export type RolesFormValue = { id: string; name: string; headcount: string }[];
export const EMPTY_ROLES: RolesFormValue = [];

export function rolesToForm(slots: RoleSlot[]): RolesFormValue {
  return slots.map((s) => ({ id: s.id, name: s.name, headcount: String(s.headcount) }));
}

/** What is saved on the request (empty list = single-instructor request). */
export function rolesPayload(v: RolesFormValue) {
  return { role_slots: cleanSlots(v) };
}

/** 募集職種・人数（任意）: a closed row; open it to add roles such as メイン講師 ×1 and サブ講師 ×2. */
export function RolesForm({
  value,
  onChange,
  decided,
}: {
  value: RolesFormValue;
  onChange: (v: RolesFormValue) => void;
  /** slot id → how many are already decided (editing): such a slot cannot be removed or go below that number. */
  decided?: Record<string, number>;
}) {
  const [open, setOpen] = useState(value.length > 0);
  const summary = slotsSummary(cleanSlots(value));

  function add(name: string) {
    if (value.length >= MAX_SLOTS) return;
    onChange([...value, { id: newSlotId(), name, headcount: "1" }]);
    setOpen(true);
  }
  function patch(id: string, p: Partial<{ name: string; headcount: string }>) {
    onChange(value.map((r) => (r.id === id ? { ...r, ...p } : r)));
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
          <strong style={{ fontSize: 13.5, flex: "none" }}>募集職種・人数（任意）</strong>
          {!open && <span style={{ fontSize: 12.5, color: "var(--color-ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary || "メイン講師1名＋サブ講師2名 など"}</span>}
          <span aria-hidden style={{ marginLeft: "auto", flex: "none", color: "#17B08A", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div style={{ padding: "10px 12px 12px", borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-ink-soft)" }}>
              職種ごとに必要な人数を設定します。1名決まっても、残りの枠は募集を続けられます。入力しない場合は、講師1名の依頼になります。
            </p>
            {value.map((r) => {
              const taken = decided?.[r.id] ?? 0;
              return (
                <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="text" maxLength={30} placeholder="職種（例：メイン講師）" aria-label="職種" value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} style={{ flex: "1 1 160px", minWidth: 0 }} />
                  <input
                    type="number"
                    min={Math.max(1, taken)}
                    max={50}
                    aria-label="募集人数"
                    value={r.headcount}
                    onChange={(e) => patch(r.id, { headcount: e.target.value })}
                    style={{ flex: "0 0 80px" }}
                  />
                  <span style={{ fontSize: 13 }}>名</span>
                  {taken > 0 ? (
                    <span style={{ fontSize: 12, color: "var(--color-ink-soft)" }}>決定済み {taken}名</span>
                  ) : (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(value.filter((x) => x.id !== r.id))}>
                      削除
                    </button>
                  )}
                </div>
              );
            })}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ROLE_PRESETS.map((p) => (
                <button key={p} type="button" className="btn btn--ghost btn--sm" onClick={() => add(p)} disabled={value.length >= MAX_SLOTS}>
                  ＋ {p}
                </button>
              ))}
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => add("")} disabled={value.length >= MAX_SLOTS}>
                ＋ その他の職種
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
