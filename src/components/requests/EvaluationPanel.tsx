"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/common/Toast";
import { averageScore, EMPTY_EVAL, EVAL_COMMENT_MAX, EVAL_ITEMS, EVAL_NAME_MAX, evaluationError, REUSE_OPTIONS, REUSE_TEXT, type EvalInput } from "@/lib/requests/evaluation-calc";
import { getEvaluation, saveEvaluation, type EvaluationRow } from "@/lib/requests/evaluations";

function Stars({ value, onChange, label }: { value: number; onChange?: (n: number) => void; label: string }) {
  return (
    <span className="ev__stars" role={onChange ? "radiogroup" : "img"} aria-label={`${label} ${value || "未選択"}`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}`} className={`ev__star${n <= value ? " is-on" : ""}`} onClick={() => onChange(n)}>
            ★
          </button>
        ) : (
          <span key={n} className={`ev__star${n <= value ? " is-on" : ""}`} aria-hidden="true">
            ★
          </span>
        ),
      )}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" });
}

/** 講師の評価: the company rates the decided lecturer after the training. Private to the company (#55). */
export function EvaluationPanel({
  requestId,
  responseId,
  requesterId,
  instructorId,
  instructorName,
  defaultEvaluator,
}: {
  requestId: string;
  responseId: string;
  requesterId: string;
  instructorId: string;
  instructorName: string;
  defaultEvaluator: string;
}) {
  const { showToast } = useToast();
  const [saved, setSaved] = useState<EvaluationRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<EvalInput>({ ...EMPTY_EVAL, evaluator_name: defaultEvaluator });

  async function load() {
    const e = await getEvaluation(responseId);
    setSaved(e);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state only after awaiting
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseId]);

  if (!loaded) return <p className="ev__note">読み込み中…</p>;

  function startEdit() {
    if (saved) {
      setForm({
        expertise: saved.expertise,
        teaching: saved.teaching,
        preparation: saved.preparation,
        communication: saved.communication,
        cooperation: saved.cooperation,
        reuse: saved.reuse,
        comment: saved.comment ?? "",
        evaluator_name: saved.evaluator_name,
      });
    } else {
      setForm({ ...EMPTY_EVAL, evaluator_name: defaultEvaluator });
    }
    setEditing(true);
  }

  async function submit() {
    const err = evaluationError(form);
    if (err) return showToast(err);
    setBusy(true);
    const { error } = await saveEvaluation({ requestId, responseId, requesterId, instructorId }, form, saved?.evaluation_id);
    setBusy(false);
    if (error) return showToast(error.message);
    showToast("評価を保存しました。");
    setEditing(false);
    await load();
  }

  if (saved && !editing) {
    const avg = averageScore(saved);
    return (
      <div className="ev">
        <div className="ev__head">
          <strong>{instructorName} 先生への評価</strong>
          <span className="ev__avg">
            <span className="ev__star is-on" aria-hidden="true">★</span> {avg.toFixed(1)}
          </span>
        </div>
        <ul className="ev__list">
          {EVAL_ITEMS.map((i) => (
            <li key={i.key}>
              <span className="ev__label">{i.label}</span>
              <Stars value={saved[i.key]} label={i.label} />
            </li>
          ))}
          <li>
            <span className="ev__label">再依頼の意向</span>
            <span className="ev__reuse">{REUSE_TEXT[saved.reuse]}</span>
          </li>
        </ul>
        {saved.comment && <p className="ev__comment">{saved.comment}</p>}
        <p className="ev__meta">
          評価した人：{saved.evaluator_name}　・　{fmtDate(saved.updated_at)}（自社だけに表示されます）
        </p>
        <button type="button" className="btn btn--ghost btn--sm" onClick={startEdit}>
          評価を直す
        </button>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="ev">
        <p className="ev__note">研修お疲れさまでした。{instructorName} 先生の評価を残すと、次の依頼で講師を選ぶときの参考になります。この評価は自社だけに表示され、講師には見えません。</p>
        <button type="button" className="btn btn--primary btn--sm" onClick={startEdit}>
          講師を評価する
        </button>
      </div>
    );
  }

  return (
    <div className="ev">
      <div className="ev__head">
        <strong>{instructorName} 先生を評価する</strong>
      </div>
      <ul className="ev__list">
        {EVAL_ITEMS.map((i) => (
          <li key={i.key}>
            <span className="ev__label">{i.label}</span>
            <Stars value={form[i.key]} label={i.label} onChange={(n) => setForm({ ...form, [i.key]: n })} />
          </li>
        ))}
      </ul>
      <div className="ev__reuse-pick" role="radiogroup" aria-label="再依頼の意向">
        <span className="ev__label">再依頼の意向</span>
        <div className="ev__choices">
          {REUSE_OPTIONS.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={form.reuse === o.value} className={`ev__choice${form.reuse === o.value ? " is-on" : ""}`} onClick={() => setForm({ ...form, reuse: o.value })}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <label className="ev__field">
        <span className="ev__label">コメント（任意）</span>
        <textarea rows={3} maxLength={EVAL_COMMENT_MAX} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="良かった点、次に期待することなど（自社だけに表示されます）" />
      </label>
      <label className="ev__field">
        <span className="ev__label">評価した人</span>
        <input type="text" maxLength={EVAL_NAME_MAX} value={form.evaluator_name} onChange={(e) => setForm({ ...form, evaluator_name: e.target.value })} placeholder="例：人事部 田中" />
      </label>
      <div className="ev__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void submit()}>
          {busy ? "保存中…" : "評価を保存する"}
        </button>
        {saved && (
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setEditing(false)}>
            やめる
          </button>
        )}
      </div>
    </div>
  );
}
