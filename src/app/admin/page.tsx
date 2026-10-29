"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { getSubcategoriesForAdmin } from "@/lib/admin/subcategories";
import "../mypage/mypage.css";

type Stats = {
  instructors: number;
  companies: number;
  requests: number;
  requests_pending: number;
  requests_accepted: number;
  requests_completed: number;
  answers: number;
  reported: number;
};

const COMING = ["ユーザー一覧", "依頼一覧", "過去の研修の一覧", "デモデータの整理"];

export default function AdminHomePage() {
  const { user, authReady } = useAuth();
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [stats, setStats] = useState<Stats | null>(null);
  const [unusedSubs, setUnusedSubs] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!authReady || user?.role !== "ADMIN") return;
    let alive = true;
    (async () => {
      const { data } = await supabase.rpc("admin_dashboard_stats");
      const subs = await getSubcategoriesForAdmin();
      if (!alive) return;
      setStats((data as Stats | null) ?? null);
      setUnusedSubs(
        subs.data ? subs.data.filter((s) => s.created_by && s.instructor_count + s.request_count === 0).length : null,
      );
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [authReady, user, supabase]);

  if (!authReady) return null;
  if (!user || user.role !== "ADMIN") return null;

  const reported = stats?.reported ?? 0;
  const tiles: { label: string; value: number | undefined; sub?: string }[] = [
    { label: "講師", value: stats?.instructors },
    { label: "企業・個人", value: stats?.companies },
    {
      label: "依頼",
      value: stats?.requests,
      sub: stats ? `承諾 ${stats.requests_accepted} ・ 完了 ${stats.requests_completed}` : undefined,
    },
    { label: "アンケート回答", value: stats?.answers },
  ];

  const cards = [
    {
      href: "/admin/surveys",
      title: "研修アンケート管理",
      desc: "回答の非表示、講師からの報告の確認、結果の取り込み、リンク数の上限変更",
      badge: reported > 0 ? `報告 ${reported}` : null,
    },
    {
      href: "/admin/subcategories",
      title: "サブカテゴリ管理",
      desc: "ユーザーが追加した研修分野の名称変更・削除（未使用のもののみ）",
      badge: unusedSubs ? `未使用 ${unusedSubs}` : null,
    },
    {
      href: "/admin/payments-test",
      title: "決済テスト（テストモード）",
      desc: "¥1,100（税込）の料金のテスト決済と、支払い記録の確認",
      badge: null,
    },
  ];

  return (
    <main className="mypage">
      <div className="mypage__head">
        <h1 className="mypage__title">管理者ダッシュボード</h1>
        <p className="mypage__role">{user.name} としてログイン中</p>
      </div>

      <div className="req-group-title req-group-title--attn" style={{ marginTop: 4 }}>
        要対応
      </div>
      {!loaded ? (
        <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>
      ) : reported > 0 ? (
        <Link href="/admin/surveys" className="req-row req-row--attn" style={{ display: "block", textDecoration: "none" }}>
          <span className="req-row__head" style={{ cursor: "pointer" }}>
            <span className="req-row__main">
              <span className="req-row__line1">
                <span className="req-row__dot" aria-hidden="true" />
                <span className="req-row__title">講師から報告された回答があります</span>
              </span>
              <span className="req-row__line2">{reported}件 ・ 研修アンケート管理で確認する</span>
            </span>
            <span className="req-badge req-badge--attn">報告 {reported}</span>
          </span>
        </Link>
      ) : (
        <p style={{ color: "var(--color-ink-soft)", fontSize: 13, margin: "0 0 4px" }}>対応が必要なものはありません。</p>
      )}

      <div className="req-group-title">いまの状況</div>
      <div className="survey-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="survey-tile">
            <div className="survey-tile__label">{t.label}</div>
            <strong style={{ fontSize: 26 }}>{t.value ?? "–"}</strong>
            {t.sub && <small style={{ marginLeft: 0 }}>{t.sub}</small>}
          </div>
        ))}
      </div>

      <div className="req-group-title">管理メニュー</div>
      {cards.map((c) => (
        <Link key={c.href} href={c.href} className="req-row" style={{ display: "block", textDecoration: "none" }}>
          <span className="req-row__head" style={{ cursor: "pointer" }}>
            <span className="req-row__main">
              <span className="req-row__line1">
                <span className="req-row__title">{c.title}</span>
              </span>
              <span className="req-row__line2">{c.desc}</span>
            </span>
            {c.badge && <span className="req-badge req-badge--attn">{c.badge}</span>}
            <svg className="req-row__chev" style={{ transform: "rotate(-90deg)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </Link>
      ))}

      <div className="req-group-title">これから追加できるもの</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {COMING.map((c) => (
          <span key={c} className="req-badge req-badge--cancelled">
            {c}（準備中）
          </span>
        ))}
      </div>
    </main>
  );
}
