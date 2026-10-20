"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import { createClient } from "@/lib/supabase/client";
import { SURVEY_QUESTIONS, SURVEY_SCALE } from "@/lib/survey/answers";
import { checkImport, decodeCsvBytes, fileHash, importErrorMessage, parseCsv, templateCsv, type ImportCheck } from "@/lib/survey/import";

type BatchRow = { batch_id: string; file_name: string | null; row_count: number; created_at: string; undone_at: string | null };
type Preview = { fileName: string; hash: string; check: ImportCheck };

const SHOWN_PROBLEMS = 20;

/**
 * 研修アンケート: import results collected outside Kenshu Link from a CSV in
 * our template (sheet #38). The file is checked here first and nothing is
 * saved until the person presses the import button. One wrong row stops the
 * whole import. An import can be undone as a whole.
 */
export function SurveyImportPanel({ requestId, onChanged }: { requestId: string; onChanged?: () => void }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  // The survey tables are new, so they are not in the generated types yet.
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadBatches = useCallback(async () => {
    const { data } = await supabase
      .from("training_survey_import_batches")
      .select("batch_id, file_name, row_count, created_at, undone_at, training_surveys!inner(request_id)")
      .eq("training_surveys.request_id", requestId)
      .order("created_at", { ascending: false });
    setBatches((data as BatchRow[] | null) ?? []);
  }, [supabase, requestId]);

  useEffect(() => {
    if (open) void loadBatches();
  }, [open, loadBatches]);

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "研修アンケート取込テンプレート.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setPreview(null);
      showToast("ファイルが大きすぎます（2MBまで）。");
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkImport(parseCsv(decodeCsvBytes(bytes)));
    setPreview({ fileName: file.name, hash: await fileHash(bytes), check });
  }

  async function handleImport() {
    if (!preview || preview.check.problems.length > 0 || preview.check.rows.length === 0) return;
    setBusy(true);
    const { error } = await supabase.rpc("import_training_survey_answers", {
      p_request_id: requestId,
      p_rows: preview.check.rows,
      p_file_hash: preview.hash,
      p_file_name: preview.fileName,
    });
    setBusy(false);
    if (error) return showToast(importErrorMessage(error.message));
    showToast(`${preview.check.rows.length}件を取り込みました。`);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
    await loadBatches();
    onChanged?.();
  }

  async function handleUndo(batch: BatchRow) {
    const { ok } = await confirm({
      title: "この取り込みを取り消しますか？",
      message: `取り込んだ${batch.row_count}件の回答が、集計から外れます。`,
      confirmLabel: "取り消す",
      cancelLabel: "戻る",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc("undo_training_survey_import", { p_batch_id: batch.batch_id });
    setBusy(false);
    if (error) return showToast(importErrorMessage(error.message));
    showToast("取り込みを取り消しました。");
    await loadBatches();
    onChanged?.();
  }

  const check = preview?.check;
  const hasProblems = !!check && check.problems.length > 0;

  return (
    <div>
      <button type="button" className="btn btn--ghost btn--sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "取り込みを閉じる" : "アンケート結果を取り込む"}
      </button>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="request-card__desc" style={{ margin: 0 }}>
            紙や他のツールで集めた結果、過去の研修の評価などを、ファイルでまとめて取り込めます。取り込んだ回答は、リンクからの回答と同じ集計に入ります。
          </p>
          <div className="request-card__response" style={{ margin: 0 }}>
            <strong>テンプレートの書き方</strong>
            1行に1人分を入力します。回答者区分は「参加者」か「依頼企業」、設問は1〜4の数字です（
            {SURVEY_SCALE.map((s) => `${s.value}＝${s.label}`).join("、")}）。コメントと名前は空でも構いません。名前を入れた場合のみ、回答者名として表示されます。
            <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {SURVEY_QUESTIONS.map((q) => (
                <li key={q.key}>{q.text}</li>
              ))}
            </ol>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn btn--primary btn--sm" onClick={downloadTemplate}>
              テンプレートをダウンロード
            </button>
            <label className="btn btn--ghost btn--sm" style={{ cursor: "pointer" }}>
              ファイルを選ぶ（CSV）
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </label>
          </div>

          {preview && check && (
            <div className="request-card__response" style={{ margin: 0 }}>
              <strong>取り込み内容の確認：{preview.fileName}</strong>
              {check.total > 0 && (
                <div>
                  {check.total}行を確認しました：取り込めます {check.total - check.badLines}行 / 修正が必要 {check.badLines}行
                </div>
              )}
              {hasProblems && (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--color-danger)" }}>
                  {check.problems.slice(0, SHOWN_PROBLEMS).map((p, i) => (
                    <li key={i}>{p.line > 0 ? `${p.line}行目：` : ""}{p.message}</li>
                  ))}
                  {check.problems.length > SHOWN_PROBLEMS && <li>ほか{check.problems.length - SHOWN_PROBLEMS}件</li>}
                </ul>
              )}
              {hasProblems ? (
                <p style={{ margin: "8px 0 0" }}>修正が必要な行があります。ファイルを直して、もう一度選んでください。</p>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleImport}>
                    {check.rows.length}件を取り込む
                  </button>
                </div>
              )}
            </div>
          )}

          {batches.length > 0 && (
            <ul className="survey-links" style={{ maxHeight: 220 }}>
              {batches.map((b) => (
                <li key={b.batch_id} style={{ alignItems: "center", gap: 8 }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.file_name || "ファイル"}（{b.row_count}件・{formatDate(b.created_at)}）
                  </span>
                  {b.undone_at ? (
                    <span style={{ color: "var(--color-ink-soft)", flex: "none" }}>取り消し済み</span>
                  ) : (
                    <button type="button" className="btn btn--ghost btn--sm" style={{ flex: "none" }} disabled={busy} onClick={() => void handleUndo(b)}>
                      取り消す
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(new Date(iso));
}
