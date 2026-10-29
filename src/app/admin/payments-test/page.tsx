"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import "../../mypage/mypage.css";

type Payment = { payment_id: string; kind: string; amount_yen: number; status: string; created_at: string; paid_at: string | null };

const STATUS_LABEL: Record<string, string> = {
  pending: "支払い待ち",
  paid: "支払い済み",
  expired: "期限切れ",
  mismatch: "金額不一致（要確認）",
};

const fmt = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });

async function fetchPayments(supabase: SupabaseClient): Promise<Payment[]> {
  const { data } = await supabase
    .from("fee_payments")
    .select("payment_id, kind, amount_yen, status, created_at, paid_at")
    .eq("kind", "test")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data as Payment[] | null) ?? [];
}

/** #65 stage 1: an ADMIN-only page with one test button for the ¥1,100 fee. TEST MODE ONLY. Not shown to other roles. */
export default function PaymentsTestPage() {
  const { user, authReady } = useAuth();
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [rows, setRows] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // "?result=success|cancel" is set by Stripe's return address. (The page shows nothing until sign-in is known, so reading it on the client is safe.)
  const [result] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("result")));

  const refresh = useCallback(async () => {
    setRows(await fetchPayments(supabase));
  }, [supabase]);

  useEffect(() => {
    if (!authReady || user?.role !== "ADMIN") return;
    let alive = true;
    (async () => {
      const list = await fetchPayments(supabase);
      if (alive) setRows(list);
    })();
    return () => {
      alive = false;
    };
  }, [authReady, user, supabase]);

  if (!authReady) return null;
  if (!user || user.role !== "ADMIN") return null;

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/payments/test-checkout", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (res.ok && json?.url) {
        window.location.href = json.url;
        return;
      }
      setMessage(
        json?.error === "stripe_test_key_missing"
          ? "Stripeのテスト用キー（sk_test_）が設定されていません。"
          : "決済ページを開けませんでした。もう一度お試しください。",
      );
    } catch {
      setMessage("通信に失敗しました。もう一度お試しください。");
    }
    setBusy(false);
  }

  return (
    <main className="mypage">
      <div className="mypage__head">
        <h1 className="mypage__title">決済テスト（テストモード）</h1>
        <p className="mypage__role">
          <Link href="/admin">← 管理者ダッシュボード</Link>
        </p>
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.8 }}>
        ¥1,100（税込）のテスト決済を試します。実際のお金は動きません。Stripeの決済ページでは、テスト用カード番号 4242 4242 4242 4242（期限は未来の日付、CVCは任意の3桁）を使ってください。
      </p>

      {result === "success" && <p className="req-badge req-badge--attn" style={{ display: "inline-block" }}>決済ページから戻りました。下の一覧が「支払い済み」になれば成功です（数秒かかることがあります）。</p>}
      {result === "cancel" && <p className="req-badge req-badge--cancelled" style={{ display: "inline-block" }}>決済をキャンセルしました。</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        <button type="button" className="btn btn--primary" onClick={start} disabled={busy}>
          {busy ? "準備中…" : "テスト決済をする（¥1,100）"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => void refresh()}>
          一覧を更新
        </button>
      </div>
      {message && <p style={{ color: "#b3261e", fontSize: 13 }}>{message}</p>}

      <div className="req-group-title">最近のテスト決済</div>
      {rows.length === 0 ? (
        <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>まだありません。</p>
      ) : (
        rows.map((p) => (
          <div key={p.payment_id} className="req-row" style={{ display: "block" }}>
            <span className="req-row__main">
              <span className="req-row__line1">
                <span className="req-row__title">¥{p.amount_yen.toLocaleString("ja-JP")}</span>
                <span className={`req-badge ${p.status === "paid" ? "req-badge--attn" : "req-badge--cancelled"}`} style={{ marginLeft: 8 }}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </span>
              <span className="req-row__line2">
                {fmt(p.created_at)}
                {p.paid_at ? ` ・ 支払い ${fmt(p.paid_at)}` : ""}
              </span>
            </span>
          </div>
        ))
      )}
    </main>
  );
}
