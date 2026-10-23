"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { getFeaturedInstructors } from "@/lib/instructor/profile";
import { withMineDisplay } from "@/lib/mine/display";
import { withSurveySummary } from "@/lib/survey/summary-client";
import { InstructorCard } from "@/components/instructors/InstructorCard";
import type { InstructorPublicDirectoryRow, TrainingCategoryRow } from "@/types/database";
import "./home.css";

type CategoryWithCount = Pick<TrainingCategoryRow, "name" | "sort_order"> & {
  training_subcategories: { id: string }[];
};

const FAQ_ITEMS = [
  {
    q: "ケンシュウリンクの利用に料金はかかりますか？",
    a: "講師を探して依頼を送るまでは無料でご利用いただけます。研修費用は選定した講師との直接契約に基づき、講師ごとに設定された金額となります。",
  },
  {
    q: "講師への支払いはどのように行いますか？",
    a: "マッチング成立後は講師と直接連絡先を交換し、支払い方法・タイミングについては当事者間で調整していただきます。プラットフォームを介した決済は現在提供しておりません。",
  },
  {
    q: "自社に合った講師はどうやって選べばいいですか？",
    a: "分野・対応エリア・形態・予算で講師を絞り込んで検索できます。気になる講師には直接依頼を送り、複数の講師から届いた回答・見積りを比較したうえで選定してください。",
  },
];

