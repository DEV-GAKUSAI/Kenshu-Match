"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { getInstructorNames } from "@/lib/instructor/profile";
import { getRequesterContacts } from "@/lib/requester/profile";
import { getInvoice, INVOICE_STATUS_TEXT, type InvoiceRow } from "@/lib/requests/invoices";
import { formatMoney } from "@/lib/requests/money";

/** 請求書 (#52): print-friendly page. 「印刷」→「PDFに保存」 gives the PDF. */
function InvoiceInner() {
  const { authReady, user } = useAuth();
  const id = useSearchParams().get("id");
  const [inv, setInv] = useState<InvoiceRow | null | undefined>(undefined);
  const [buyer, setBuyer] = useState("");
  const [seller, setSeller] = useState("");

  useEffect(() => {
    if (!authReady || !user || !id) return;
    let alive = true;
    (async () => {
      const o = await getInvoice(id);
      if (!alive) return;
      setInv(o);
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
  if (!user || !id || inv === null) {
    return (
      <main className="detail-page">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <p className="empty-state__title">請求書が見つかりません</p>
          <Link href="/mypage" className="btn btn--primary" style={{ marginTop: 16 }}>
            マイページに戻る
          </Link>
        </div>
      </main>
    );
  }
  if (inv === undefined) return <main className="detail-page"><p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p></main>;

  const perUnit = inv.amount_unit === "hour" || inv.amount_unit === "day";
  const qty = perUnit && inv.quantity ? inv.quantity : 0;
  const base = inv.base_amount ?? 0;
  const extra = inv.extra_amount ?? 0;
  const taxText = inv.tax_mode === "excluded" ? "（税別）" : inv.tax_mode === "included" ? "（税込）" : "";
  const issued = new Date(inv.issued_at).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" });

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
        <h1 style={{ textAlign: "center", fontSize: 26, margin: "0 0 18px", letterSpacing: 8 }}>請 求 書</h1>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 18 }}>
          <span>請求書番号：{inv.invoice_no}（第{inv.revision}版）</span>
          <span>発行日：{issued}</span>
        </div>
        <p style={{ fontSize: 15, margin: "0 0 4px" }}>
          <strong>{buyer || "請求先"} 御中</strong>
        </p>
        <p style={{ fontSize: 13, margin: "0 0 18px" }}>請求者：{seller || "（講師）"}</p>
        <p style={{ fontSize: 14, margin: "0 0 14px" }}>下記のとおり、ご請求申し上げます。</p>
        <dl className="info-list">
          <div>
            <dt>件名</dt>
            <dd>{inv.title}</dd>
          </div>
          <div>
            <dt>講師料</dt>
            <dd>{inv.base_amount ? formatMoney(inv.base_amount, inv.amount_unit, inv.tax_mode) : "別途協議"}</dd>
          </div>
          {qty > 0 && (
            <div>
              <dt>{inv.amount_unit === "hour" ? "時間数" : "日数"}</dt>
              <dd>
                {qty}
                {inv.amount_unit === "hour" ? "時間" : "日"}
              </dd>
            </div>
          )}
          {extra > 0 && (
            <div>
              <dt>追加費用</dt>
              <dd>
                ¥{extra.toLocaleString("ja-JP")}
                {inv.extra_note ? `（${inv.extra_note}）` : ""}
              </dd>
            </div>
          )}
          {inv.base_amount && (inv.amount_unit === "total" || qty > 0) && (
            <div>
              <dt>ご請求額合計</dt>
              <dd>
                <strong>¥{((qty > 0 ? base * qty : base) + extra).toLocaleString("ja-JP")}{taxText}</strong>
              </dd>
            </div>
          )}
          {inv.note && (
            <div>
              <dt>備考</dt>
              <dd style={{ whiteSpace: "pre-line" }}>{inv.note}</dd>
            </div>
          )}
        </dl>
        <p className="no-print" style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 18 }}>状況：{INVOICE_STATUS_TEXT[inv.status]}</p>
      </div>
    </main>
  );
}

export default function InvoicePage() {
  return (
    <Suspense fallback={null}>
      <InvoiceInner />
    </Suspense>
  );
}
