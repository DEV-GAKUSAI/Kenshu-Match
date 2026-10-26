"use client";

import { useState } from "react";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import { amountError, MAX_AMOUNT, normalUnit, UNIT_OPTIONS } from "@/lib/requests/money";
import { reviseQuote, withdrawResponse } from "@/lib/requests/instructor-responses";
import type { InstructorResponseRow } from "@/types/database";
import { Select } from "@/components/ui/Select";

/**
 * #62: the instructor changes the quote or withdraws the application, only while the
 * company has not decided yet. After that nothing is shown (the server refuses too).
 */
export function ResponseManage({
  response,
  request,
  onChanged,
}: {
  response: InstructorResponseRow;
  request: { status: string; budget_unit?: string | null };
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(response.quote_price ? String(response.quote_price) : "");
  const [tax, setTax] = useState<"" | "included" | "excluded">(response.quote_tax_mode ?? "");
  const [message, setMessage] = useState(response.message ?? "");
  const [busy, setBusy] = useState(false);

  const editable = request.status === "pending" && !response.is_selected && (response.action === "accept" || response.action === "quote");
  if (!editable) return null;

  async function save() {
    const n = Number(price);
    const priceErr = amountError(n, "見積り金額");
    if (priceErr) return showToast(priceErr);
    setBusy(true);
    const { error } = await reviseQuote(response.response_id, n, tax || null, message.trim() || null);
    setBusy(false);
    if (error) return showToast(error.message);
    showToast("見積りを変更しました。企業に新しい内容が届きます。");
    setOpen(false);
    onChanged();
  }

  async function withdraw() {
    const { ok } = await confirm({
      title: "応募を取り下げますか？",
      message: "取り下げると、この案件には応募していない状態になります。企業側には取り下げの記録が残ります。",
      confirmLabel: "取り下げる",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await withdrawResponse(response.response_id);
    setBusy(false);
    if (error) return showToast(error.message);
    showToast("応募を取り下げました。");
    onChanged();
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setOpen((v) => !v)}>
          {open ? "変更をやめる" : "見積りを変更する"}
        </button>
        <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={withdraw}>
          応募を取り下げる
        </button>
      </div>
      {open && (
        <div className="inline-quote-form is-open" style={{ marginTop: 10 }}>
          <div className="form-field">
            <label>見積り金額（{UNIT_OPTIONS.find((o) => o.value === normalUnit(request.budget_unit))?.label}・円）</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min={1} max={MAX_AMOUNT} step={1} value={price} onChange={(e) => setPrice(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
              <Select aria-label="税" value={tax} onChange={(e) => setTax(e.target.value as "" | "included" | "excluded")} style={{ flex: "0 0 120px" }}>
                <option value="">税の指定なし</option>
                <option value="included">税込</option>
                <option value="excluded">税別</option>
              </Select>
            </div>
          </div>
          <div className="form-field">
            <label>メッセージ</label>
            <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={save}>
            この内容に変更する
          </button>
        </div>
      )}
    </div>
  );
}
