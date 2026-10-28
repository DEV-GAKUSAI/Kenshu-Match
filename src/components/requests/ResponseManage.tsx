"use client";

import { useState } from "react";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import { BudgetHint } from "@/components/requests/BudgetHint";
import { amountError, MAX_AMOUNT, normalUnit, UNIT_OPTIONS, type MoneyFields } from "@/lib/requests/money";
import { reviseQuote, saveConditionAnswers, withdrawResponse } from "@/lib/requests/instructor-responses";
import type { InstructorResponseRow } from "@/types/database";
import { Select } from "@/components/ui/Select";
import { ApplyFields, applyPayload, conditionAnswersPayload, type ApplyValue } from "@/components/requests/ApplyFields";
import { answersFor, normalizeConditions } from "@/lib/requests/conditions";
import { normalizeSlots } from "@/lib/requests/roles";

/**
 * #62: the instructor changes the quote and the application answers, or withdraws the application,
 * only while the company has not decided yet. After that nothing is shown (the server refuses too).
 */
export function ResponseManage({
  response,
  request,
  onChanged,
}: {
  response: InstructorResponseRow;
  request: MoneyFields & { status: string; role_slots?: unknown; req_conditions?: unknown };
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(response.quote_price ? String(response.quote_price) : "");
  const [tax, setTax] = useState<"" | "included" | "excluded">(response.quote_tax_mode ?? "");
  const [message, setMessage] = useState(response.message ?? "");
  const [apply, setApply] = useState<ApplyValue>({
    allDays: (response.apply_all_days ?? "") as ApplyValue["allDays"],
    role: response.apply_role ?? "",
    experience: response.apply_experience ?? "",
    materials: (response.apply_materials ?? "") as ApplyValue["materials"],
    prep: (response.apply_prep ?? "") as ApplyValue["prep"],
    answers: answersFor(normalizeConditions(request.req_conditions), response.condition_answers),
  });
  const [busy, setBusy] = useState(false);

  const slotNames = normalizeSlots(request.role_slots).map((x) => x.name);
  const editable = request.status === "pending" && !response.is_selected && (response.action === "accept" || response.action === "quote");
  if (!editable) return null;

  async function save() {
    // An application that already has a price keeps one; an "accept only" application may stay without.
    const hasPrice = price.trim() !== "";
    if (!hasPrice && response.action === "quote") return showToast("見積り金額を入力してください。");
    const n = Number(price);
    if (hasPrice) {
      const priceErr = amountError(n, "見積り金額");
      if (priceErr) return showToast(priceErr);
    }
    if (slotNames.length > 0 && !apply.role) return showToast("希望する役割を選んでください。");
    setBusy(true);
    const conditions = normalizeConditions(request.req_conditions);
    const answers = conditionAnswersPayload(apply, conditions);
    const answersChanged = JSON.stringify(answers) !== JSON.stringify(answersFor(conditions, response.condition_answers));
    let { error } = await reviseQuote(response.response_id, hasPrice ? n : null, tax || null, message.trim() || null, applyPayload(apply));
    // Only the condition answers changed: the quote function reports "no change", the answers are still saved below.
    const onlyAnswers = !!error && error.message === "変更された項目がありません。" && answersChanged;
    if (onlyAnswers) error = null;
    if (!error && answersChanged) ({ error } = await saveConditionAnswers(response.response_id, answers));
    setBusy(false);
    if (error) return showToast(error.message);
    showToast("応募内容を変更しました。企業に新しい内容が届きます。");
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
          {open ? "変更をやめる" : "見積り・応募内容を変更する"}
        </button>
        <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={withdraw}>
          応募を取り下げる
        </button>
      </div>
      {open && (
        <div className="inline-quote-form is-open" style={{ marginTop: 10 }}>
          <div className="form-field">
            <label>
              見積り金額（{UNIT_OPTIONS.find((o) => o.value === normalUnit(request.budget_unit))?.label}・円）
              {response.action !== "quote" && <span className="field-optional">任意</span>}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min={1} max={MAX_AMOUNT} step={1} value={price} onChange={(e) => setPrice(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
              <Select aria-label="税" value={tax} onChange={(e) => setTax(e.target.value as "" | "included" | "excluded")} style={{ flex: "0 0 120px" }}>
                <option value="">税の指定なし</option>
                <option value="included">税込</option>
                <option value="excluded">税別</option>
              </Select>
            </div>
            <BudgetHint request={request} price={price} quoteTax={tax} />
          </div>
          <div className="form-field">
            <label>メッセージ</label>
            <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <ApplyFields value={apply} onChange={setApply} roleOptions={slotNames} conditions={normalizeConditions(request.req_conditions)} />
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--color-ink-soft)" }}>変更した項目は、企業の「見積りの変更履歴」に前の内容と一緒に表示されます。</p>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={save}>
            この内容に変更する
          </button>
        </div>
      )}
    </div>
  );
}
