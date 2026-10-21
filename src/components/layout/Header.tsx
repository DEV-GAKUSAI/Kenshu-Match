"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import type { CurrentUser } from "@/lib/auth/auth";

const ROLE_LABELS: Record<string, string> = {
  INSTRUCTOR: "講師",
  COMPANY: "企業",
  INDIVIDUAL: "生徒",
  ADMIN: "管理者",
};

function getNavLinks(user: CurrentUser | null) {
  if (!user) {
    return [
      { href: "/", label: "トップ" },
      { href: "/instructors", label: "講師を探す" },
      { href: "/open-requests", label: "講師の方へ" },
    ];
  }

  if (user.role === "INSTRUCTOR") {
    return [
      { href: "/", label: "トップ" },
      { href: "/open-requests", label: "案件を探す" },
      { href: "/mypage", label: "マイページ" },
    ];
  }

  if (user.role === "ADMIN") {
    return [{ href: "/admin", label: "管理者ダッシュボード" }];
  }

  return [
    { href: "/", label: "トップ" },
    { href: "/instructors", label: "講師を探す" },
    { href: "/mypage", label: "マイページ" },
  ];
}

export function Header() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  const links = getNavLinks(user);

  async function handleLogout() {
    await signOut();
    router.push("/");
  }

  return (
    <div className="site-header">
      <div className="site-header__inner">
        <Link className="brand" href={user?.role === "ADMIN" ? "/admin" : "/"}>
          <Image className="brand__logo" src="/images/logo-07-teal.png" alt="KenshuLink" width={40} height={40} />
          <span>
            <span className="brand__name">ケンシュウリンク</span>
            <span className="brand__sub">KENSHU LINK </span>
          </span>
        </Link>

        <nav className={`main-nav${navOpen ? " is-open" : ""}`} aria-label="メインナビゲーション">
          {links.map((link) => (
            <Link
              key={link.href}
              className={`main-nav__link${pathname === link.href ? " is-active" : ""}`}
              href={link.href}
              onClick={() => setNavOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          {!user ? (
            <>
              <Link className="btn btn--ghost" href="/login">
                ログイン
              </Link>
              <Link className="btn btn--primary" href="/register">
                無料登録
              </Link>
            </>
          ) : (
            <>
              <Link className="header-user" href={user.role === "ADMIN" ? "/admin" : "/mypage"}>
                <span className="hanko hanko--role" aria-hidden="true" style={{ width: 26, height: 26, fontSize: 12 }}>
                  {(ROLE_LABELS[user.role] || "").slice(0, 1)}
                </span>
                <span className="header-user__name">{user.name}</span>
              </Link>
              <button type="button" className="btn btn--ghost btn--sm" onClick={handleLogout}>
                ログアウト
              </button>
            </>
          )}
          <button
            type="button"
            className="nav-toggle"
            aria-label="メニューを開く"
            onClick={() => setNavOpen((v) => !v)}
          >
            <span></span>
          </button>
        </div>
      </div>
    </div>
  );
}
