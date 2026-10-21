"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/common/Toast";
import { getInstructorProfile, upsertInstructorProfile } from "@/lib/instructor/profile";
import {
  getInstructorExpertiseIds,
  replaceInstructorExpertise,
  getTrainingCategoriesWithSubcategories,
  findOrCreateSubcategory,
} from "@/lib/instructor/expertise";
import type { WorkStyle } from "@/types/database";
import { Select } from "@/components/ui/Select";

const JP_PREFECTURES = [
  "オンライン対応（全国）",
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

interface CategoryOption {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
}

interface NewSkillDraft {
  categoryId: string;
  name: string;
}

function friendlyErrorMessage(error: { message?: string } | null | undefined) {
  const msg = error?.message || "";
  if (msg.includes("chk_instructor_profiles_rate_order")) {
    return "最低単価は希望単価以下の金額にしてください。";
  }
  return "保存に失敗しました。入力内容をご確認のうえ、もう一度お試しください。";
}

export default function InstructorProfileEditPage() {
  const { authReady, user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [yearsExp, setYearsExp] = useState("");
  const [prefectures, setPrefectures] = useState<string[]>([]);
  const [prefectureOpen, setPrefectureOpen] = useState(false);
  const [workStyle, setWorkStyle] = useState<WorkStyle | "">("");
  const [selfPr, setSelfPr] = useState("");
  const [rateMax, setRateMax] = useState("");
  const [rateMin, setRateMin] = useState("");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [certificationInput, setCertificationInput] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState<Set<string>>(new Set());
  const [newSkillDrafts, setNewSkillDrafts] = useState<NewSkillDraft[]>([]);
  const [newSkillInputs, setNewSkillInputs] = useState<Record<string, string>>({});

  const [rateMinHasError, setRateMinHasError] = useState(false);
  const [rateMaxHasError, setRateMaxHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authReady || !user || user.role !== "INSTRUCTOR") {
      return;
    }

    (async () => {
      const { data: profile, error: fetchError } = await getInstructorProfile(user.id);
      if (fetchError) {
        setLoadError(fetchError.message);
        setLoading(false);
        return;
      }

      if (profile) {
        setYearsExp(profile.years_of_experience != null ? String(profile.years_of_experience) : "");
        setPrefectures(profile.prefectures || []);
        setWorkStyle(profile.work_style || "");
        setSelfPr(profile.self_pr || "");
        setRateMax(profile.desired_rate_max != null ? String(profile.desired_rate_max) : "");
        setRateMin(profile.desired_rate_min != null ? String(profile.desired_rate_min) : "");
        setCertifications(profile.certifications || []);
        setPortfolioUrl(profile.portfolio_url || "");
        setAvatarUrl(profile.avatar_url || "");
        setContactEmail(profile.contact_email || "");
        setContactPhone(profile.contact_phone || "");
        setIsPublic(profile.is_public !== false);
      }

      const { data: cats, error: catError } = await getTrainingCategoriesWithSubcategories();
      if (!catError && cats) {
        const rows = cats as unknown as { id: string; name: string; training_subcategories: { id: string; name: string }[] }[];
        setCategories(
          rows.map((c) => ({
            id: c.id,
            name: c.name,
            subcategories: c.training_subcategories || [],
          }))
        );
      }

      const ids = await getInstructorExpertiseIds(user.id);
      setSelectedSubcategoryIds(new Set(ids));

      setLoading(false);
    })();
  }, [authReady, user]);

  function togglePrefecture(pref: string) {
    setPrefectures((prev) => (prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]));
  }

  function toggleSubcategory(id: string) {
    setSelectedSubcategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addNewSkill(categoryId: string) {
    const name = (newSkillInputs[categoryId] || "").trim();
    if (!name) return;

    // 同じカテゴリ内に同名（大文字小文字区別なし）のスキルが既にあれば、重複追加せず選択するだけにする。
    const category = categories.find((c) => c.id === categoryId);
    const dup = category?.subcategories.find((sc) => sc.name.toLowerCase() === name.toLowerCase());
    if (dup) {
      setSelectedSubcategoryIds((prev) => new Set(prev).add(dup.id));
      setNewSkillInputs((prev) => ({ ...prev, [categoryId]: "" }));
      return;
    }
    const dupDraft = newSkillDrafts.find((d) => d.categoryId === categoryId && d.name.toLowerCase() === name.toLowerCase());
    if (dupDraft) {
      setNewSkillInputs((prev) => ({ ...prev, [categoryId]: "" }));
      return;
    }

    setNewSkillDrafts((prev) => [...prev, { categoryId, name }]);
    setNewSkillInputs((prev) => ({ ...prev, [categoryId]: "" }));
  }

  function addCertification() {
    const name = certificationInput.trim();
    if (!name) return;
    if (certifications.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setCertificationInput("");
      return;
    }
    setCertifications((prev) => [...prev, name]);
    setCertificationInput("");
  }

  function removeCertification(name: string) {
    setCertifications((prev) => prev.filter((c) => c !== name));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setErrorMessage("");
    setRateMinHasError(false);
    setRateMaxHasError(false);

    const desiredRateMin = rateMin ? Number(rateMin) : null;
    const desiredRateMax = rateMax ? Number(rateMax) : null;

    // 希望単価・最低単価は必須項目。
    if (desiredRateMin === null || desiredRateMax === null) {
      if (desiredRateMin === null) setRateMinHasError(true);
      else setRateMaxHasError(true);
      return;
    }

    // フロント側バリデーション：DBのCHECK制約 chk_instructor_profiles_rate_order
    // (desired_rate_min <= desired_rate_max) と同じ条件を、送信前にここで検証する。
    if (desiredRateMin > desiredRateMax) {
      setErrorMessage("最低単価は希望単価以下の金額にしてください。");
      setRateMinHasError(true);
      return;
    }

    setSubmitting(true);

    // 専門分野の新規スキルをDBに反映する（同名スキルが既にあればそれを再利用し、重複作成を防ぐ）。
    const newlyResolvedIds: string[] = [];
    for (const draft of newSkillDrafts) {
      const { data, error } = await findOrCreateSubcategory(draft.categoryId, draft.name);
      if (error || !data) {
        console.error("subcategory create error:", error);
        setSubmitting(false);
        setErrorMessage("新しいスキルの登録に失敗しました。もう一度お試しください。");
        return;
      }
      newlyResolvedIds.push(data.id);
    }

    const selectedIds = [...selectedSubcategoryIds, ...newlyResolvedIds];

    const { error } = await upsertInstructorProfile({
      id: user.id,
      prefectures: prefectures.length ? prefectures : null,
      years_of_experience: yearsExp ? Number(yearsExp) : null,
      work_style: workStyle || null,
      self_pr: selfPr.trim() || null,
      desired_rate_min: desiredRateMin,
      desired_rate_max: desiredRateMax,
      certifications: certifications.length ? certifications : null,
      portfolio_url: portfolioUrl.trim() || null,
      avatar_url: avatarUrl.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      is_public: isPublic,
    });

    // 専門分野は「全削除 → 選択分を再登録」で置き換える（シンプルで確実）。
    let expertiseError = null;
    if (!error) {
      const { error: expError } = await replaceInstructorExpertise(user.id, selectedIds);
      expertiseError = expError;
    }

    setSubmitting(false);

    const saveError = error || expertiseError;
    if (saveError) {
      console.error("profile save error:", saveError);
      setErrorMessage(friendlyErrorMessage(saveError));
      return;
    }

    showToast("プロフィールを保存しました");
    setTimeout(() => router.push("/mypage"), 700);
  }

  const prefectureSummary = prefectures.length ? `${prefectures.length}件選択中：${prefectures.join("、")}` : "選択してください";

  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 40 }}>
      <div className="auth-card" style={{ maxWidth: 640 }}>
        <p className="auth-card__eyebrow">INSTRUCTOR PROFILE</p>
        <h1 className="auth-card__title">講師プロフィール</h1>
        <p className="auth-card__desc">
          ここで入力した内容は「講師を探す」の検索結果・詳細ページに公開されます。
          連絡先（メール・電話）は依頼が承諾されるまで他のユーザーには表示されません。
        </p>

        {errorMessage && <div className="notice-banner is-visible">{errorMessage}</div>}

        {!authReady ? (
          <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>
        ) : !user ? (
          <p style={{ fontSize: 13 }}>
            プロフィールを編集するにはログインしてください。{" "}
            <Link href="/login" style={{ color: "var(--color-primary)", fontWeight: 700 }}>
              ログイン
            </Link>
          </p>
        ) : user.role !== "INSTRUCTOR" ? (
          <>
            <p style={{ fontSize: 13 }}>このページは講師アカウントのみ利用できます。</p>
            <Link href="/mypage" className="btn btn--ghost" style={{ marginTop: 12 }}>
              マイページへ戻る
            </Link>
          </>
        ) : loading ? (
          <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>
        ) : loadError ? (
          <p style={{ color: "var(--color-danger)", fontSize: 13 }}>読み込みエラー：{loadError}</p>
        ) : (
          <form noValidate onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="yearsExp">経験年数</label>
              <input
                type="number"
                id="yearsExp"
                min={0}
                step={1}
                placeholder="例：8"
                value={yearsExp}
                onChange={(e) => setYearsExp(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>対応エリア（都道府県・複数選択可）</label>
              <details
                open={prefectureOpen}
                onToggle={(e) => setPrefectureOpen((e.target as HTMLDetailsElement).open)}
                style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-s)", background: "var(--color-bg)" }}
              >
                <summary style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13.5, color: "var(--color-text-muted)" }}>
                  {prefectureSummary}
                </summary>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 14, borderTop: "1px solid var(--color-border)" }}>
                  {JP_PREFECTURES.map((pref) => (
                    <label
                      key={pref}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12.5,
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-pill)",
                        padding: "5px 12px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={prefectures.includes(pref)}
                        onChange={() => togglePrefecture(pref)}
                      />
                      {pref}
                    </label>
                  ))}
                </div>
              </details>
            </div>

            <div className="form-field">
              <label htmlFor="workStyle">対応形態</label>
              <Select id="workStyle" value={workStyle} onChange={(e) => setWorkStyle(e.target.value as WorkStyle | "")}>
                <option value="">選択してください</option>
                <option value="ONLINE">オンラインのみ</option>
                <option value="ONSITE">対面のみ</option>
                <option value="HYBRID">オンライン・対面 両方</option>
              </Select>
            </div>

            <div className="form-field">
              <label htmlFor="selfPr">自己紹介・実績</label>
              <textarea
                id="selfPr"
                rows={5}
                placeholder="研修内容、実績、得意分野などをご記入ください"
                value={selfPr}
                onChange={(e) => setSelfPr(e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className={`form-field${rateMaxHasError ? " has-error" : ""}`}>
                <label htmlFor="rateMax">希望単価（円／時間）</label>
                <input
                  type="number"
                  id="rateMax"
                  min={0}
                  step={1000}
                  placeholder="例：18000"
                  required
                  value={rateMax}
                  onChange={(e) => setRateMax(e.target.value)}
                />
                <p className="form-field__error">希望単価を入力してください。</p>
              </div>
              <div className={`form-field${rateMinHasError ? " has-error" : ""}`}>
                <label htmlFor="rateMin">最低単価（円／時間）</label>
                <input
                  type="number"
                  id="rateMin"
                  min={0}
                  step={1000}
                  placeholder="例：10000"
                  required
                  value={rateMin}
                  onChange={(e) => setRateMin(e.target.value)}
                />
                <p className="form-field__error">最低単価を入力してください。</p>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="certifications">保有資格</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {certifications.map((c) => (
                  <span
                    key={c}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12.5,
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-pill)",
                      padding: "5px 12px",
                    }}
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => removeCertification(c)}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-ink-soft)", fontSize: 13, lineHeight: 1, padding: 0 }}
                      aria-label={`${c}を削除`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  id="certifications"
                  placeholder="例：基本情報技術者試験"
                  value={certificationInput}
                  onChange={(e) => setCertificationInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCertification();
                    }
                  }}
                />
                <button type="button" className="btn btn--ghost btn--sm" onClick={addCertification}>
                  追加
                </button>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="portfolioUrl">ポートフォリオ／実績URL（任意）</label>
              <input
                type="text"
                id="portfolioUrl"
                placeholder="https://..."
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="avatarUrl">プロフィール画像URL（任意）</label>
              <input
                type="text"
                id="avatarUrl"
                placeholder="https://..."
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-field">
                <label htmlFor="contactEmail">連絡先メール（マッチング成立後に開示）</label>
                <input
                  type="email"
                  id="contactEmail"
                  placeholder="you@example.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="contactPhone">連絡先電話番号（マッチング成立後に開示）</label>
                <input
                  type="text"
                  id="contactPhone"
                  placeholder="090-xxxx-xxxx"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="form-field">
              <label>専門分野（複数選択可）</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 14, background: "var(--color-bg)", borderRadius: "var(--radius-s)" }}>
                {categories.length === 0 && (
                  <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: 0 }}>読み込み中…</p>
                )}
                {categories.map((cat) => (
                  <div key={cat.id}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, margin: "0 0 6px" }}>{cat.name}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {cat.subcategories.map((sc) => (
                        <label
                          key={sc.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 12.5,
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-pill)",
                            padding: "5px 12px",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            style={{ width: "auto" }}
                            checked={selectedSubcategoryIds.has(sc.id)}
                            onChange={() => toggleSubcategory(sc.id)}
                          />
                          {sc.name}
                        </label>
                      ))}
                      {newSkillDrafts
                        .filter((d) => d.categoryId === cat.id)
                        .map((d) => (
                          <label
                            key={`new-${cat.id}-${d.name}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 12.5,
                              background: "var(--color-bg)",
                              border: "1px solid var(--color-primary)",
                              borderRadius: "var(--radius-pill)",
                              padding: "5px 12px",
                              cursor: "pointer",
                            }}
                          >
                            <input type="checkbox" checked readOnly style={{ width: "auto" }} />
                            {d.name}
                            <span style={{ fontSize: 10.5, color: "var(--color-primary)", fontWeight: 700 }}>NEW</span>
                          </label>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <input
                        type="text"
                        placeholder="新しいスキル名を入力（例：〇〇研修）"
                        maxLength={50}
                        style={{ flex: 1, padding: "7px 10px", fontSize: 12.5, border: "1px solid var(--color-border)", borderRadius: "var(--radius-s)", background: "var(--color-surface)" }}
                        value={newSkillInputs[cat.id] || ""}
                        onChange={(e) => setNewSkillInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addNewSkill(cat.id);
                          }
                        }}
                      />
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => addNewSkill(cat.id)}>
                        追加
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-field" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label className="toggle-switch">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                <span className="toggle-switch__track"></span>
              </label>
              <label style={{ margin: 0, cursor: "pointer" }}>プロフィールを公開する（オフにすると検索結果に表示されません）</label>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
                {submitting ? "保存中…" : "保存する"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
