"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useToast } from "@/components/common/Toast";
import { getInvoiceForResponse, INVOICE_STATUS_TEXT, respondInvoice, submitInvoice, type InvoiceRow } from "@/lib/requests/invoices";

/** 請求書: the decided instructor submits it, the company confirms, returns or marks it paid (#52). */
export function InvoicePanel({ responseId, role }: { responseId: string; role: "requester" | "instructor" }) {
  const { showToast } = useToast();
  const [inv, setInv] = useState<InvoiceRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [extra, setExtra] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const i = await getInvoiceForResponse(responseId);
    setInv(i);
    setQty(i?.quantity ? String(i.quantity) : "");
    setExtra(i?.extra_amount ? String(i.extra_amount) : "");
    setExtraNote(i?.extra_note ?? "");
    setNote(i?.note ?? "");
    setLoaded(true);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseId]);

  if (!loaded) return null;
  if (role === "requester" && !inv) return null;

  async function submit() {
    const n = extra.trim() === "" ? null : Number(extra);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return showToast("追加費用は0以上の数字で入力してください。");
    const q = qty.trim() === "" ? null : Number(qty);
    if (q !== null && (!Number.isFinite(q) || q <= 0)) return showToast("時間数・日数は0より大きい数字で入力してください。");
    setBusy(true);
    const { error } = await submitInvoice(responseId, n, extraNote.trim() || null, note.trim() || null, q);
    setBusy(false);
    if (error) return showToast(error.message);
    showToast(inv ? "請求書を修正して再提出しました。" : "請求書を提出しました。");
    setOpen(false);
    await load();
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

  const canEdit = role === "instructor" && (!inv || inv.status === "submitted" || inv.status === "returned");

  return (
    <div className="request-card__response" style={{ marginTop: 14 }}>
      <strong>請求書</strong>
      {inv ? (
        <div style={{ fontSize: 13 }}>
          {inv.invoice_no}（第{inv.revision}版）　{INVOICE_STATUS_TEXT[inv.status]}
          {inv.status === "returned" && inv.return_reason && <div style={{ color: "var(--color-danger, #c0392b)" }}>理由：{inv.return_reason}</div>}
        </div>
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
          </div>
          <div className="form-field">
            <label>追加費用の内容</label>
            <input type="text" maxLength={500} placeholder="例：新幹線代" value={extraNote} onChange={(e) => setExtraNote(e.target.value)} />
          </div>
          <div className="form-field">
            <label>備考</label>
            <textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={submit}>
            {inv ? "この内容で再提出する" : "この内容で提出する"}
          </button>
        </div>
      )}
    </div>
  );
}