export default function Home() {
  const { user, authReady } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryWithCount[] | null>(null);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [featured, setFeatured] = useState<InstructorPublicDirectoryRow[] | null>(null);
  const [featuredFailed, setFeaturedFailed] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Admins have no top page: send them to the dashboard.
  useEffect(() => {
    if (authReady && user?.role === "ADMIN") router.replace("/admin");
  }, [authReady, user, router]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("training_categories")
        .select("name, sort_order, training_subcategories(id)")
        .order("sort_order");
      if (error || !data || data.length === 0) {
        setCategoriesFailed(true);
        return;
      }
      setCategories(data as unknown as CategoryWithCount[]);
    })();

    (async () => {
      const { data, error } = await getFeaturedInstructors(6);
      if (error) {
        setFeaturedFailed(true);
        return;
      }
      setFeatured(await withSurveySummary(await withMineDisplay(data || [])));
    })();
  }, []);

  const isInstructor = authReady && user?.role === "INSTRUCTOR";
  // ログイン済みの企業・個人には「講師として登録する」を出さず、マイページへ案内する
  const isRequester = authReady && (user?.role === "COMPANY" || user?.role === "INDIVIDUAL");

  return (
    <>
      <section className="hero-band">
        <div className="hero-band__photo">
          <Image
            src="/images/anh-hero-cogai.png"
            alt="研修風景"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 46vw"
            style={{ objectFit: "cover" }}
          />
        </div>
        <span className="hero-band__icon hero-band__icon--2">👤</span>
        <div className="hero-band__decor hero-band__decor--1"></div>
        <div className="hero-band__inner">
          <div className="hero-band__text">
            <span className="hero-band__badge">研修講師マッチングサービス</span>
            <span className="hero-band__badge hero-band__badge--lavender">全国対応</span>
            {isInstructor ? (
              <>
                <h1 className="hero-band__title">
                  あなたのスキルを、
                  <br />
                  学びたい<em>企業・個人</em>に届けよう。
                </h1>
                <p className="hero-band__desc">
                  公募中の研修依頼を分野・形態・予算で確認し、気になる案件に直接返信できます。プロフィールを充実させて、依頼を受け取りましょう。
                </p>
                <div className="hero-band__actions">
                  <Link href="/open-requests" className="btn btn--primary">
                    案件を探す
                  </Link>
                  <Link href="/mypage" className="btn btn--ghost">
                    マイページ
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h1 className="hero-band__title">
                  現場を知る講師と、
                  <br />
                  学びたい<em>企業・個人</em>をつなぐ。
                </h1>
                <p className="hero-band__desc">
                  IT・マネジメント・語学まで、経験豊富な研修講師を分野・形態・予算で検索。依頼から見積り、実施後の評価まで、ケンシュウリンクで完結します。
                </p>
                <div className="hero-band__actions">
                  <Link href="/instructors" className="btn btn--primary">
                    講師を探す
                  </Link>
                  {isRequester ? (
                    <Link href="/mypage" className="btn btn--ghost">
                      マイページ
                    </Link>
                  ) : (
                    <Link href="/register" className="btn btn--ghost">
                      講師として登録する
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {!isInstructor && (
        <div className="band band--tint-mint">
          <section className="section">
            <div className="section__head section__head--center">
              <p className="section__eyebrow">FIELDS</p>
              <h2 className="section__title">研修分野から探す</h2>
              <p className="section__desc">分野を選ぶと、対応する講師の一覧をすぐに確認できます。</p>
            </div>
            <div className="category-grid">
              {categoriesFailed && (
                <p style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--color-ink-soft)", fontSize: 13 }}>
                  分野データを読み込めませんでした。
                </p>
              )}
              {!categoriesFailed && !categories && (
                <p style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--color-ink-soft)", fontSize: 13 }}>
                  読み込み中…
                </p>
              )}
              {categories?.map((cat) => (
                <Link
                  key={cat.name}
                  className="category-card"
                  href={`/instructors?category=${encodeURIComponent(cat.name)}`}
                >
                  <span className="category-card__name">{cat.name}</span>
                  <span className="category-card__count">{(cat.training_subcategories || []).length} 件のカテゴリ</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="band band--surface">
        <section className="section">
          <div className="section__head" style={{ textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
            <p className="section__eyebrow">HOW IT WORKS</p>
            <h2 className="section__title">利用の流れ</h2>
          </div>
          <div className="step-circles">
            <div className="step-circle step-circle--1">
              <span className="step-circle__num">01</span>
              <p className="step-circle__title">{isInstructor ? "案件を探す・返信する" : "講師を探す・依頼する"}</p>
              <p className="step-circle__desc">
                {isInstructor
                  ? "分野・エリア・予算で公募中の依頼を絞り込み、対応できそうな案件に返信します。"
                  : "分野・エリア・形態・予算で講師を絞り込み、気になる講師にオンラインで依頼を送ります。"}
              </p>
            </div>
            <span className="step-arrow">→</span>
            <div className="step-circle step-circle--2">
              <span className="step-circle__num">02</span>
              <p className="step-circle__title">{isInstructor ? "依頼者が確認・選定" : "講師が確認・返信"}</p>
              <p className="step-circle__desc">
                {isInstructor
                  ? "依頼者が返信内容を確認し、依頼する講師を選定します。"
                  : "講師が依頼内容を確認し、承諾・見積り・却下のいずれかで対応します。"}
              </p>
            </div>
            <span className="step-arrow">→</span>
            <div className="step-circle step-circle--3">
              <span className="step-circle__num">03</span>
              <p className="step-circle__title">実施・評価</p>
              <p className="step-circle__desc">
                {isInstructor
                  ? "マッチング成立後は直接やり取りして研修を実施。終了後にレビューが届きます。"
                  : "マッチング成立後は直接やり取りして研修を実施。終了後にレビューを投稿します。"}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="band band--tint-lavender">
        <section className="section">
          <div className="section__head section__head--center">
            <p className="section__eyebrow">WHY KENSHULINK</p>
            <h2 className="section__title">選ばれる理由</h2>
          </div>
          <div className="why-grid">
            {[
              { title: "複数の提案を比較", desc: "1件の見積りだけでなく、複数の講師からの提案を同時に比較検討できます。" },
              { title: "仲介手数料なし", desc: "選定後は講師と直接やり取り。仲介を挟まないため、余計な費用がかかりません。" },
              { title: "透明なレビュー", desc: "実際に依頼した企業・個人によるレビューで、安心して講師を選べます。" },
            ].map((item) => (
              <div key={item.title} className="why-item">
                <span className="why-item__icon">✓</span>
                <p className="why-item__title">{item.title}</p>
                <p className="why-item__desc">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="statement-banner">
        <div className="statement-banner__blob statement-banner__blob--1"></div>
        <div className="statement-banner__blob statement-banner__blob--2"></div>
        <p className="statement-banner__eyebrow">KENSHULINK</p>
        <h2 className="statement-banner__title">
          現場に、届く学びを。
          <br />
          講師と企業・個人が、直接つながる場所。
        </h2>
        <p className="statement-banner__desc">分野・予算・形態で講師を探し、依頼から評価まで、すべてケンシュウリンクの中で完結します。</p>
      </div>

      {!isInstructor && (
        <div className="band band--surface">
          <section className="section">
            <div className="section__head section__head--center">
              <p className="section__eyebrow">INSTRUCTORS</p>
              <h2 className="section__title">講師紹介</h2>
              <p className="section__desc">ケンシュウリンクで活躍中の講師の一部をご紹介します。</p>
            </div>
            {featuredFailed && (
              <p style={{ textAlign: "center", color: "var(--color-ink-soft)", fontSize: 13 }}>読み込みに失敗しました。</p>
            )}
            {!featuredFailed && featured && featured.length > 0 && (
              <div className="instructor-grid">
                {featured.map((ins) => (
                  <InstructorCard key={ins.id} instructor={ins} maxTags={3} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <div className="band band--surface">
        <section className="section">
          <div className="section__head section__head--center">
            <p className="section__eyebrow">FAQ</p>
            <h2 className="section__title">よくある質問</h2>
          </div>
          <div className="faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <div key={item.q} className={`faq-item${openFaq === i ? " is-open" : ""}`}>
                <button type="button" className="faq-item__q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{item.q}</span>
                  <span className="faq-item__mark">＋</span>
                </button>
                <div className="faq-item__a">{item.a}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="band band--tint-lavender">
        <section className="section">
          <div className="closing-cta">
            <p className="closing-cta__title">{isInstructor ? "気になる案件はありますか？" : "ケンシュウリンクを始めましょう"}</p>
            <p className="closing-cta__desc">
              {isInstructor
                ? "公募中の研修依頼を確認して、対応できそうな案件があれば直接返信してみましょう。"
                : "講師をお探しの方も、講師として登録したい方も、今すぐ無料でアカウントを作成できます。"}
            </p>
            <div className="closing-cta__actions">
              {isInstructor ? (
                <>
                  <Link href="/open-requests" className="btn btn--primary">
                    案件を探す
                  </Link>
                  <Link href="/mypage" className="btn btn--ghost">
                    マイページ
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/instructors" className="btn btn--primary">
                    講師を探す
                  </Link>
                  {isRequester ? (
                    <Link href="/mypage" className="btn btn--ghost">
                      マイページ
                    </Link>
                  ) : (
                    <Link href="/register" className="btn btn--ghost">
                      講師として登録する
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
