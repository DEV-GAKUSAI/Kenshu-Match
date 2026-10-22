"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useToast } from "@/components/common/Toast";
import { getOrderForResponse, issueOrder, ORDER_STATUS_TEXT, respondOrder, type OrderRow } from "@/lib/requests/orders";

/** 注文書: the company issues it for the decided instructor, the instructor confirms (#51). */
export function OrderPanel({ responseId, role }: { responseId: string; role: "requester" | "instructor" }) {
  const { showToast } = useToast();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const o = await getOrderForResponse(responseId);
    setOrder(o);
    setTerms(o?.payment_terms ?? "");
    setNote(o?.note ?? "");
    setLoaded(true);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseId]);

  if (!loaded) return null;
  if (role === "instructor" && !order) return null;

  async function issue() {
    setBusy(true);
    const { error } = await issueOrder(responseId, terms.trim() || null, note.trim() || null);
    setBusy(false);
    if (error) return showToast(error.message);
    showToast(order ? "注文書を更新して再発行しました。" : "注文書を発行しました。");
    setOpen(false);
    await load();
  }

  async function respond(accept: boolean) {
    if (!order) return;
    setBusy(true);
    const { error } = await respondOrder(order.order_id, accept);
    setBusy(false);
    if (error) return showToast(error.message);
    showToast(accept ? "注文書を確認しました。" : "注文書を辞退しました。");
    await load();
  }

  return (
    <div className="request-card__response" style={{ marginTop: 14 }}>
      <strong>注文書</strong>
      {order ? (
        <div style={{ fontSize: 13 }}>
          {order.order_no}（第{order.revision}版）　{ORDER_STATUS_TEXT[order.status]}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>決定した講師への注文書を発行できます。案件名・日程・金額は自動で入ります。</div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {order && (
          <Link href={`/order?id=${order.order_id}`} target="_blank" className="btn btn--ghost btn--sm">
            注文書を開く
          </Link>
        )}
        {role === "requester" && (!order || order.status !== "confirmed") && (
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => setOpen((v) => !v)}>
            {order ? "内容を変更して再発行する" : "注文書を発行する"}
          </button>
        )}
        {role === "instructor" && order?.status === "issued" && (
          <>
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => respond(true)}>
              内容を確認した
            </button>
            <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => respond(false)}>
              辞退する
            </button>
          </>
        )}
      </div>
      {open && role === "requester" && (
        <div className="inline-quote-form is-open" style={{ marginTop: 10 }}>
          <div className="form-field">
            <label>支払条件</label>
            <input type="text" maxLength={300} placeholder="例：月末締め翌月末払い" value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>
          <div className="form-field">
            <label>備考</label>
            <textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={issue}>
            {order ? "この内容で再発行する" : "この内容で発行する"}
          </button>
        </div>
      )}
    </div>
  );
}
