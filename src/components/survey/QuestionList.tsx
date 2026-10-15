"use client";

import { SURVEY_QUESTIONS, SURVEY_SCALE, type SurveyScores } from "@/lib/survey/answers";

/** The five questions with the four-step answer buttons (shared by the participant and company forms). */
export function QuestionList({
  answers,
  onChange,
  showMissing,
}: {
  answers: Partial<SurveyScores>;
  onChange: (next: Partial<SurveyScores>) => void;
  showMissing: boolean;
}) {
  return (
    <>
      {SURVEY_QUESTIONS.map((q, index) => {
        const missing = showMissing && !answers[q.key];
        return (
          <fieldset key={q.key} className={`survey-q${missing ? " has-error" : ""}`}>
            <legend className="survey-q__text">
              {index + 1}. {q.text}
            </legend>
            <div className="survey-scale" role="radiogroup">
              {SURVEY_SCALE.map((option) => {
                const selected = answers[q.key] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`survey-scale__btn survey-scale__btn--${option.value}${selected ? " is-selected" : ""}`}
                    onClick={() => onChange({ ...answers, [q.key]: option.value })}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {missing && (
              <p className="form-field__error" style={{ display: "block" }}>
                選択してください。
              </p>
            )}
          </fieldset>
        );
      })}
    </>
  );
}
