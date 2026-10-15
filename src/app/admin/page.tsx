"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

const RESOURCES = [
  {
    href: "/admin/subcategories",
    title: "サブカテゴリ管理",
    desc: "ユーザーが自由入力で追加した研修分野の名称変更・削除（未使用のもののみ）。",
  },
  {
    href: "/admin/surveys",
    title: "研修アンケート管理",
    desc: "回答の非表示、講師からの報告の確認、リンク数の上限変更。",
  },
];

export default function AdminHomePage() {
  const { user, authReady } = useAuth();

  if (!authReady) return null;
  if (!user || user.role !== "ADMIN") return null;

  return (
    <main className="mypage">
      <div className="mypage__head">
        <h1 className="mypage__title">管理者ダッシュボード</h1>
        <p className="mypage__role">{user.name} としてログイン中</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {RESOURCES.map((r) => (
          <Link key={r.href} href={r.href} className="request-card" style={{ display: "block" }}>
            <div className="request-card__title">{r.title}</div>
            <p className="request-card__desc">{r.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
