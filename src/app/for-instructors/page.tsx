import Link from "next/link";
import { mineLoginUrl, mineRegisterUrl } from "@/lib/mine/login-url";
import "./for-instructors.css";

export const metadata = {
  title: "講師の方へ | ケンシュウリンク",
  description: "ケンシュウリンクの講師は、Mineのアカウントでそのままログインできます。",
};

const STEPS = [
  { label: "STEP 1", title: "Mine", text: "プロフィール・経歴・スキルを登録（初回だけ）", tone: "plain" },
  { label: "STEP 2", title: "「ケンシュウリンク」を連携", text: "共有する内容を確認して、同意（初回だけ）", tone: "plain" },
  { label: "STEP 3", title: "次からは「Mineでログイン」だけ", text: "押すと、そのままケンシュウリンクが開きます", tone: "accent" },
] as const;

const FEATURES = [
  { title: "案件を探す", text: "企業・個人から届いている研修の依頼を、分野やエリアで探せます。あなたに合う案件には「おすすめ」が付きます。" },
  { title: "返信する", text: "依頼に、承諾・見積り・辞退のどれかで返信します。複数の講師の中から、依頼者が選びます。" },
  { title: "評価を受ける", text: "実施後に、依頼した方からのレビューが付きます。次の依頼につながる実績になります。" },
] as const;

const FAQ = [
  {
    q: "ケンシュウリンクで、別にアカウントを作る必要はありますか？",
    a: "ありません。Mineのアカウントだけで使えます。",
  },
  {
    q: "Googleでログインできますか？",
    a: "Mineのログイン画面で使えます。ケンシュウリンクのログイン画面にあるGoogleボタンは、企業・生徒の方用です。講師の方は「Mineでログイン」を押してください。",
  },
  {
    q: "連携すると、何が起きますか？",
    a: "Mineで同意した情報だけが、ケンシュウリンクで使われます。連携は、Mineからいつでも見直せます。",
  },
] as const;

export default function ForInstructorsPage() {
  const mineUrl = process.env.NEXT_PUBLIC_MINE_APP_URL;
  const loginHref = mineLoginUrl(mineUrl);
  const registerHref = mineRegisterUrl(mineUrl);

  return (
    <main className="fi-page">
      <section className="fi-hero">
        <div className="fi-hero__text">
          <p className="fi-eyebrow">FOR INSTRUCTORS</p>
          <h1 className="fi-title">
            講師の方へ。
            <br />
            Mineのアカウントで、
            <br />
            そのままログイン。
          </h1>
          <p className="fi-lead">
            「Mineでログイン」を押すだけ。
            <br />
            ケンシュウリンク用のアカウントも、2つ目のパスワードも要りません。
          </p>
          <div className="fi-actions">
            <a className="fi-btn fi-btn--solid" href={loginHref}>
              Mineでログイン
            </a>
            <a className="fi-btn fi-btn--outline" href={registerHref}>
              はじめての方：Mineで登録
            </a>
          </div>
          <p className="fi-note">Mineのログイン画面で、メールとパスワード、またはGoogleで入れます。</p>
        </div>

        <ol className="fi-flow" aria-label="はじめかた">
          {STEPS.map((step, index) => (
            <li key={step.label} className="fi-flow__item">
              <div className={`fi-flow__card${step.tone === "accent" ? " fi-flow__card--accent" : ""}`}>
                <p className="fi-flow__label">{step.label}</p>
                <p className="fi-flow__title">{step.title}</p>
                <p className="fi-flow__text">{step.text}</p>
              </div>
              {index < STEPS.length - 1 && (
                <span className="fi-flow__arrow" aria-hidden="true">
                  ↓
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="fi-section">
        <p className="fi-eyebrow">WHAT YOU CAN DO</p>
        <h2 className="fi-h2">ケンシュウリンクでできること</h2>
        <div className="fi-grid">
          {FEATURES.map((item) => (
            <div key={item.title} className="fi-card">
              <p className="fi-card__title">{item.title}</p>
              <p className="fi-card__text">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="fi-section">
        <div className="fi-shared">
          <p className="fi-shared__title">どんな情報が見えるの？</p>
          <p className="fi-shared__text">
            連携のときに、依頼者に見える情報の一覧が出ます。内容を確認してから同意でき、あとから変更もできます。
          </p>
        </div>
      </section>

      <section className="fi-section fi-section--narrow">
        <p className="fi-eyebrow">FAQ</p>
        <h2 className="fi-h2">よくある質問</h2>
        <div className="fi-faq">
          {FAQ.map((item) => (
            <div key={item.q} className="fi-faq__item">
              <p className="fi-faq__q">{item.q}</p>
              <p className="fi-faq__a">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="fi-cta">
        <h2 className="fi-cta__title">はじめての方は、Mineで登録。</h2>
        <p className="fi-cta__text">登録は数分。連携は、あとからでもできます。</p>
        <div className="fi-actions fi-actions--center">
          <a className="fi-btn fi-btn--white" href={registerHref}>
            Mineで登録する
          </a>
          <Link className="fi-btn fi-btn--ghost-white" href="/open-requests">
            いま届いている案件を見る
          </Link>
        </div>
      </section>
    </main>
  );
}
