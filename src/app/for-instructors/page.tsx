import { mineLoginUrl, mineRegisterUrl } from "@/lib/mine/login-url";
import "./for-instructors.css";

export const metadata = {
  title: "講師の方へ | ケンシュウリンク",
  description: "ケンシュウリンクの講師は、Mineのアカウントでそのままログインできます。",
};

const STEPS = [
  { no: "1", label: "STEP 1", title: "Mine", text: "プロフィール・経歴・スキルを登録（初回だけ）", accent: false },
  { no: "2", label: "STEP 2", title: "「ケンシュウリンク」を連携", text: "共有する内容を確認して、同意（初回だけ）", accent: false },
  { no: "3", label: "STEP 3", title: "次からは「Mineでログイン」だけ", text: "押すと、そのままケンシュウリンクが開きます", accent: true },
] as const;

function FeatureIcon({ name }: { name: "search" | "reply" | "star" }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }
  if (name === "reply") {
    return (
      <svg {...common}>
        <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.3A8 8 0 1 1 21 12Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="m12 3 2.8 5.9 6.5.9-4.7 4.5 1.1 6.4L12 17.6 6.3 20.7l1.1-6.4L2.7 9.8l6.5-.9L12 3Z" />
    </svg>
  );
}

const FEATURES = [
  { icon: "search", title: "案件を探す", text: "企業・個人から届いている研修の依頼を、分野やエリアで探せます。あなたに合う案件には「おすすめ」が付きます。" },
  { icon: "reply", title: "返信する", text: "依頼に、承諾・見積り・辞退のどれかで返信します。複数の講師の中から、依頼者が選びます。" },
  { icon: "star", title: "評価を受ける", text: "実施後に、依頼した方からのレビューが付きます。次の依頼につながる実績になります。" },
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
          <p className="section__eyebrow">FOR INSTRUCTORS</p>
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
            <a className="btn btn--primary" href={loginHref}>
              Mineでログイン
            </a>
            <a className="btn btn--ghost" href={registerHref}>
              はじめての方：Mineで登録
            </a>
          </div>
          <p className="fi-note">Mineのログイン画面で、メールとパスワード、またはGoogleで入れます。</p>
        </div>

        <ol className="fi-flow" aria-label="はじめかた">
          {STEPS.map((step) => (
            <li key={step.label} className={`fi-step${step.accent ? " fi-step--accent" : ""}`}>
              <span className="fi-step__no" aria-hidden="true">
                {step.no}
              </span>
              <div className="fi-step__card">
                <p className="fi-step__label">{step.label}</p>
                <p className="fi-step__title">{step.title}</p>
                <p className="fi-step__text">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="fi-section">
        <p className="section__eyebrow">WHAT YOU CAN DO</p>
        <h2 className="fi-h2">ケンシュウリンクでできること</h2>
        <div className="fi-grid">
          {FEATURES.map((item) => (
            <div key={item.title} className="fi-card">
              <span className="fi-card__icon">
                <FeatureIcon name={item.icon} />
              </span>
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
        <p className="section__eyebrow">FAQ</p>
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
    </main>
  );
}
