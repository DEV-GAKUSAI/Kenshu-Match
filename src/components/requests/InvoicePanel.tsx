"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { BANK_TYPES, RECEIPT_MAX_FILES, bankError, normalizeBank, normalizeReceipts, receiptError, registrationError, sizeLabel, skippedRows, toHalfWidth, type Receipt } from "@/lib/requests/invoice-calc";
import { getInvoiceForResponse, getLastInvoiceDetails, INVOICE_STATUS_TEXT, respondInvoice, submitInvoice, uploadReceipt, type InvoiceRow } from "@/lib/requests/invoices";
import { getOrderDefaults, getOrderForResponse } from "@/lib/requests/orders";
import { normalizeItems, type OrderItem } from "@/lib/requests/order-calc";

const INVOICE_RETURN_REASONS = ["金額が違う", "追加費用の内容が不明", "時間数・日数が違う", "税の扱いが違う"];

/** 請求書: the decided instructor submits it, the company confirms, returns or marks it paid (#52). */
export function InvoicePanel({ responseId, role }: { responseId: string; role: "requester" | "instructor" }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [inv, setInv] = useState<InvoiceRow | null>(null);
  const [orderDeclined, setOrderDeclined] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [extra, setExtra] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [termsHint, setTermsHint] = useState("");
  const [unit, setUnit] = useState<string | null>(null);
  // The confirmed order's cost rows, and which of them (0-based) are left off this invoice (#44).
  const [orderRows, setOrderRows] = useState<OrderItem[]>([]);
  const [skip, setSkip] = useState<number[]>([]);
  const [bank, setBank] = useState({ bank: "", branch: "", type: "普通", number: "", holder: "" });
  const [regNo, setRegNo] = useState("");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reason, setReason] = useState("");
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const i = await getInvoiceForResponse(responseId);
    setInv(i);
    const o = await getOrderForResponse(responseId);
    setOrderDeclined(o?.status === "declined");
    const rows = o?.status === "confirmed" ? normalizeItems(o.items) : [];
    setOrderRows(rows);
    setSkip(i ? skippedRows(rows, i.items) : []);
    setDueDate(i?.due_date ?? "");
    setReceipts(normalizeReceipts(i?.receipts));
    if (role === "instructor") {
      const d = await getOrderDefaults(responseId);
      setTermsHint((o?.payment_terms ?? d.paymentTerms ?? "").trim());
      // First invoice: start from the last one's 振込先 and 登録番号. Later versions keep their own values.
      let b = normalizeBank(i?.bank_info);
      let r = i?.registration_no ?? "";
      if (!i && user) {
        const last = await getLastInvoiceDetails(user.id, responseId);
        b = last.bank;
        r = last.registrationNo ?? "";
      }
      setBank({ bank: b?.bank ?? "", branch: b?.branch ?? "", type: b?.type || "普通", number: b?.number ?? "", holder: b?.holder ?? "" });
      setRegNo(r);
    }
    // The first invoice starts from the 数量 on the order.
    setQty(i?.quantity ? String(i.quantity) : !i && o?.main_qty ? String(o.main_qty) : "");
    setUnit(i?.amount_unit ?? o?.amount_unit ?? null);
    setExtra(i?.extra_amount ? String(i.extra_amount) : "");
    setExtraNote(i?.extra_note ?? "");
    setNote(i?.note ?? "");
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state only after awaiting
    void load();
    const onOrderChanged = () => void load();
    window.addEventListener("kl-order-changed", onOrderChanged);
    return () => window.removeEventListener("kl-order-changed", onOrderChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseId, user?.id]);

  if (!loaded) return null;
  if (role === "requester" && !inv) return null;

  async function submit() {
    const n = extra.trim() === "" ? null : Number(extra);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return showToast("追加費用は0以上の数字で入力してください。");
    const q = qty.trim() === "" ? null : Number(qty);
    if (q !== null && (!Number.isFinite(q) || q <= 0)) return showToast("時間数・日数は0より大きい数字で入力してください。");
    if ((unit === "hour" || unit === "day") && q === null) return showToast(`${unit === "hour" ? "時間数" : "日数"}を入力してください（金額が「${unit === "hour" ? "時間" : "1日"}あたり」のため）。`);
    if (!dueDate) return showToast("支払期限の日付を入力してください。");
    const b = normalizeBank({ ...bank, number: toHalfWidth(bank.number).replace(/[-\s]/g, "") });
    const be = bankError(b);
    if (be) return showToast(be);
    const reg = toHalfWidth(regNo).trim();
    const re = registrationError(reg);
    if (re) return showToast(re);
    setBusy(true);
    const { error } = await submitInvoice(responseId, n, extraNote.trim() || null, note.trim() || null, q, { dueDate, bank: b, registrationNo: reg || null, receipts, skipItems: skip });
    setBusy(false);
    if (error) return showToast(error.message);
    showToast(inv ? "請求書を修正して再提出しました。" : "請求書を提出しました。");
    setOpen(false);
    await load();
  }

  async function addReceipts(files: FileList | null) {
    if (!files || !files.length) return;
    let list = receipts;
    setUploading(true);
    for (const f of Array.from(files)) {
      const problem = receiptError({ name: f.name, size: f.size, type: f.type }, list.length);
      if (problem) {
        showToast(problem);
        break;
      }
      const { receipt, error } = await uploadReceipt(responseId, f);
      if (error || !receipt) {
        showToast(error ?? "アップロードできませんでした。");
        break;
      }
      list = [...list, receipt];
      setReceipts(list);
    }
    setUploading(false);
  }

  async function respond(action: "confirm" | "return" | "paid") {
    if (!inv) return;
    if (action === "return" && !reason.trim()) return showToast("差し戻しの理由を入力してください。");
    setBusy(true);
    const { error } = await respondInvoice(inv.invoice_id, action, action === "return" ? reason.trim() : null);
    setBusy(false);
    if (error) return showToast(error.message);
    showToast(action === "confirm" ? "請求書を確認しました。" : action === "paid" ? "支払い済みにしました。" : "請求書を差し戻しました。");
    setReturning(false);
    setReason("");
    await load();
  }

  // A declined order has to be re-issued (and confirmed) before the first invoice (#51 test finding).
  const canEdit = role === "instructor" && (inv ? inv.status === "submitted" || inv.status === "returned" : !orderDeclined);

  return (
    <div className="request-card__response" style={{ marginTop: 14 }}>
      <strong>請求書</strong>
      {inv ? (
        <div style={{ fontSize: 13 }}>
          {inv.invoice_no}（第{inv.revision}版）　{INVOICE_STATUS_TEXT[inv.status]}
          {inv.due_date && <div>支払期限：{inv.due_date.replace(/-/g, "/")}</div>}
          {normalizeReceipts(inv.receipts).length > 0 && <div>領収書：{normalizeReceipts(inv.receipts).length}件添付</div>}
          {inv.status === "returned" && inv.return_reason && <div style={{ color: "var(--color-danger, #c0392b)" }}>理由：{inv.return_reason}</div>}
        </div>
      ) : role === "instructor" && orderDeclined ? (
        <div style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>注文書を辞退しているため、請求書は提出できません。企業が注文書を再発行したら、内容を確認してください。</div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>研修のあとに請求書を提出できます。金額は決定した見積り（または注文書）から自動で入ります。</div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {inv && (
          <Link href={`/invoice?id=${inv.invoice_id}`} target="_blank" className="btn btn--ghost btn--sm">
            請求書を開く
          </Link>
        )}
        {canEdit && (
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => setOpen((v) => !v)}>
            {inv ? "修正して再提出する" : "請求書を提出する"}
          </button>
        )}
        {role === "requester" && inv?.status === "submitted" && (
          <>
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => respond("confirm")}>
              内容を確認した
            </button>
            <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => setReturning((v) => !v)}>
              差し戻す
            </button>
          </>
        )}
        {role === "requester" && inv?.status === "confirmed" && (
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => respond("paid")}>
            支払い済みにする
          </button>
        )}
      </div>
      {returning && role === "requester" && (
        <div className="inline-quote-form is-open" style={{ marginTop: 10 }}>
          <div className="form-field">
            <label>差し戻しの理由</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {INVOICE_RETURN_REASONS.map((text) => (
                <button key={text} type="button" className="btn btn--ghost btn--sm" onClick={() => setReason(text)}>
                  {text}
                </button>
              ))}
            </div>
            <textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => respond("return")}>
            この理由で差し戻す
          </button>
        </div>
      )}
      {open && canEdit && (
        <div className="inline-quote-form is-open" style={{ marginTop: 10 }}>
          <div className="form-field">
            <label>時間数・日数（「時間あたり」「1日あたり」の見積りのとき）</label>
            <input type="number" min={0} step="any" inputMode="decimal" placeholder="例：7（時間または日）" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="form-field">
            <label>追加費用（円・任意）</label>
            <input type="number" min={0} inputMode="numeric" placeholder="例：交通費 5000" value={extra} onChange={(e) => setExtra(e.target.value)} />
            <small style={{ color: "var(--color-ink-soft)" }}>注文書にない費用（交通費など）を入れるときに使います。</small>
          </div>
          {orderRows.length > 0 && (
            <div className="form-field">
              <label>注文書の費用項目</label>
              <small style={{ color: "var(--color-ink-soft)", display: "block", marginBottom: 6 }}>注文書の内容です。実際にかからなかった項目は、チェックを外してください（請求書に入りません）。</small>
              {orderRows.map((row, idx) => {
                const on = !skip.includes(idx);
                return (
                  <label key={idx} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, marginBottom: 4 }}>
                    <input type="checkbox" checked={on} onChange={() => setSkip(on ? [...skip, idx] : skip.filter((x) => x !== idx))} />
                    <span>
                      {row.name}　{row.qty}×¥{row.unit_price.toLocaleString("ja-JP")}＝¥{Math.round(row.qty * row.unit_price).toLocaleString("ja-JP")}
                      {on ? "" : "（請求書に入れません）"}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="form-field">
            <label>追加費用の内容</label>
            <input type="text" maxLength={500} placeholder="例：新幹線代" value={extraNote} onChange={(e) => setExtraNote(e.target.value)} />
          </div>
          <div className="form-field">
            <label>支払期限</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            {termsHint && <small style={{ color: "var(--color-ink-soft)" }}>依頼・注文書の支払条件：{termsHint}</small>}
          </div>
          <div className="form-field">
            <label>振込先（次回から自動で入ります）</label>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <input type="text" maxLength={50} placeholder="銀行名" aria-label="銀行名" value={bank.bank} onChange={(e) => setBank({ ...bank, bank: e.target.value })} />
              <input type="text" maxLength={50} placeholder="支店名" aria-label="支店名" value={bank.branch} onChange={(e) => setBank({ ...bank, branch: e.target.value })} />
              <select aria-label="口座の種別" value={bank.type} onChange={(e) => setBank({ ...bank, type: e.target.value })}>
                {BANK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input type="text" inputMode="numeric" maxLength={10} placeholder="口座番号（数字）" aria-label="口座番号" value={bank.number} onChange={(e) => setBank({ ...bank, number: e.target.value })} />
              <input type="text" maxLength={60} placeholder="口座名義（カナ）" aria-label="口座名義" value={bank.holder} onChange={(e) => setBank({ ...bank, holder: e.target.value })} />
            </div>
          </div>
          <div className="form-field">
            <label>インボイス登録番号（任意）</label>
            <input type="text" maxLength={14} placeholder="例：T1234567890123" value={regNo} onChange={(e) => setRegNo(e.target.value)} />
          </div>
          <div className="form-field">
            <label>領収書の添付（任意・PDF／JPG／PNG・1ファイル4MBまで・{RECEIPT_MAX_FILES}件まで）</label>
            {receipts.map((r) => (
              <div key={r.path} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 4 }}>
                <span>
                  {r.name}（{sizeLabel(r.size)}）
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReceipts(receipts.filter((x) => x.path !== r.path))}>
                  外す
                </button>
              </div>
            ))}
            {receipts.length < RECEIPT_MAX_FILES && (
              <input
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png"
                disabled={uploading}
                onChange={(e) => {
                  const el = e.currentTarget;
                  void addReceipts(el.files).then(() => {
                    el.value = "";
                  });
                }}
              />
            )}
            {uploading && <small>アップロード中…</small>}
          </div>
          <div className="form-field">
            <label>備考</label>
            <textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy || uploading} onClick={submit}>
            {inv ? "この内容で再提出する" : "この内容で提出する"}
          </button>
        </div>
      )}
    </div>
  );
}
