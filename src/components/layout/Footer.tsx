"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { mineRegisterUrl } from "@/lib/mine/login-url";

export function Footer() {
  const pathname = usePathname();

  // 講師の方へ（/for-instructors）だけは、左にケンシュウリンク、右にMineの案内を並べた1つのフッターにする
  if (pathname === "/for-instructors") {
    return (
      <div className="site-footer site-footer--instructors">
        <div className="site-footer__inner">
          <div className="site-footer__side">
            <div className="brand">
              <Image className="brand__logo" src="/images/logo-07-teal.png" alt="KenshuLink" width={32} height={32} />
              <span className="brand__name" style={{ fontSize: 16 }}>
                ケンシュウリンク
              </span>
            </div>
            <div className="site-footer__links site-footer__links--stack">
              <Link href="/terms">利用規約</Link>
              <Link href="/privacy">プライバシーポリシー</Link>
              <Link href="/contact">お問い合わせ</Link>
              <Link href="/company">運営会社</Link>
            </div>
          </div>

          <div className="site-footer__mine">
            <p className="site-footer__mine-eyebrow">
              <Image src="/images/mine-mark-light.svg" alt="" width={24} height={24} unoptimized />
              MINE
            </p>
            <p className="site-footer__mine-title">はじめての方は、Mineで登録。</p>
            <p className="site-footer__mine-text">登録は数分。連携は、あとからでもできます。</p>
            <a className="site-footer__mine-btn" href={mineRegisterUrl(process.env.NEXT_PUBLIC_MINE_APP_URL)}>
              Mineで登録する
            </a>
          </div>
        </div>
        <p className="site-footer__copy">© 2026 KenshuLink — 研修講師 × 企業・個人マッチング</p>
      </div>
    );
  }

  return (
    <div className="site-footer">
      <div className="site-footer__inner">
        <div>
          <div className="brand">
            <Image className="brand__logo" src="/images/logo-07-teal.png" alt="KenshuLink" width={32} height={32} />
            <span className="brand__name" style={{ fontSize: 16 }}>
              ケンシュウリンク
            </span>
          </div>
          <p className="site-footer__copy">© 2026 KenshuLink — 研修講師 × 企業・個人マッチング</p>
        </div>
        <div className="site-footer__links">
          <Link href="/terms">利用規約</Link>
          <Link href="/privacy">プライバシーポリシー</Link>
          <Link href="/contact">お問い合わせ</Link>
          <Link href="/company">運営会社</Link>
        </div>
      </div>
    </div>
  );
}
