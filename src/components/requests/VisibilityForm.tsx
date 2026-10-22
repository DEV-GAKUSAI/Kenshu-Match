"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Select } from "@/components/ui/Select";
import { getInstructorNames } from "@/lib/instructor/profile";
import { getBookEntries } from "@/lib/requester/book";
import { VISIBILITY_HINT, VISIBILITY_TEXT, type Visibility } from "@/lib/requests/visibility";

export type VisibilityValue = { visibility: Visibility; invited: string[] };

/** 公開範囲 (#46): 一般公開 / 登録講師限定 / 招待限定. Invites are picked from the company's 講師台帳. */
export function VisibilityForm({ value, onChange }: { value: VisibilityValue; onChange: (v: VisibilityValue) => void }) {
  const [people, setPeople] = useState<{ id: string; name: string }[] | null>(null);

  useEffect(() => {
    if (value.visibility !== "invited" || people) return;
    let alive = true;
    (async () => {
      const rows = (await getBookEntries()).filter((e) => !!e.instructor_id);
      const ids = rows.map((e) => e.instructor_id as string);
      // Instructors already invited stay in the list even if they are no longer in the book.
      const all = [...new Set([...ids, ...value.invited])];
      const names = await getInstructorNames(all);
      if (!alive) return;
      setPeople(all.map((id) => ({ id, name: names[id]?.name ?? "（名前未設定）" })));
    })();
    return () => {
      alive = false;
    };
  }, [value.visibility, value.invited, people]);

  const toggle = (id: string) =>
    onChange({ ...value, invited: value.invited.includes(id) ? value.invited.filter((x) => x !== id) : [...value.invited, id] });

  return (
    <div className="form-field">
      <label htmlFor="reqVisibility">公開範囲</label>
      <Select id="reqVisibility" value={value.visibility} onChange={(e) => onChange({ ...value, visibility: e.target.value as Visibility })}>
        {(Object.keys(VISIBILITY_TEXT) as Visibility[]).map((k) => (
          <option key={k} value={k}>
            {VISIBILITY_TEXT[k]}
          </option>
        ))}
      </Select>
      <p className="form-field__hint">{VISIBILITY_HINT[value.visibility]}</p>
      {value.visibility === "invited" && (
        <div style={{ marginTop: 8 }}>
          {people === null ? (
            <p className="form-field__hint">読み込み中…</p>
          ) : people.length === 0 ? (
            <p className="form-field__hint">
              招待できる講師がいません。先に<Link href="/my-instructors">自社の講師台帳</Link>に講師を登録してください。
            </p>
          ) : (
            <div className="multi-select__panel" style={{ position: "static", maxHeight: 220, overflowY: "auto", display: "grid", gap: 8, padding: "10px 14px", border: "1px solid var(--color-border, #dbe7e2)", borderRadius: 12, background: "#fff" }}>
              {people.map((p) => (
                <label key={p.id} className="multi-select__option">
                  <input type="checkbox" checked={value.invited.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name}
                </label>
              ))}
            </div>
          )}
          <p className="form-field__hint">招待した講師には通知が届きます。</p>
        </div>
      )}
    </div>
  );
}
