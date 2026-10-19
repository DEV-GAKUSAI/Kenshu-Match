"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/common/Toast";
import { useRoleTheme } from "@/hooks/useRoleTheme";
import { getTrainingSubcategoryOptions, findOrCreateSubcategory, getOtherCategory } from "@/lib/instructor/expertise";
import { createTrainingRequest } from "@/lib/requests/training-requests";
import { flushMineNotices } from "@/lib/mine/flush-client";
import type { RequestFormat } from "@/types/database";

interface SubcategoryOption {
  id: string;
  name: string;
  categoryName: string;
}

export default function PostRequestPage() {
  const { authReady, user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  useRoleTheme("business");

  const [subcategories, setSubcategories] = useState<SubcategoryOption[]>([]);
  const [expertise, setExpertise] = useState("");
  const [newFieldInput, setNewFieldInput] = useState("");
  const [addingField, setAddingField] = useState(false);

  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<RequestFormat>("online");
  const [budget, setBudget] = useState("");
  const [participants, setParticipants] = useState("");
  const [location, setLocation] = useState("");
  const [schedule, setSchedule] = useState("");
  const [description, setDescription] = useState("");

  const [titleHasError, setTitleHasError] = useState(false);
  const [descriptionHasError, setDescriptionHasError] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!authReady || !user || loadedRef.current) return;
    if (user.role === "INSTRUCTOR") return;
    loadedRef.current = true;

    (async () => {
      const { data, error } = await getTrainingSubcategoryOptions();
      if (error || !data) return;
      const rows = data as unknown as { id: string; name: string; training_categories: { name: string } | null }[];
      const options = rows.map((s) => ({ id: s.id, name: s.name, categoryName: s.training_categories?.name || "" }));
      setSubcategories(options);
      if (options.length) setExpertise(options[0].id);
    })();
  }, [authReady, user]);

  async function handleAddField() {
    const name = newFieldInput.trim();
    if (!name) return;

    const dup = subcategories.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (dup) {
      setExpertise(dup.id);
      setNewFieldInput("");
      return;
    }

    setAddingField(true);
    const { data: otherCategory, error: catError } = await getOtherCategory();
    if (catError || !otherCategory) {
      showToast("分野の追加に失敗しました。管理者にご確認ください。");
      setAddingField(false);
      return;
    }

    const { data: created, error } = await findOrCreateSubcategory(otherCategory.id, name);
    setAddingField(false);
    if (error || !created) {
      showToast("分野の追加に失敗しました。もう一度お試しください。");
      return;
    }

    setSubcategories((prev) => [...prev, { id: created.id, name: created.name, categoryName: otherCategory.name }]);
    setExpertise(created.id);
    setNewFieldInput("");
    showToast(`「${created.name}」を追加しました。`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const titleInvalid = !title.trim();
    const descriptionInvalid = !description.trim();
    const locationInvalid = format !== "online" && !location.trim();
    const expertiseInvalid = !expertise;
    const participantsInvalid = !(Number.isInteger(Number(participants)) && Number(participants) >= 1);
    setTitleHasError(titleInvalid);
    setDescriptionHasError(descriptionInvalid);

    if (titleInvalid || descriptionInvalid || locationInvalid || expertiseInvalid || participantsInvalid) {
      setFormError(
        locationInvalid
          ? "対面の場合は実施場所の入力が必要です。"
          : expertiseInvalid
            ? "分野を選択してください。"
            : participantsInvalid
              ? "対象人数を入力してください。"
              : "入力内容をご確認ください。"
      );
      return;
    }
    setFormError("");

    setSubmitting(true);
    const { error } = await createTrainingRequest({
      requester_id: user.id,
      requester_type: user.role === "COMPANY" ? "company" : "individual",
      title: title.trim(),
      description: description.trim(),
      expertise_field: expertise,
      budget: Number(budget) || null,
      participant_count: Number(participants),
      preferred_format: format,
      location: format === "online" ? null : location.trim(),
      preferred_schedule: schedule.trim() || null,
      target_instructor_id: null,
    });
    setSubmitting(false);

    if (error) {
      setFormError(`送信に失敗しました：${error.message}`);
      return;
    }

    flushMineNotices();
    showToast("依頼を公募しました。講師からの返信をマイページで確認できます。");
    setTimeout(() => router.push("/mypage"), 800);
  }

  if (!authReady) {
    return (
      <main className="detail-page">
        <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="detail-page">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <span className="hanko hanko--logo" style={{ margin: "0 auto 16px" }}>
            研
          </span>
          <p className="empty-state__title">依頼を投稿するにはログインが必要です</p>
          <p className="empty-state__desc">研修の依頼は、企業または生徒アカウントでログインした場合のみ投稿できます。</p>
          <div className="form-actions" style={{ flexDirection: "column", maxWidth: 320, margin: "16px auto 0" }}>
            <Link href="/login" className="btn btn--primary btn--block">
              ログイン
            </Link>
            <Link href="/register" className="btn btn--ghost btn--block">
              新規登録
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (user.role === "INSTRUCTOR") {
    return (
      <main className="detail-page">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <p className="empty-state__title">講師アカウントではご利用いただけません</p>
          <p className="empty-state__desc">研修の依頼投稿は、企業または生徒アカウントでログインした場合のみ利用できます。</p>
          <Link href="/open-requests" className="btn btn--primary" style={{ marginTop: 16 }}>
            公募中の依頼を見る
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="detail-page">
      <p className="breadcrumb">
        <Link href="/">トップ</Link>
        <span className="sep">/</span>
        研修を依頼する（公募）
      </p>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 className="detail-header__name" style={{ marginBottom: 8 }}>
          研修を依頼する（公募）
        </h1>
        <p className="modal-desc" style={{ marginBottom: 24 }}>
          特定の講師を指定せず、条件に合う講師からの提案を広く募集します。投稿後、興味を持った講師が承諾・見積りで返信します。
        </p>

        <div className="form-card">
          {formError && <div className="notice-banner is-visible">{formError}</div>}

          <form noValidate onSubmit={handleSubmit}>
            <div className={`form-field${titleHasError ? " has-error" : ""}`}>
              <label htmlFor="reqTitle">依頼タイトル</label>
              <input
                type="text"
                id="reqTitle"
                placeholder="例：新人エンジニア向けPython基礎研修"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <p className="form-field__error">タイトルを入力してください。</p>
            </div>

            <div className="form-field">
              <label htmlFor="reqExpertise">希望分野</label>
              <select id="reqExpertise" required value={expertise} onChange={(e) => setExpertise(e.target.value)}>
                {subcategories.length === 0 ? (
                  <option value="">分野データを読み込めませんでした</option>
                ) : (
                  subcategories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.categoryName} ／ {s.name}
                    </option>
                  ))
                )}
              </select>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input
                  type="text"
                  placeholder="リストにない分野を入力（例：〇〇研修）"
                  maxLength={50}
                  style={{ flex: 1, padding: "9px 12px", fontSize: 13, border: "1px solid var(--color-border)", borderRadius: "var(--radius-s)", background: "var(--color-surface)" }}
                  value={newFieldInput}
                  onChange={(e) => setNewFieldInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddField();
                    }
                  }}
                />
                <button type="button" className="btn btn--ghost btn--sm" disabled={addingField} onClick={handleAddField}>
                  {addingField ? "追加中…" : "追加"}
                </button>
              </div>
              <p className="form-field__hint">リストに希望の分野がない場合は、こちらから新しく追加できます。</p>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label htmlFor="reqFormat">希望形態</label>
                <select id="reqFormat" required value={format} onChange={(e) => setFormat(e.target.value as RequestFormat)}>
                  <option value="online">オンライン</option>
                  <option value="offline">対面</option>
                  <option value="both">オンライン・対面 両方</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="reqBudget">想定予算（時間あたり）</label>
                <input type="number" id="reqBudget" placeholder="例：15000" min={0} step={1000} value={budget} onChange={(e) => setBudget(e.target.value)} />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="reqParticipants">対象人数</label>
              <input type="number" id="reqParticipants" required placeholder="例：10" min={1} step={1} value={participants} onChange={(e) => setParticipants(e.target.value)} />
            </div>

            {format !== "online" && (
              <div className="form-field" id="reqLocationField">
                <label htmlFor="reqLocation">実施場所（対面の場合は必須）</label>
                <input type="text" id="reqLocation" placeholder="例：東京都内オフィス" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            )}

            <div className="form-field">
              <label htmlFor="reqSchedule">希望日程</label>
              <input type="text" id="reqSchedule" placeholder="例：8月中旬 平日午後" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
            </div>

            <div className={`form-field${descriptionHasError ? " has-error" : ""}`}>
              <label htmlFor="reqDescription">依頼内容の詳細</label>
              <textarea
                id="reqDescription"
                rows={5}
                placeholder="研修の目的、対象人数、レベル感などをご記入ください"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="form-field__error">依頼内容を入力してください。</p>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
                {submitting ? "送信中…" : "この内容で公募する"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
