"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Select";

export default function ContactPage() {
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState("service");
  const [message, setMessage] = useState("");
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // ⚠️ 現時点では送信先（メール通知やDB保存）が未実装のため、フォームの見た目のみ用意しています。
  // 実際に問い合わせを受け取るには、以下のいずれかの実装が必要です：
  //   1. Supabase に "contact_messages" テーブルを作り、ここから insert する
  //   2. メール送信サービス（Resend等）と連携する Edge Function を呼び出す
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowError(false);
    setShowSuccess(false);

    if (!name.trim() || !email.includes("@") || !message.trim()) {
      setShowError(true);
      return;
    }

    // TODO: ここで実際の送信処理（Supabase insert または Edge Function 呼び出し）を行う
    console.log("お問い合わせ（未送信・実装待ち）:", { company, name, email, type, message });

    setShowSuccess(true);
    setCompany("");
    setName("");
    setEmail("");
    setType("service");
    setMessage("");
  }

  return (
    <main className="auth-page" style={{ minHeight: "auto", padding: "56px 20px" }}>
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <p className="auth-card__eyebrow">CONTACT</p>
        <h1 className="auth-card__title">お問い合わせ</h1>
        <p className="auth-card__desc">サービスに関するご質問・ご要望は、以下のフォームよりお気軽にご連絡ください。</p>

        {showError && <div className="notice-banner is-visible">入力内容をご確認ください。</div>}
        {showSuccess && (
          <div className="notice-banner is-visible" style={{ background: "#E1F6EE", color: "#0F9C79" }}>
            お問い合わせを受け付けました。担当者よりご連絡いたします。
          </div>
        )}

        <form noValidate onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="contactCompany">会社名</label>
            <input
              type="text"
              id="contactCompany"
              placeholder="株式会社サンプル"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="contactName">
              お名前 <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <input
              type="text"
              id="contactName"
              placeholder="山田 太郎"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="form-field__error">お名前を入力してください。</p>
          </div>

          <div className="form-field">
            <label htmlFor="contactEmail">
              メールアドレス <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <input
              type="email"
              id="contactEmail"
              placeholder="example@company.co.jp"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="form-field__error">メールアドレスを正しく入力してください。</p>
          </div>

          <div className="form-field">
            <label htmlFor="contactType">お問い合わせ種別</label>
            <Select id="contactType" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="service">サービスについて</option>
              <option value="instructor">講師登録について</option>
              <option value="business">企業・個人向け機能について</option>
              <option value="bug">不具合の報告</option>
              <option value="other">その他</option>
            </Select>
          </div>

          <div className="form-field">
            <label htmlFor="contactMessage">
              お問い合わせ内容 <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <textarea
              id="contactMessage"
              rows={5}
              placeholder="お問い合わせ内容をご記入ください。"
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="form-field__error">お問い合わせ内容を入力してください。</p>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary btn--block">
              送信する
            </button>
          </div>
        </form>

        <p style={{ fontSize: 11.5, color: "var(--color-ink-soft)", textAlign: "center", marginTop: 16 }}>
          ※ 現在このフォームはデモ表示のため、送信機能は実装されていません。
        </p>
      </div>
    </main>
  );
}
