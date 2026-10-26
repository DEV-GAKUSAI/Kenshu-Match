"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useToast } from "@/components/common/Toast";
import { getOrderChanges, getOrderDefaults, getOrderForResponse, issueOrder, ORDER_STATUS_TEXT, respondOrder, type OrderRow } from "@/lib/requests/orders";
import { diffOrders, MAX_ITEMS, normalizeItems } from "@/lib/requests/order-calc";
import { MAX_AMOUNT, normalUnit } from "@/lib/requests/money";

type ItemInput = { name: string; qty: string; price: string };

/** 注文書: the company issues it for the decided instructor, the instructor confirms (#51). */
export function OrderPanel({ responseId, role }: { responseId: string; role: "requester" | "instructor" }) {
  const { showToast } = useToast();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState("");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState("");
  const [items, setItems] = useState<ItemInput[]>([]);
  const [unit, setUnit] = useState<string | null>(null);
  const [changed, setChanged] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const o = await getOrderForResponse(responseId);
    setOrder(o);
    // The 支払条件 of the request is the starting point when the order has none yet (#51).
    const def = role === "requester" ? await getOrderDefaults(responseId) : null;
    setTerms(o?.payment_terms || def?.paymentTerms || "");
    setNote(o?.note ?? "");
    setQty(o?.main_qty ? String(o.main_qty) : "");
    setItems(normalizeItems(o?.items).map((i) => ({ name: i.name, qty: String(i.qty), price: String(i.unit_price) })));
    setUnit(o?.amount_unit ?? def?.unit ?? null);
    if (o && o.revision > 1) {
      const olds = await getOrderChanges(o.order_id);
      const prev = olds.find((x) => x.revision === o.revision - 1);
      setChanged(prev ? diffOrders(prev, o).map((d) => d.label) : []);
    } else setChanged([]);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state only after awaiting
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseId]);

  if (!loaded) return null;
  if (role === "instructor" && !order) return null;

  async function issue() {
    const mainQty = qty.trim() ? Number(qty) : null;
    if (mainQty !== null && (!(mainQty > 0) || mainQty > 100000)) return showToast("数量は0より大きい数で入力してください。");
    const rows = items.filter((i) => i.name.trim() || i.qty.trim() || i.price.trim());
    const parsed = [];
    for (const r of rows) {
      const q = Number(r.qty);
      const pr = Number(r.price);
      if (!r.name.trim()) return showToast("明細の品目を入力してください。");
      if (!(q > 0) || q > 100000) return showToast(`「${r.name.trim()}」の数量は0より大きい数で入力してください。`);
      if (!Number.isInteger(pr) || pr < 0 || pr > MAX_AMOUNT) return showToast(`「${r.name.trim()}」の単価は0〜${MAX_AMOUNT.toLocaleString()}円の整数で入力してください。`);
      parsed.push({ name: r.name.trim(), qty: q, unit_price: pr });
    }
    setBusy(true);
    const { error } = await issueOrder(responseId, terms.trim() || null, note.trim() || null, mainQty, parsed);
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
          {order.revision > 1 && <div style={{ color: "var(--color-ink-soft)" }}>前の版からの変更：{changed.length ? changed.join("・") : "なし"}（詳細は注文書の「変更履歴」）</div>}
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
          {unit !== null && normalUnit(unit) !== "total" && (
            <div className="form-field">
              <label>数量（{normalUnit(unit) === "day" ? "日数" : "時間数"}）</label>
              <input type="number" min={0} step="any" max={100000} placeholder={normalUnit(unit) === "day" ? "例：2" : "例：6"} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          )}
          <div className="form-field">
            <label>明細（経費など・任意）</label>
            {items.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                <input type="text" maxLength={50} placeholder="品目（例：交通費）" value={it.name} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} style={{ flex: "2 1 140px", minWidth: 0 }} />
                <input type="number" min={0} step="any" placeholder="数量" value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} style={{ flex: "0 1 80px", minWidth: 0 }} />
                <input type="number" min={0} max={MAX_AMOUNT} step={1} placeholder="単価（円）" value={it.price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} style={{ flex: "1 1 100px", minWidth: 0 }} />
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                  削除
                </button>
              </div>
            ))}
            {items.length < MAX_ITEMS && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setItems([...items, { name: "", qty: "1", price: "" }])}>
                ＋ 明細を追加する
              </button>
            )}
          </div>
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
