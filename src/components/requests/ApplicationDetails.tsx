"use client";

import { ALL_DAYS_TEXT, MATERIALS_TEXT, PREP_TEXT } from "@/components/requests/ApplyFields";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/requests/money";
import { applyDiff } from "@/lib/requests/apply-diff";
import { getResponseChanges, type ResponseChange } from "@/lib/requests/instructor-responses";
import type { InstructorResponseRow } from "@/types/database";

const box = { margin: "0 0 12px", background: "#fff", border: "1px solid var(--color-border)", borderRadius: "var(--radius-s)", overflow: "hidden" } as const;
const boxTitle = { padding: "8px 12px", fontSize: 12.5, fontWeight: 700, color: "var(--color-ink)", background: "#F6FBF9", borderBottom: "1px solid var(--color-border)" } as const;
const row = { display: "flex", gap: 12, padding: "8px 12px", fontSize: 13.5, borderTop: "1px solid var(--color-border)", alignItems: "baseline" } as const;
const rowLabel = { flex: "0 0 112px", fontSize: 12.5, color: "var(--color-ink-soft)" } as const;

/** 応募内容 as labelled rows (全日程への対応・役割・教材・実績). Nothing is shown when no item was filled in. */
export function ApplyItemsBox({ response }: { response: InstructorResponseRow }) {
  const items: [string, string][] = [];
  if (response.apply_all_days) items.push(["全日程への対応", ALL_DAYS_TEXT[response.apply_all_days]]);
  if (response.apply_role) items.push(["希望する役割", response.apply_role]);
  if (response.apply_materials) items.push(["教材の対応", MATERIALS_TEXT[response.apply_materials]]);
  if (response.apply_prep) items.push(["事前研修への参加", PREP_TEXT[response.apply_prep]]);
  if (response.apply_experience) items.push(["関連する実績", response.apply_experience]);
  if (items.length === 0) return null;
  return (
    <div style={box}>
      <div style={boxTitle}>応募内容</div>
      {items.map(([label, value], i) => (
        <div key={label} style={{ ...row, borderTop: i === 0 ? 0 : row.borderTop }}>
          <span style={rowLabel}>{label}</span>
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

const KIND_LABEL: Record<ResponseChange["kind"], string> = { revised: "見積り変更", withdrawn: "取り下げ", reapplied: "再応募" };

/** 見積りの変更履歴: newest first; the newest price is highlighted. */
export function QuoteHistoryBox({ changes, response }: { changes: ResponseChange[]; response: InstructorResponseRow }) {
  if (changes.length === 0) return null;
  return (
    <div style={box}>
      <div style={boxTitle}>見積りの変更履歴</div>
      {changes.map((c, i) => (
        <div key={c.change_id} style={{ ...row, borderTop: i === 0 ? 0 : row.borderTop, background: i === 0 ? "#F1FAF6" : undefined, flexWrap: "wrap" }}>
          <span style={{ ...rowLabel, flex: "0 0 112px" }}>
            {new Date(c.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-ink-soft)" }}>{KIND_LABEL[c.kind]}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            {c.kind === "withdrawn" ? (
              <span style={{ color: "var(--color-ink-soft)" }}>{c.old_price ? formatMoney(c.old_price, response.quote_unit, null) : "承諾のみ"} で応募していました</span>
            ) : (
              <>
                {c.kind === "revised" && c.old_price !== c.new_price && (
                  <span style={{ color: "var(--color-ink-soft)", textDecoration: "line-through" }}>{c.old_price ? formatMoney(c.old_price, response.quote_unit, null) : "承諾のみ"}</span>
                )}
                {c.kind === "revised" && c.old_price !== c.new_price && <span style={{ margin: "0 6px", color: "var(--color-ink-soft)" }}>→</span>}
                <strong style={{ fontSize: 15, color: "#0F7A5F" }}>{c.new_price ? formatMoney(c.new_price, response.quote_unit, response.quote_tax_mode) : "承諾のみ"}</strong>
                {c.kind === "revised" && c.old_price === c.new_price && <span style={{ marginLeft: 6, fontSize: 12, color: "var(--color-ink-soft)" }}>（金額は変更なし）</span>}
                {c.kind === "revised" && (c.old_message ?? "") !== (c.new_message ?? "") && (
                  <div style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 2 }}>メッセージを更新しました</div>
                )}
                {c.kind === "revised" &&
                  c.new_apply &&
                  applyDiff(c.old_apply, c.new_apply).map((d) => (
                    <div key={d.label} style={{ fontSize: 12.5, marginTop: 2 }}>
                      <span style={{ color: "var(--color-ink-soft)" }}>{d.label}：</span>
                      <span style={{ color: "var(--color-ink-soft)", textDecoration: "line-through" }}>{d.before}</span>
                      <span style={{ margin: "0 4px", color: "var(--color-ink-soft)" }}>→</span>
                      <strong>{d.after}</strong>
                    </div>
                  ))}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The instructor's own view of what they sent: application items and the quote history. */
export function MyResponseDetails({ response }: { response: InstructorResponseRow }) {
  const [changes, setChanges] = useState<ResponseChange[]>([]);
  useEffect(() => {
    let alive = true;
    getResponseChanges(response.response_id).then((c) => alive && setChanges(c));
    return () => {
      alive = false;
    };
  }, [response.response_id, response.action, response.quote_price]);
  return (
    <div style={{ marginTop: 12 }}>
      <ApplyItemsBox response={response} />
      <QuoteHistoryBox changes={changes} response={response} />
    </div>
  );
}
