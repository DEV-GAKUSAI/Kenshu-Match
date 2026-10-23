"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/common/Toast";
import { createClient } from "@/lib/supabase/client";
import { completeOAuthProfile } from "@/lib/auth/auth";
import { RoleCard } from "@/components/auth/RoleCard";
import { mineLoginUrl, mineRegisterUrl } from "@/lib/mine/login-url";
import type { UserRole } from "@/types/database";

export default function CompleteProfilePage() {
  const { authReady, needsProfileCompletion, user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameHasError, setNameHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  // Mineのアカウントでこのページに来た場合は、新しいアカウントを作らせずMineから開いてもらう
  const [isMineAccount, setIsMineAccount] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    const supabase = createClient();

    // すでにプロフィールが完成している（＝直接URLを叩いてこのページに来た）場合はマイページへ
    if (!needsProfileCompletion && user) {
      router.replace("/mypage");
      return;
    }

    // セッション自体が無い場合（未ログインで直接アクセス）はログインページへ
    if (!needsProfileCompletion && !user) {
      supabase.auth.getSession().then(({ data }) => {
        if (!data?.session) {
          router.replace("/login");
        } else {
          setHasSession(true);
        }
      });
      return;
    }

    // Googleアカウントの表示名を初期値として入れておく
    supabase.auth.getUser().then(async ({ data }) => {
      const meta = data?.user?.user_metadata || {};
      setDisplayName(meta.full_name || meta.name || "");
      const uid = data?.user?.id;
      if (!uid) return;
      try {
        // Mine と同じデータベース。自分の行だけ読めるので、Mine の会員かどうかが分かる
        const { data: mineRow } = await (
          supabase as unknown as {
            from: (t: string) => {
              select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } };
            };
          }
        )
          .from("mine_profiles")
          .select("user_id")
          .eq("user_id", uid)
          .maybeSingle();
        if (mineRow) {
          setIsMineAccount(true);
          return;
        }
        // Mine / Engineer Match の会員は共有の users テーブルに別の役割（ENGINEER など）で入っている
        const { data: userRow } = await supabase.from("users").select("id").eq("id", uid).maybeSingle();
        if (userRow) setIsMineAccount(true);
      } catch {
        // 判定できないときは、これまでどおり役割の選択を表示する
      }
    });
  }, [authReady, needsProfileCompletion, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");

    const nameInvalid = displayName.trim().length === 0;
    setNameHasError(nameInvalid);

    if (!selectedRole || nameInvalid) {
      setErrorMessage(!selectedRole ? "役割を選択してください。" : "お名前を入力してください。");
      return;
    }

    setSubmitting(true);
    const { error } = await completeOAuthProfile(selectedRole, displayName.trim());
    setSubmitting(false);

    if (error) {
      setErrorMessage(`登録に失敗しました：${error.message}`);
      return;
    }

    showToast("登録が完了しました");
    // needsProfileCompletion を再判定させるため、セッションを読み直す
    await refreshProfile();
    setTimeout(() => router.push("/mypage"), 600);
  }

  if (!authReady || (!needsProfileCompletion && hasSession === null)) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>
        </div>
      </main>
    );
  }

  if (isMineAccount) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p className="auth-card__eyebrow">Mine</p>
          <h1 className="auth-card__title">Mineのアカウントでログインしています</h1>
          <p className="auth-card__desc">講師の方は、Mineから開くと、これまでの情報がそのまま使えます。</p>
          <a className="btn btn--primary btn--block" href={mineLoginUrl(process.env.NEXT_PUBLIC_MINE_APP_URL)}>
            Mineでログインする
          </a>
          <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "14px 0 0" }}>
            企業・生徒として新しく登録する場合は、別のメールアドレスで登録してください。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="auth-card__eyebrow">ようこそ</p>
        <h1 className="auth-card__title">どちらの立場でご利用しますか？</h1>
        <p className="auth-card__desc">Googleアカウントでの初回ログインです。役割を選択して登録を完了してください。</p>

        {errorMessage && <div className="notice-banner is-visible">{errorMessage}</div>}

        <section>
          <div className="role-grid">
            <RoleCard
              hanko="企"
              name="企業"
              description="自社の研修ニーズに合う講師を探し、依頼を送る。"
              selected={selectedRole === "COMPANY"}
              onSelect={() => setSelectedRole("COMPANY")}
            />
            <RoleCard
              hanko="生"
              name="生徒"
              description="生徒として学びたい分野の講師を探し、依頼を送る。"
              selected={selectedRole === "INDIVIDUAL"}
              onSelect={() => setSelectedRole("INDIVIDUAL")}
            />
          </div>
        </section>

        <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: "14px 0 0" }}>
          研修講師の方は、Mineで登録してください。{" "}
          <a href={mineRegisterUrl(process.env.NEXT_PUBLIC_MINE_APP_URL)} style={{ color: "var(--color-primary)", fontWeight: 700 }}>
            Mineで講師として登録する
          </a>
        </p>

        <form noValidate style={{ marginTop: 20 }} onSubmit={handleSubmit}>
          <div className={`form-field${nameHasError ? " has-error" : ""}`}>
            <label htmlFor="displayName">お名前</label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              placeholder="山田 太郎"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="form-field__error">お名前を入力してください。</p>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary btn--block" disabled={!selectedRole || submitting}>
              {submitting ? "登録中…" : "この内容で登録を完了する"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
