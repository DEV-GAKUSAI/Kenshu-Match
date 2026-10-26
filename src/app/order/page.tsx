"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { getInstructorNames } from "@/lib/instructor/profile";
import { getRequesterContacts } from "@/lib/requester/profile";
import { costLines, formatMoney } from "@/lib/requests/money";
import { getOrder, getOrderChanges, ORDER_STATUS_TEXT, type OrderRow } from "@/lib/requests/orders";
import { calcOrder, diffOrders } from "@/lib/requests/order-calc";

/** 注文書 (#51): print-friendly page. 「印刷」→「PDFに保存」 gives the PDF. */
function OrderInner() {
  const { authReady, user } = useAuth();
  const id = useSearchParams().get("id");
  const [order, setOrder] = useState<OrderRow | null | undefined>(undefined);
  const [buyer, setBuyer] = useState("");
  const [seller, setSeller] = useState("");
  const [history, setHistory] = useState<OrderRow[]>([]);

  useEffect(() => {
    if (!authReady || !user || !id) return;
    let alive = true;
    (async () => {
      const o = await getOrder(id);
      if (!alive) return;
      setOrder(o);
      if (!o) return;
      const olds = await getOrderChanges(o.order_id);
      if (alive) setHistory(olds);
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

  const lines = costLines({ budget: order.amount, transport_cost: order.transport_cost, lodging_cost: order.lodging_cost, prep_cost: order.prep_cost });
  const calc = calcOrder(order);
  const yen = (n: number | null) => (n === null ? "—" : `¥${n.toLocaleString()}`);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" });
  const issued = fmtDate(order.issued_at);
  const cell = { border: "1px solid var(--color-border, #ccd5d1)", padding: "6px 8px", fontSize: 13 } as const;
  // Each version with what changed from the one before it (#51).
  const versions = [...history, order];
  const changes = versions.slice(1).map((v, i) => ({ revision: v.revision, at: v.issued_at, diffs: diffOrders(versions[i], v) }));

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
        <div style={{ textAlign: "right", fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
          <div>注文書番号：{order.order_no}（第{order.revision}版）</div>
          <div>発行日：{issued}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ flex: "1 1 240px" }}>
            <p style={{ fontSize: 17, margin: "0 0 4px", borderBottom: "1px solid #333", paddingBottom: 4 }}>
              <strong>{order.party_name || seller || "受注者"} 様</strong>
            </p>
            {order.speaker_name && <p style={{ fontSize: 12.5, margin: "4px 0 0" }}>登壇講師：{order.speaker_name}</p>}
          </div>
          <div style={{ flex: "1 1 200px", fontSize: 13, lineHeight: 1.7 }}>
            <div style={{ fontSize: 11.5, color: "var(--color-ink-soft)" }}>発注者</div>
            <strong>{buyer || "（発注者）"}</strong>
          </div>
        </div>
        <p style={{ fontSize: 14, margin: "0 0 12px" }}>下記のとおり、研修の講師業務を注文いたします。</p>
        <div style={{ border: "1px solid #333", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <span style={{ fontSize: 13 }}>ご注文金額{calc.total !== null && calc.taxLabel === "税込" ? "（税込）" : calc.tax !== null ? "（税込）" : ""}</span>
          <strong style={{ fontSize: 22 }}>{calc.total !== null ? yen(calc.total) : order.amount ? `${formatMoney(order.amount, order.amount_unit, order.tax_mode)}` : "別途協議"}</strong>
        </div>
        <dl className="info-list">
          <div>
            <dt>件名</dt>
            <dd>{order.title}</dd>
          </div>
          <div>
            <dt>日程</dt>
            <dd style={{ whiteSpace: "pre-line" }}>{order.schedule_text || "別途調整"}</dd>
          </div>
        </dl>
        {calc.lines.length > 0 ? (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", margin: "14px 0 0" }}>
              <thead>
                <tr style={{ background: "#f2f5f4" }}>
                  <th style={{ ...cell, width: 36 }}>No.</th>
                  <th style={{ ...cell, textAlign: "left" }}>品名</th>
                  <th style={{ ...cell, width: 90 }}>数量</th>
                  <th style={{ ...cell, width: 100 }}>単価</th>
                  <th style={{ ...cell, width: 110 }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {calc.lines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                    <td style={cell}>{l.name}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{l.qty === null ? "—" : `${l.qty}${l.qtyLabel}`}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{yen(l.unitPrice)}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{yen(l.amount)}</td>
                  </tr>
                ))}
                {calc.subtotal !== null && (
                  <>
                    <tr>
                      <td colSpan={4} style={{ ...cell, textAlign: "right" }}>小計</td>
                      <td style={{ ...cell, textAlign: "right" }}>{yen(calc.subtotal)}</td>
                    </tr>
                    {calc.tax !== null && (
                      <tr>
                        <td colSpan={4} style={{ ...cell, textAlign: "right" }}>消費税（10%）</td>
                        <td style={{ ...cell, textAlign: "right" }}>{yen(calc.tax)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={4} style={{ ...cell, textAlign: "right" }}>
                        <strong>合計{calc.tax !== null ? "（税込）" : ""}</strong>
                      </td>
                      <td style={{ ...cell, textAlign: "right" }}>
                        <strong>{yen(calc.total)}</strong>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            {calc.note && <p style={{ fontSize: 12, color: "var(--color-ink-soft)", margin: "6px 0 0" }}>{calc.note}</p>}
          </>
        ) : (
          <p style={{ fontSize: 13, margin: "14px 0 0" }}>金額：別途協議</p>
        )}
        <dl className="info-list" style={{ marginTop: 14 }}>
          <div>
            <dt>支払条件</dt>
            <dd>{order.payment_terms?.trim() || "別途協議"}</dd>
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
      {changes.length > 0 && (
        <div className="form-card no-print" style={{ maxWidth: 720, margin: "16px auto 0", background: "#fff" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>変更履歴</h2>
          {[...changes].reverse().map((c) => (
            <div key={c.revision} style={{ marginBottom: 12, fontSize: 13 }}>
              <strong>第{c.revision}版</strong>（{fmtDate(c.at)}）：{c.diffs.length === 0 ? "内容の変更なし（再発行のみ）" : ""}
              {c.diffs.map((d) => (
                <div key={d.label} style={{ marginLeft: 12, marginTop: 2 }}>
                  {d.label}：{d.before} → <strong>{d.after}</strong>
                </div>
              ))}
            </div>
          ))}
          <p style={{ fontSize: 12, color: "var(--color-ink-soft)", margin: 0 }}>第1版：{fmtDate(versions[0].issued_at)}に発行</p>
        </div>
      )}
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
