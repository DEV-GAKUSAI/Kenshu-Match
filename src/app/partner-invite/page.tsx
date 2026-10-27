"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { InviteSteps, PartnerFlowArt } from "@/components/requests/PartnerArt";
import { useAuth } from "@/hooks/useAuth";
import { formatInviteCode, INVITE_STORAGE_KEY, isCompleteInviteCode, normalizeInviteCode } from "@/lib/requests/partner-flow";
import "../mypage/mypage.css";

/**
 * 招待リンクの受け口 (#53). The company's invitation message links here with the code.
 * The page keeps the code in this browser, so マイページ shows it already filled in after login.
 */
export default function PartnerInvitePage() {
  const { authReady, user } = useAuth();
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const fromLink = normalizeInviteCode(new URLSearchParams(window.location.search).get("code") ?? "");
      if (isCompleteInviteCode(fromLink)) {
        try {
          localStorage.setItem(INVITE_STORAGE_KEY, fromLink);
        } catch {
          // the code is still shown here and can be typed by hand
        }
        setCode(fromLink);
      } else {
        setCode("");
      }
    })();
  }, []);

  if (!authReady || code === null) return null;

  return (
    <main className="mypage">
      <div className="mypage__head">
        <h1 className="mypage__title">協力会社として連携する</h1>
        <p className="mypage__role">依頼元の企業から招待コードが届いています。</p>
      </div>

      <section className="pa-intro">
        <PartnerFlowArt />
      </section>

      {code ? (
        <section className="pa-card" style={{ marginBottom: 16 }}>
          <h2 className="pa-card__title">あなたの招待コード</h2>
          <div className="pa-code">
            <span className="pa-code__value">{formatInviteCode(code)}</span>
            <span className="pa-code__meta">1回だけ使えます・有効期限は発行から7日間</span>
          </div>
        </section>
      ) : (
        <section className="pa-card" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0 }}>招待コードが見つかりません。依頼元の企業から届いた案内文のリンクを、もう一度開いてください。</p>
        </section>
      )}

      <section className="pa-card">
        <h2 className="pa-card__title">連携の手順</h2>
        <InviteSteps />
        {!user && (
          <>
            <p className="pa-muted" style={{ margin: "0 0 12px" }}>
              ログインすると、マイページの「関係先の案件」にコードが入力された状態で表示されます。あとは「連携する」を押すだけです。
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href="/login" className="btn btn--primary btn--sm">
                ログイン
              </Link>
              <Link href="/register" className="btn btn--ghost btn--sm">
                企業として新規登録
              </Link>
            </div>
          </>
        )}
        {user && user.role === "COMPANY" && (
          <Link href="/mypage" className="btn btn--primary btn--sm">
            マイページで連携する
          </Link>
        )}
        {user && user.role !== "COMPANY" && (
          <p style={{ margin: 0 }}>このリンクは企業アカウント用です。企業アカウントでログインし直してください。</p>
        )}
      </section>
    </main>
  );
}
