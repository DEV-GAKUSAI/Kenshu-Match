import { DIRECT_PROGRESS_STEPS, PROGRESS_STEPS, directProgressIndex, progressIndex, type DirectProgressInput, type ProgressInput } from "@/lib/requests/progress";

/** Where the request is now: 応募 → 面談 → 決定 → 研修 → 完了. The same strip for the company and the lecturer. */
export function ProgressStrip({ input, direct, hint }: { input?: ProgressInput; direct?: DirectProgressInput; hint?: string | null }) {
  // 公募依頼: input. 直接依頼: direct (same strip, first two steps are named 依頼 / 返答).
  const steps: readonly string[] = direct ? DIRECT_PROGRESS_STEPS : PROGRESS_STEPS;
  const now = direct ? directProgressIndex(direct) : input ? progressIndex(input) : null;
  if (now === null) return null;
  return (
    <div className="ps">
      <ol className="ps__list" aria-label="依頼の進み具合">
        {steps.map((label, i) => {
          const state = i < now ? "done" : i === now ? "now" : "next";
          return (
            <li key={label} className={`ps__step ps__step--${state}`} aria-current={state === "now" ? "step" : undefined}>
              <span className="ps__dot" aria-hidden="true">
                {state === "done" ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="ps__label">{label}</span>
            </li>
          );
        })}
      </ol>
      {hint && <p className="ps__hint">{hint}</p>}
    </div>
  );
}
