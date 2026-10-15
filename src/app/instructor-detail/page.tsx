"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/common/Toast";
import { useRoleTheme } from "@/hooks/useRoleTheme";
import { educationLine, qualificationLine, skillLine, totalExperienceLabel, workHistoryLine, type MinePublicProfile } from "@/lib/mine/public-profile";
import { getInstructorById } from "@/lib/instructor/profile";
import { getTrainingSubcategoryOptions } from "@/lib/instructor/expertise";
import { getInstructorReviews } from "@/lib/requests/reviews";
import { PublicSurveyBlock } from "@/components/survey/PublicSurveyBlock";
import { createTrainingRequest } from "@/lib/requests/training-requests";
import { MOCK_INSTRUCTORS, INSTRUCTOR_DETAILS, MOCK_REVIEWS } from "@/lib/mockInstructors";
import type { InstructorPublicDirectoryRow, RequestFormat, WorkStyle } from "@/types/database";

const FORMAT_LABEL: Record<string, string> = { online: "オンライン対応", offline: "対面のみ", both: "オンライン・対面 両方" };
const WORK_STYLE_LABEL: Record<WorkStyle, string> = { ONLINE: "オンラインのみ", ONSITE: "対面のみ", HYBRID: "オンライン・対面 両方" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DisplayInstructor {
  id: string;
  name: string;
  initial: string;
  expertiseFields: string[];
  workFormatLabel: string;
  workArea: string;
  hourlyRateLabel: string;
  yearsExperience: number | string;
  ratingAvg: number;
  reviewCount: number;
  introduction: string;
  avatarUrl?: string | null;
  portfolioUrl?: string | null;
}
interface DisplayReview {
  reviewerName: string;
  reviewerType: string;
  rating: number;
  comment: string;
  date: string;
}
interface SubcategoryOption {
  id: string;
  name: string;
  categoryName: string;
}

function InstructorDetailInner() {
  const searchParams = useSearchParams();
  const { authReady, user } = useAuth();
  const { showToast } = useToast();
  useRoleTheme("business");

  const rawId = searchParams.get("id") || MOCK_INSTRUCTORS[0].id;
  const isRealId = UUID_RE.test(rawId);

  const [instructor, setInstructor] = useState<DisplayInstructor | null>(null);
  const [detail, setDetail] = useState<{ bio?: string | null; certifications?: string[] | null; availableSchedule?: string | null }>({});
  const [mine, setMine] = useState<MinePublicProfile | null>(null);
  const [reviews, setReviews] = useState<DisplayReview[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [subcategories, setSubcategories] = useState<SubcategoryOption[]>([]);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [loginGateOpen, setLoginGateOpen] = useState(false);
  const [loginGateText, setLoginGateText] = useState({
    title: "ログインが必要です",
    desc: "講師に依頼を送るには、企業または生徒アカウントでログインしてください。",
  });

  const [reqTitle, setReqTitle] = useState("");
  const [reqExpertise, setReqExpertise] = useState("");
  const [reqFormat, setReqFormat] = useState<RequestFormat>("online");
  const [reqBudget, setReqBudget] = useState("");
  const [reqParticipants, setReqParticipants] = useState("");
  const [reqLocation, setReqLocation] = useState("");
  const [reqSchedule, setReqSchedule] = useState("");
  const [reqDescription, setReqDescription] = useState("");
  const [reqTitleError, setReqTitleError] = useState(false);
  const [reqDescError, setReqDescError] = useState(false);
  const [reqFormError, setReqFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (isRealId) {
        const { data: profile, error } = await getInstructorById(rawId);
        if (error || !profile) {
          setNotFound(true);
          return;
        }
        const p = profile as InstructorPublicDirectoryRow;
        setInstructor({
          id: p.id,
          name: "…",
          initial: "?",
          expertiseFields: p.expertise_fields || [],
          workFormatLabel: "応相談",
          workArea: "エリア未設定",
          hourlyRateLabel: "応相談",
          yearsExperience: "-",
          ratingAvg: p.rating_avg != null ? Number(p.rating_avg) : 0,
          reviewCount: 0,
          introduction: "",
          avatarUrl: null,
          portfolioUrl: null,
        });
        setDetail({ bio: null, certifications: null, availableSchedule: null });

        // Name and profile come from Mine: initials plus only the items the instructor allowed.
        try {
          const res = await fetch(`/api/instructors/${rawId}/mine-profile`, { cache: "no-store" });
          if (res.ok) {
            const body = (await res.json()) as { initials?: string; profile?: MinePublicProfile | null; photoUrl?: string | null };
            const initials = body.initials || "";
            setMine(body.profile ?? null);
            const tc = body.profile?.training_conditions;
            setInstructor((prev) =>
              prev
                ? {
                    ...prev,
                    name: initials || "（名前未設定）",
                    initial: initials.slice(0, 1) || "?",
                    introduction: "",
                    avatarUrl: body.photoUrl ?? null,
                    workFormatLabel: tc?.work_style && tc.work_style in WORK_STYLE_LABEL ? WORK_STYLE_LABEL[tc.work_style as WorkStyle] : "応相談",
                    workArea: tc?.prefectures?.length ? tc.prefectures.join("、") : "エリア未設定",
                    hourlyRateLabel: typeof tc?.hourly_rate_min === "number" ? `¥${tc.hourly_rate_min.toLocaleString()}` : "応相談",
                  }
                : prev,
            );
          } else {
            setInstructor((prev) => (prev ? { ...prev, name: "（名前未設定）", initial: "?", introduction: "" } : prev));
          }
        } catch {
          setInstructor((prev) => (prev ? { ...prev, name: "（名前未設定）", initial: "?", introduction: "" } : prev));
        }

        const { data: reviewRows } = await getInstructorReviews(rawId);
        const mapped = (reviewRows || []).map((r) => ({
          reviewerName: "利用者",
          reviewerType: "business",
          rating: r.rating,
          comment: r.comment || "",
          date: (r.created_at || "").slice(0, 10),
        }));
        setReviews(mapped);
        setInstructor((prev) => (prev ? { ...prev, reviewCount: mapped.length } : prev));
      } else {
        // --- モックデータ（デモ用の旧データ、id が UUID でない場合） ---
        const mock = MOCK_INSTRUCTORS.find((i) => i.id === rawId) || MOCK_INSTRUCTORS[0];
        setInstructor({
          id: mock.id,
          name: mock.name,
          initial: mock.initial,
          expertiseFields: mock.expertiseFields,
          workFormatLabel: FORMAT_LABEL[mock.workFormat] || "応相談",
          workArea: mock.workArea,
          hourlyRateLabel: `¥${mock.hourlyRate.toLocaleString()}`,
          yearsExperience: mock.yearsExperience,
          ratingAvg: mock.ratingAvg,
          reviewCount: mock.reviewCount,
          introduction: mock.introduction,
          avatarUrl: null,
          portfolioUrl: null,
        });
        setDetail(INSTRUCTOR_DETAILS[mock.id] || {});
        setReviews(MOCK_REVIEWS[mock.id] || []);
      }
    })();
  }, [rawId, isRealId]);

  useEffect(() => {
    if (!requestModalOpen || !instructor) return;
    (async () => {
      if (subcategories.length === 0) {
        const { data, error } = await getTrainingSubcategoryOptions();
        if (!error && data) {
          const rows = data as unknown as { id: string; name: string; training_categories: { name: string } | null }[];
          const options = rows.map((s) => ({ id: s.id, name: s.name, categoryName: s.training_categories?.name || "" }));
          setSubcategories(options);
          if (options.length) setReqExpertise(options[0].id);
        }
      }
    })();
  }, [requestModalOpen, instructor, subcategories.length]);

  function handleRequestClick() {
    if (!authReady) return;
    if (!user) {
      setLoginGateText({ title: "ログインが必要です", desc: "講師に依頼を送るには、企業または生徒アカウントでログインしてください。" });
      setLoginGateOpen(true);
      return;
    }
    if (user.role === "INSTRUCTOR") {
      setLoginGateText({
        title: "講師アカウントではご利用いただけません",
        desc: "研修の依頼は、企業または生徒アカウントでログインした場合のみ送信できます。",
      });
      setLoginGateOpen(true);
      return;
    }
    setRequestModalOpen(true);
  }

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instructor) return;

    if (!isRealId) {
      showToast("このプロフィールはサンプルデータのため、依頼を送信できません。");
      setRequestModalOpen(false);
      return;
    }

    const titleInvalid = !reqTitle.trim();
    const descInvalid = !reqDescription.trim();
    const locationInvalid = reqFormat !== "online" && !reqLocation.trim();
    const expertiseInvalid = !reqExpertise;
    const participantsInvalid = !(Number.isInteger(Number(reqParticipants)) && Number(reqParticipants) >= 1);
    setReqTitleError(titleInvalid);
    setReqDescError(descInvalid);

    if (titleInvalid || descInvalid || locationInvalid || expertiseInvalid || participantsInvalid) {
      setReqFormError(
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
    setReqFormError("");

    if (!user) return;
    setSubmitting(true);
    const { error } = await createTrainingRequest({
      requester_id: user.id,
      requester_type: user.role === "COMPANY" ? "company" : "individual",
      title: reqTitle.trim(),
      description: reqDescription.trim(),
      expertise_field: reqExpertise,
      budget: Number(reqBudget) || null,
      participant_count: Number(reqParticipants),
      preferred_format: reqFormat,
      location: reqFormat === "online" ? null : reqLocation.trim(),
      preferred_schedule: reqSchedule.trim() || null,
      target_instructor_id: instructor.id,
    });
    setSubmitting(false);

    if (error) {
      setReqFormError(`送信に失敗しました：${error.message}`);
      return;
    }

    setRequestModalOpen(false);
    showToast(`${instructor.name} 先生へ依頼を送信しました（マイページから確認できます）`);
    setReqTitle("");
    setReqDescription("");
    setReqBudget("");
    setReqParticipants("");
    setReqLocation("");
    setReqSchedule("");
  }

  if (notFound) {
    return (
      <main className="detail-page">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <p className="empty-state__title">この講師のプロフィールは見つかりませんでした</p>
          <p className="empty-state__desc">非公開になっているか、削除された可能性があります。</p>
          <Link href="/instructors" className="btn btn--primary" style={{ marginTop: 16 }}>
            講師一覧に戻る
          </Link>
        </div>
      </main>
    );
  }

  if (!instructor) {
    return (
      <main className="detail-page">
        <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>
      </main>
    );
  }

  return (
    <main className="detail-page">
      <p className="breadcrumb">
        <Link href="/">トップ</Link>
        <span className="sep">/</span>
        <Link href="/instructors">講師を探す</Link>
        <span className="sep">/</span>
        {instructor.name}
      </p>

      <div className="detail-layout">
        <div>
          <div className="detail-header">
            {instructor.avatarUrl ? (
              <img
                src={instructor.avatarUrl}
                alt={`${instructor.name}のプロフィール画像`}
                className="detail-header__avatar"
                style={{ objectFit: "cover", objectPosition: "center 15%" }}
              />
            ) : (
              <span className="detail-header__avatar">{instructor.initial}</span>
            )}
            <div>
              <h1 className="detail-header__name">{instructor.name}</h1>
              <div className="detail-header__meta">
                <span>{instructor.workArea}</span>
                <span>・</span>
                <span className="detail-header__rating">★ {instructor.ratingAvg.toFixed(1)}</span>
                <span>（{instructor.reviewCount}件のレビュー）</span>
              </div>
            </div>
          </div>

          <div className="instructor-card__tags" style={{ marginBottom: 28 }}>
            {instructor.expertiseFields.map((f) => (
              <span key={f} className="instructor-card__tag">
                {f}
              </span>
            ))}
          </div>

          {isRealId ? (
            <MineProfileBlocks mine={mine} />
          ) : (
            <div className="detail-block">
              <h2 className="detail-block__title">自己紹介</h2>
              <p className="detail-block__text">{detail.bio || instructor.introduction}</p>
            </div>
          )}

          <div className="detail-block">
            <h2 className="detail-block__title">基本情報</h2>
            <dl className="info-list">
              <div>
                <dt>対応形態</dt>
                <dd>{instructor.workFormatLabel}</dd>
              </div>
              {!isRealId && (
                <div>
                  <dt>経験年数</dt>
                  <dd>{instructor.yearsExperience}年</dd>
                </div>
              )}
              {!isRealId && (
                <div>
                  <dt>保有資格</dt>
                  <dd>{detail.certifications && detail.certifications.length ? detail.certifications.join("、") : "-"}</dd>
                </div>
              )}
              {!isRealId && (
                <div>
                  <dt>対応可能日程</dt>
                  <dd>{detail.availableSchedule || "要相談"}</dd>
                </div>
              )}
              {instructor.portfolioUrl && (
                <div>
                  <dt>ポートフォリオ／実績</dt>
                  <dd>
                    <a href={instructor.portfolioUrl} target="_blank" rel="noopener noreferrer">
                      {instructor.portfolioUrl}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {isRealId && <PublicSurveyBlock instructorId={rawId} />}

          <div className="detail-block">
            <h2 className="detail-block__title">レビュー（{reviews.length}件）</h2>
            {reviews.length ? (
              reviews.map((r, i) => (
                <div className="review-item" key={i}>
                  <div className="review-item__top">
                    <span className="review-item__name">{r.reviewerName}</span>
                    <span className="review-item__badge">{r.reviewerType === "business" ? "企業" : "生徒"}</span>
                    <span className="review-item__rating">★ {r.rating}</span>
                  </div>
                  <p className="review-item__comment">{r.comment}</p>
                  <span className="review-item__date">{r.date}</span>
                </div>
              ))
            ) : (
              <p className="detail-block__text" style={{ color: "var(--color-ink-soft)" }}>
                まだレビューがありません。
              </p>
            )}
          </div>
        </div>

        <aside className="detail-sidebar">
          <div className="detail-sidebar__rate">
            {instructor.hourlyRateLabel}
            <span>／時間〜</span>
          </div>
          <div className="detail-sidebar__divider"></div>
          <div className="detail-sidebar__row">
            <dt>対応形態</dt>
            <dd>{instructor.workFormatLabel}</dd>
          </div>
          <div className="detail-sidebar__row">
            <dt>対応エリア</dt>
            <dd>{instructor.workArea}</dd>
          </div>
          <div className="detail-sidebar__row">
            <dt>評価</dt>
            <dd>
              ★ {instructor.ratingAvg.toFixed(1)}（{instructor.reviewCount}件）
            </dd>
          </div>
          <button type="button" className="btn btn--primary btn--block" onClick={handleRequestClick}>
            この講師に依頼する
          </button>
          <p className="detail-sidebar__note">依頼後、講師が確認して返信します</p>
        </aside>
      </div>

      <div className={`modal-overlay${requestModalOpen ? " is-open" : ""}`} onClick={(e) => e.target === e.currentTarget && setRequestModalOpen(false)}>
        <div className="modal-box">
          <button className="modal-close" aria-label="閉じる" onClick={() => setRequestModalOpen(false)}>
            ×
          </button>
          <p className="modal-title">研修を依頼する</p>
          <p className="modal-desc">{`${instructor.name} 先生への依頼内容を入力してください。講師が確認後、承諾・見積り・却下のいずれかで返信します。`}</p>

          {reqFormError && <div className="notice-banner is-visible">{reqFormError}</div>}

          <form noValidate onSubmit={handleRequestSubmit}>
            <div className={`form-field${reqTitleError ? " has-error" : ""}`}>
              <label htmlFor="reqTitle">依頼タイトル</label>
              <input type="text" id="reqTitle" placeholder="例：新人エンジニア向けPython基礎研修" required value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} />
              <p className="form-field__error">タイトルを入力してください。</p>
            </div>

            <div className="form-field">
              <label htmlFor="reqExpertise">希望分野</label>
              <select id="reqExpertise" required value={reqExpertise} onChange={(e) => setReqExpertise(e.target.value)}>
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
            </div>

            <div className="form-row">
              <div className="form-field">
                <label htmlFor="reqFormat">希望形態</label>
                <select id="reqFormat" required value={reqFormat} onChange={(e) => setReqFormat(e.target.value as RequestFormat)}>
                  <option value="online">オンライン</option>
                  <option value="offline">対面</option>
                  <option value="both">オンライン・対面 両方</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="reqBudget">想定予算（時間あたり）</label>
                <input type="number" id="reqBudget" placeholder="例：15000" min={0} step={1000} value={reqBudget} onChange={(e) => setReqBudget(e.target.value)} />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="reqParticipants">対象人数</label>
              <input type="number" id="reqParticipants" required placeholder="例：10" min={1} step={1} value={reqParticipants} onChange={(e) => setReqParticipants(e.target.value)} />
            </div>

            {reqFormat !== "online" && (
              <div className="form-field">
                <label htmlFor="reqLocation">実施場所（対面の場合は必須）</label>
                <input type="text" id="reqLocation" placeholder="例：東京都内オフィス" value={reqLocation} onChange={(e) => setReqLocation(e.target.value)} />
              </div>
            )}

            <div className="form-field">
              <label htmlFor="reqSchedule">希望日程</label>
              <input type="text" id="reqSchedule" placeholder="例：8月中旬 平日午後" value={reqSchedule} onChange={(e) => setReqSchedule(e.target.value)} />
            </div>

            <div className={`form-field${reqDescError ? " has-error" : ""}`}>
              <label htmlFor="reqDescription">依頼内容の詳細</label>
              <textarea
                id="reqDescription"
                rows={4}
                placeholder="研修の目的、対象人数、レベル感などをご記入ください"
                required
                value={reqDescription}
                onChange={(e) => setReqDescription(e.target.value)}
              />
              <p className="form-field__error">依頼内容を入力してください。</p>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
                {submitting ? "送信中…" : "この内容で依頼を送る"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className={`modal-overlay${loginGateOpen ? " is-open" : ""}`} onClick={(e) => e.target === e.currentTarget && setLoginGateOpen(false)}>
        <div className="modal-box" style={{ maxWidth: 420, textAlign: "center" }}>
          <button className="modal-close" aria-label="閉じる" onClick={() => setLoginGateOpen(false)}>
            ×
          </button>
          <span className="hanko hanko--logo login-gate__icon" style={{ margin: "0 auto 16px" }}>
            研
          </span>
          <p className="modal-title">{loginGateText.title}</p>
          <p className="modal-desc">{loginGateText.desc}</p>
          <div className="form-actions" style={{ flexDirection: "column" }}>
            <Link href="/login" className="btn btn--primary btn--block">
              ログイン
            </Link>
            <Link href="/register" className="btn btn--ghost btn--block">
              新規登録
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function InstructorDetailPage() {
  return (
    <Suspense fallback={<main className="detail-page" />}>
      <InstructorDetailInner />
    </Suspense>
  );
}

/** The Mine items the instructor allowed. Each block shows only if Mine sent it. */
function MineProfileBlocks({ mine }: { mine: MinePublicProfile | null }) {
  if (!mine) return null;
  const list = (items: string[]) => (
    <ul className="detail-block__text" style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((item, i) => (
        <li key={`${item}-${i}`}>{item}</li>
      ))}
    </ul>
  );
  const blocks: { title: string; body: React.ReactNode }[] = [];
  if (mine.self_introduction) blocks.push({ title: "自己紹介", body: <p className="detail-block__text" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{mine.self_introduction}</p> });
  if (mine.professional_summary) blocks.push({ title: "職務要約", body: <p className="detail-block__text" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{mine.professional_summary}</p> });
  if (mine.skills?.length) blocks.push({ title: "スキル", body: list(mine.skills.map(skillLine)) });
  if (mine.qualifications?.length) blocks.push({ title: "資格・免許", body: list(mine.qualifications.map(qualificationLine)) });
  if (mine.work_history?.length) {
    const total = totalExperienceLabel(mine.work_history);
    blocks.push({
      title: "職歴",
      body: (
        <>
          {total && (
            <p className="detail-block__text" style={{ fontWeight: 600, marginBottom: 6 }}>
              実務経験 {total}
            </p>
          )}
          {list(mine.work_history.map(workHistoryLine))}
        </>
      ),
    });
  }
  if (mine.education?.length) blocks.push({ title: "学歴", body: list(mine.education.map(educationLine)) });
  if (mine.languages) blocks.push({ title: "言語", body: <p className="detail-block__text">{mine.languages}</p> });
  if (mine.area) blocks.push({ title: "地域", body: <p className="detail-block__text">{mine.area}</p> });
  return (
    <>
      {mine.occupations?.length ? (
        <div className="detail-block">
          <h2 className="detail-block__title">職種</h2>
          <div className="instructor-card__tags">
            {mine.occupations.map((o, i) => (
              <span key={`${o.name}-${i}`} className="instructor-card__tag">
                {o.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {blocks.map((block) => (
        <div className="detail-block" key={block.title}>
          <h2 className="detail-block__title">{block.title}</h2>
          {block.body}
        </div>
      ))}
    </>
  );
}
