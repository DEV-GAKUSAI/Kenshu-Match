"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/common/Toast";

export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailHasError, setEmailHasError] = useState(false);
  const [passwordHasError, setPasswordHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "mine_handoff") {
      queueMicrotask(() =>
        setErrorMessage(
          "MineからKenshu Linkを開けませんでした。Mineに戻って、もう一度お試しください。",
        ),
      );
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const emailInvalid = !email.includes("@");
    const passwordInvalid = password.length === 0;
    setEmailHasError(emailInvalid);
    setPasswordHasError(passwordInvalid);
    setErrorMessage("");

    if (emailInvalid || passwordInvalid) return;

    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);

    if (error) {
      setErrorMessage(
        error.message.includes("Invalid login credentials")
          ? "メールアドレスまたはパスワードが正しくありません。"
          : error.message.includes("Email not confirmed")
            ? "メールアドレスの確認がまだ完了していません。確認メール内のリンクをクリックしてください。"
            : error.message
      );
      return;
    }

    showToast("ログインしました");
    setTimeout(() => {
      router.push("/mypage");
    }, 500);
  }

  async function handleGoogleLogin() {
    setGoogleSubmitting(true);
    // OAuth 完了後は /auth/callback が PKCE の code を交換してから /mypage へ戻す
    // （ログインの場合は role 選択が不要：既存ユーザーは users テーブルに role が登録済み）。
    const { error } = await signInWithGoogle(`${window.location.origin}/auth/callback`);

    if (error) {
      showToast(`エラー：${error.message}`);
      setGoogleSubmitting(false);
    }
    // 成功時はブラウザが Google の認証画面にリダイレクトされるため、ここで追加処理は不要。
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="auth-card__eyebrow">LOGIN</p>
        <h1 className="auth-card__title">おかえりなさい</h1>
        <p className="auth-card__desc">登録済みのアカウントでログインしてください。</p>

        {errorMessage && <div className="notice-banner is-visible">{errorMessage}</div>}

        <form noValidate onSubmit={handleSubmit}>
          <div className={`form-field${emailHasError ? " has-error" : ""}`}>
            <label htmlFor="loginEmail">メールアドレス</label>
            <input
              type="email"
              id="loginEmail"
              name="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="form-field__error">メールアドレスを正しく入力してください。</p>
          </div>

          <div className={`form-field${passwordHasError ? " has-error" : ""}`}>
            <label htmlFor="loginPassword">パスワード</label>
            <input
              type="password"
              id="loginPassword"
              name="password"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="form-field__error">パスワードを入力してください。</p>
          </div>

          <div style={{ textAlign: "right", marginTop: "-8px", marginBottom: "20px" }}>
            <Link href="/forgot-password" style={{ fontSize: "12.5px", color: "var(--color-ink-soft)" }}>
              パスワードをお忘れですか？
            </Link>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
              {submitting ? "ログイン中…" : "ログイン"}
            </button>
          </div>
        </form>

        <div className="divider">または</div>

        <button type="button" className="btn btn--google" onClick={handleGoogleLogin} disabled={googleSubmitting}>
          {googleSubmitting ? "リダイレクト中…" : "Googleでログイン"}
        </button>

        <p className="auth-switch">
          アカウントをお持ちでない方は <Link href="/register">新規登録</Link>
        </p>
      </div>
    </main>
  );
}
