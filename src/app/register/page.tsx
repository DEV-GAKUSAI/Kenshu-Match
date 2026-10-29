"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/common/Toast";
import { signUp, signInWithGoogle } from "@/lib/auth/auth";
import { upsertRequesterProfile } from "@/lib/requester/profile";
import { RoleCard } from "@/components/auth/RoleCard";
import { mineRegisterUrl } from "@/lib/mine/login-url";
import type { UserRole } from "@/types/database";

type RoleCardKey = "instructor" | "business" | "individual";

const ROLE_CARD_TO_DB: Record<RoleCardKey, UserRole> = {
  instructor: "INSTRUCTOR",
  business: "COMPANY",
  individual: "INDIVIDUAL",
};

const ROLE_LABELS: Record<RoleCardKey, { name: string; desc: string }> = {
  instructor: { name: "研修講師", desc: "研修講師として、プロフィールに掲載する情報を次のステップで入力します。" },
  business: { name: "企業", desc: "企業アカウントとして、会社情報を次のステップで入力します。" },
  individual: { name: "生徒", desc: "生徒アカウントとして、基本情報を次のステップで入力します。" },
};

function friendlyErrorMessage(error: { message?: string } | null | undefined) {
  const msg = error?.message || "";
  if (msg.includes("already registered") || msg.includes("User already registered")) {
    return "このメールアドレスはすでに登録されています。ログインをお試しください。";
  }
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("network")) {
    return "通信エラーが発生しました。ネットワーク環境をご確認のうえ、もう一度お試しください。";
  }
  if (msg.includes("Password should be at least") || msg.includes("password")) {
    return "パスワードは8文字以上で入力してください。";
  }
  return "登録に失敗しました。時間をおいてもう一度お試しください。";
}

