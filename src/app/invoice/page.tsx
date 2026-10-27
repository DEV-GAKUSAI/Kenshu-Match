"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { getInstructorNames } from "@/lib/instructor/profile";
import { getRequesterContacts } from "@/lib/requester/profile";
import { calcInvoice, diffInvoices, normalizeBank, normalizeReceipts, sizeLabel } from "@/lib/requests/invoice-calc";
import { getInvoice, getInvoiceChanges, INVOICE_STATUS_TEXT, receiptHref, type InvoiceRow } from "@/lib/requests/invoices";
import { formatMoney } from "@/lib/requests/money";

/** 請求書 (#52): print-friendly page. 「印刷」→「PDFに保存」 gives the PDF. */
function InvoiceInner() {
  const { authReady, user } = useAuth();
  const id = useSearchParams().get("id");
  const [inv, setInv] = useState<InvoiceRow | null | undefined>(undefined);
  const [buyer, setBuyer] = useState("");
  const [seller, setSeller] = useState("");
  const [history, setHistory] = useState<InvoiceRow[]>([]);

  useEffect(() => {
    if (!authReady || !user || !id) return;
    let alive = true;
    (async () => {
      const o = await getInvoice(id);
      if (!alive) return;
      setInv(o);
      if (!o) return;
      const old = await getInvoiceChanges(o.invoice_id);
      if (alive) setHistory(old);
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

  const calc = calcInvoice(inv);
  const bank = normalizeBank(inv.bank_info);
  const receipts = normalizeReceipts(inv.receipts);
  const yen = (n: number | null) => (n === null ? "—" : `¥${n.toLocaleString("ja-JP")}`);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" });
  const fmtDay = (d: string) => new Date(`${d}T00:00:00+09:00`).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" });
  const issued = fmtDate(inv.issued_at);
  const cell = { border: "1px solid var(--color-border, #ccd5d1)", padding: "6px 8px", fontSize: 13 } as const;
  // Each version with what changed from the one before it, and why an earlier one was returned.
  const versions = [...history, inv];
  const changes = versions.slice(1).map((v, i) => ({
    revision: v.revision,
    at: v.issued_at,
    diffs: diffInvoices(versions[i], v),
    prevReturned: versions[i].status === "returned" ? versions[i].return_reason || "（理由なし）" : null,
  }));

  return (
    <main className="detail-page">
      <style>{`@media print { header, footer, nav, .site-header, .site-footer, .toast, .no-print { display: none !important; } body { background: #fff !important; } .form-card { box-shadow: none !important; border: none !important; padding: 0 !important; max-width: none !important; } @page { margin: 14mm; } }`}</style>
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
        <div style={{ textAlign: "right", fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
          <div>請求書番号：{inv.invoice_no}（第{inv.revision}版）</div>
          <div>発行日：{issued}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ flex: "1 1 240px" }}>
            <p style={{ fontSize: 17, margin: "0 0 4px", borderBottom: "1px solid #333", paddingBottom: 4 }}>
              <strong>{buyer || "請求先"} 御中</strong>
            </p>
          </div>
          <div style={{ flex: "1 1 200px", fontSize: 13, lineHeight: 1.7 }}>
            <div style={{ fontSize: 11.5, color: "var(--color-ink-soft)" }}>請求者</div>
            <strong>{inv.party_name || seller || "（講師）"}</strong>
            {inv.speaker_name && <div style={{ fontSize: 12.5 }}>登壇講師：{inv.speaker_name}</div>}
            {inv.registration_no && <div style={{ fontSize: 12.5 }}>登録番号：{inv.registration_no}</div>}
          </div>
        </div>
        <p style={{ fontSize: 14, margin: "0 0 12px" }}>下記のとおり、ご請求申し上げます。</p>
        <div style={{ border: "1px solid #333", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <span style={{ fontSize: 13 }}>ご請求金額{calc.total !== null && calc.tax !== null ? "（税込）" : ""}</span>
          <strong style={{ fontSize: 22 }}>{calc.total !== null ? yen(calc.total) : inv.base_amount ? formatMoney(inv.base_amount, inv.amount_unit, inv.tax_mode) : "別途協議"}</strong>
        </div>
        <dl className="info-list">
          <div>
            <dt>件名</dt>
            <dd>{inv.title}</dd>
          </div>
          <div>
            <dt>支払期限</dt>
            <dd>{inv.due_date ? fmtDay(inv.due_date) : "別途協議"}</dd>
          </div>
        </dl>
        {calc.lines.length > 0 ? (
          <>
            <table className="doc-table" style={{ width: "100%", borderCollapse: "collapse", margin: "14px 0 0" }}>
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
                    <td style={cell}>{l.name === "登壇料" ? "講師料" : l.name}</td>
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
            <dt>振込先</dt>
            <dd>{bank ? `${bank.bank} ${bank.branch}　${bank.type}　${bank.number}　${bank.holder}` : "別途ご連絡します"}</dd>
          </div>
          {inv.note && (
            <div>
              <dt>備考</dt>
              <dd style={{ whiteSpace: "pre-line" }}>{inv.note}</dd>
            </div>
          )}
          {receipts.length > 0 && (
            <div className="no-print">
              <dt>領収書</dt>
              <dd>
                {receipts.map((r) => (
                  <div key={r.path}>
                    <a href={receiptHref(inv.invoice_id, r.path)} target="_blank" rel="noreferrer">
                      {r.name}
                    </a>
                    （{sizeLabel(r.size)}）
                  </div>
                ))}
              </dd>
            </div>
          )}
        </dl>
        <p className="no-print" style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 18 }}>
          状況：{INVOICE_STATUS_TEXT[inv.status]}{inv.status === "returned" && inv.return_reason ? `（理由：${inv.return_reason}）` : ""}
        </p>
      </div>
      {changes.length > 0 && (
        <div className="form-card no-print" style={{ maxWidth: 720, margin: "16px auto 0", background: "#fff" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>変更履歴</h2>
          {[...changes].reverse().map((c) => (
            <div key={c.revision} style={{ marginBottom: 12, fontSize: 13 }}>
              <strong>第{c.revision}版</strong>（{fmtDate(c.at)}）：{c.diffs.length === 0 ? "内容の変更なし（再提出のみ）" : ""}
              {c.prevReturned && <div style={{ marginLeft: 12, marginTop: 2 }}>第{c.revision - 1}版は差し戻されました（理由：{c.prevReturned}）</div>}
              {c.diffs.map((d) => (
                <div key={d.label} style={{ marginLeft: 12, marginTop: 2 }}>
                  {d.label}：{d.before} → <strong>{d.after}</strong>
                </div>
              ))}
            </div>
          ))}
          <p style={{ fontSize: 12, color: "var(--color-ink-soft)", margin: 0 }}>第1版：{fmtDate(versions[0].issued_at)}に提出</p>
        </div>
      )}
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
