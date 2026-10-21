"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { getInstructorNames } from "@/lib/instructor/profile";
import { getRequesterContacts } from "@/lib/requester/profile";
import { costLines, formatMoney } from "@/lib/requests/money";
import { getOrder, ORDER_STATUS_TEXT, type OrderRow } from "@/lib/requests/orders";

/** 注文書 (#51): print-friendly page. 「印刷」→「PDFに保存」 gives the PDF. */
function OrderInner() {
  const { authReady, user } = useAuth();
  const id = useSearchParams().get("id");
  const [order, setOrder] = useState<OrderRow | null | undefined>(undefined);
  const [buyer, setBuyer] = useState("");
  const [seller, setSeller] = useState("");

  useEffect(() => {
    if (!authReady || !user || !id) return;
    let alive = true;
    (async () => {
      const o = await getOrder(id);
      if (!alive) return;
      setOrder(o);
      if (!o) return;
      const names = await getInstructorNames([o.instructor_id]);
      const buyers = await getRequesterContacts([o.requester_id]);
      if (!alive) return;
      setSeller(names[o.instructor_id]?.name ?? "");
      const b = buyers[o.requester_id] as { name?: string; company_name?: string | null } | undefined;
      setBuyer(b?.company_name || b?.name || "");
    })();
    return () => {
      alive = false;
    };
  }, [authReady, user, id]);

  if (!authReady) return null;
  if (!user || !id || order === null) {
    return (
      <main className="detail-page">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <p className="empty-state__title">注文書が見つかりません</p>
          <Link href="/mypage" className="btn btn--primary" style={{ marginTop: 16 }}>
            マイページに戻る
          </Link>
        </div>
      </main>
    );
  }
  if (order === undefined) return <main className="detail-page"><p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p></main>;

  const lines = costLines({ budget: order.amount, transport_cost: order.transport_cost, lodging_cost: order.lodging_cost, prep_cost: order.prep_cost, payment_terms: order.payment_terms });
  const issued = new Date(order.issued_at).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" });

  return (
    <main className="detail-page">
      <style>{`@media print { header, footer, nav, .no-print { display: none !important; } body { background: #fff !important; } }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => window.print()}>
          印刷 / PDFに保存
        </button>
        <Link href="/mypage" className="btn btn--ghost btn--sm">
          マイページに戻る
        </Link>
      </div>
      <div className="form-card" style={{ maxWidth: 720, margin: "0 auto", background: "#fff" }}>
        <h1 style={{ textAlign: "center", fontSize: 26, margin: "0 0 18px", letterSpacing: 8 }}>注 文 書</h1>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 18 }}>
          <span>注文書番号：{order.order_no}（第{order.revision}版）</span>
          <span>発行日：{issued}</span>
        </div>
        <p style={{ fontSize: 15, margin: "0 0 4px" }}>
          <strong>{seller || "受注者"} 様</strong>
        </p>
        <p style={{ fontSize: 13, margin: "0 0 18px" }}>発注者：{buyer || "（発注者）"}</p>
        <p style={{ fontSize: 14, margin: "0 0 14px" }}>下記のとおり、研修の講師業務を発注いたします。</p>
        <dl className="info-list">
          <div>
            <dt>件名</dt>
            <dd>{order.title}</dd>
          </div>
          <div>
            <dt>日程</dt>
            <dd style={{ whiteSpace: "pre-line" }}>{order.schedule_text || "別途調整"}</dd>
          </div>
          <div>
            <dt>金額</dt>
            <dd>{order.amount ? formatMoney(order.amount, order.amount_unit, order.tax_mode) : "別途協議"}</dd>
          </div>
          {lines.map((l) => {
            const [k, ...rest] = l.split("：");
            return (
              <div key={l}>
                <dt>{k}</dt>
                <dd>{rest.join("：")}</dd>
              </div>
            );
          })}
          {order.note && (
            <div>
              <dt>備考</dt>
              <dd style={{ whiteSpace: "pre-line" }}>{order.note}</dd>
            </div>
          )}
        </dl>
        <p className="no-print" style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 18 }}>
          状況：{ORDER_STATUS_TEXT[order.status]}　{user.id === order.instructor_id ? "内容に問題がなければ、マイページで「内容を確認した」を押してください。" : ""}
        </p>
      </div>
    </main>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={null}>
      <OrderInner />
    </Suspense>
  );
}