export default function RegisterPage() {
  const { showToast } = useToast();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedRole, setSelectedRole] = useState<RoleCardKey | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [nameHasError, setNameHasError] = useState(false);
  const [emailHasError, setEmailHasError] = useState(false);
  const [passwordHasError, setPasswordHasError] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState<string | null>(null);

  const isBusiness = selectedRole === "business";

  function handleSelectRole(role: RoleCardKey) {
    setSelectedRole(role);
  }

  function goToStep2() {
    if (!selectedRole) return;
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRole) return;

    const nameInvalid = displayName.trim().length === 0;
    const emailInvalid = !email.includes("@");
    const passwordInvalid = password.length < 8;
    setNameHasError(nameInvalid);
    setEmailHasError(emailInvalid);
    setPasswordHasError(passwordInvalid);
    setFormError("");

    if (nameInvalid || emailInvalid || passwordInvalid) {
      setFormError("入力内容をご確認ください。");
      return;
    }

    const dbRole = ROLE_CARD_TO_DB[selectedRole];
    setSubmitting(true);
    const { data, error } = await signUp(email, password, dbRole, displayName.trim());
    setSubmitting(false);

    if (error) {
      setFormError(friendlyErrorMessage(error));
      return;
    }

    if (data?.session) {
      // メール確認が不要な設定の場合：そのままログイン状態になる
      if (selectedRole === "business") {
        await upsertRequesterProfile({
          id: data.session.user.id,
          company_name: displayName.trim(),
          website: website.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
        });
      }
      showToast(`${ROLE_LABELS[selectedRole].name} として登録しました`);
      setTimeout(() => router.push("/mypage"), 700);
    } else {
      // メール確認が必要な設定の場合：確認後にログインしてもらう
      setConfirmationSent(email);
    }
  }

  async function handleGoogleAuth() {
    setGoogleSubmitting(true);
    // 役割の選択は Google 認証の「後」に /complete-profile で行う
    // （/auth/callback が PKCE の code を交換し、AuthContext が public.users に
    // 行が無いことを検知して自動的にそちらへ誘導する）。
    const { error } = await signInWithGoogle(`${window.location.origin}/auth/callback`);

    if (error) {
      showToast(`エラー：${friendlyErrorMessage(error)}`);
      setGoogleSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="step-track">
          <div className={`step-track__item${step === 1 ? " is-active" : " is-done"}`}>
            <span className={`hanko hanko--step${step === 1 ? " is-active" : " is-done"}`}>一</span>
            <span className="step-track__label">役割を選択</span>
          </div>
          <div className="step-track__line"></div>
          <div className={`step-track__item${step === 2 ? " is-active" : ""}`}>
            <span className={`hanko hanko--step${step === 2 ? " is-active" : ""}`}>二</span>
            <span className="step-track__label">アカウント情報</span>
          </div>
        </div>

        {step === 1 && (
          <section>
            <p className="auth-card__eyebrow">STEP 1 / 2</p>
            <h1 className="auth-card__title">どちらの立場で登録しますか？</h1>
            <p className="auth-card__desc">選択した役割に応じて、後ほど入力いただく項目が変わります。</p>

            <div className="role-grid">
              <RoleCard
                hanko="企"
                name="企業"
                description="自社の研修ニーズに合う講師を探し、依頼を送る。"
                selected={selectedRole === "business"}
                onSelect={() => handleSelectRole("business")}
              />
              <RoleCard
                hanko="生"
                name="生徒"
                description="生徒として学びたい分野の講師を探し、依頼を送る。"
                selected={selectedRole === "individual"}
                onSelect={() => handleSelectRole("individual")}
              />
            </div>

            <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: "14px 0 0" }}>
              研修講師の方は、Mineで登録してください。{" "}
              <a href={mineRegisterUrl(process.env.NEXT_PUBLIC_MINE_APP_URL)} style={{ color: "var(--color-primary)", fontWeight: 700 }}>
                Mineで講師として登録する
              </a>{" "}
              <Link href="/for-instructors" style={{ color: "var(--color-primary)", fontWeight: 700 }}>
                くわしく
              </Link>
            </p>

            <div className="form-actions">
              <button type="button" className="btn btn--primary btn--block" disabled={!selectedRole} onClick={goToStep2}>
                次へ進む
              </button>
            </div>
          </section>
        )}

        {step === 2 && selectedRole && !confirmationSent && (
          <section>
            <p className="auth-card__eyebrow">{`STEP 2 / 2 — ${ROLE_LABELS[selectedRole].name}として登録`}</p>
            <h1 className="auth-card__title">アカウント情報を入力</h1>
            <p className="auth-card__desc">{ROLE_LABELS[selectedRole].desc}</p>

            {formError && <div className="notice-banner is-visible">{formError}</div>}

            <form noValidate onSubmit={handleSubmit}>
              <div className={`form-field${nameHasError ? " has-error" : ""}`}>
                <label htmlFor="displayName">{isBusiness ? "会社名" : "お名前"}</label>
                <input
                  type="text"
                  id="displayName"
                  name="displayName"
                  placeholder={isBusiness ? "株式会社サンプル" : selectedRole === "instructor" ? "田中 陽子" : "山田 太郎"}
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <p className="form-field__error">お名前を入力してください。</p>
              </div>

              {isBusiness && (
                <div>
                  <div className="form-field">
                    <label htmlFor="website">企業のホームページ（任意）</label>
                    <input
                      type="text"
                      id="website"
                      placeholder="https://example.com"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="phone">電話番号（任意）</label>
                    <input
                      type="text"
                      id="phone"
                      placeholder="090-xxxx-xxxx"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="address">住所（任意）</label>
                    <input
                      type="text"
                      id="address"
                      placeholder="例：東京都渋谷区..."
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className={`form-field${emailHasError ? " has-error" : ""}`}>
                <label htmlFor="email">メールアドレス</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="form-field__error">メールアドレスを正しく入力してください。</p>
              </div>

              <div className={`form-field${passwordHasError ? " has-error" : ""}`}>
                <label htmlFor="password">パスワード</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="form-field__hint">半角英数字を組み合わせて8文字以上で設定してください。</p>
                <p className="form-field__error">パスワードは8文字以上で入力してください。</p>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setStep(1)}>
                  戻る
                </button>
                <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
                  {submitting ? "登録中…" : "アカウントを作成"}
                </button>
              </div>
            </form>

            <div className="divider">または</div>

            <button type="button" className="btn btn--google" onClick={handleGoogleAuth} disabled={googleSubmitting}>
              {googleSubmitting ? "リダイレクト中…" : "Googleで登録する"}
            </button>
          </section>
        )}

        {step === 2 && confirmationSent && (
          <section>
            <p className="auth-card__eyebrow">STEP 2 / 2</p>
            <h1 className="auth-card__title">確認メールを送信しました</h1>
            <p className="auth-card__desc">
              {confirmationSent} 宛に確認メールを送信しました。メール内のリンクをクリックしてから、ログインページでログインしてください。
            </p>
            <Link href="/login" className="btn btn--primary btn--block">
              ログインページへ
            </Link>
          </section>
        )}

        <p className="auth-switch">
          すでにアカウントをお持ちですか？ <Link href="/login">ログイン</Link>
        </p>
      </div>
    </main>
  );
}
