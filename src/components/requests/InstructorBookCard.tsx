"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/common/Toast";
import { deleteBookEntry, getBookEntryFor, saveBookEntryFor, type BookEntry, type BookKind } from "@/lib/requester/book";
import { Select } from "@/components/ui/Select";

/** 自社の講師台帳 on an instructor's page: only the company sees it (#55 評価・メモ, #57 候補・取引先). */
export function InstructorBookCard({ requesterId, instructorId }: { requesterId: string; instructorId: string }) {
  const { showToast } = useToast();
  const [entry, setEntry] = useState<BookEntry | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"" | BookKind>("");
  const [rating, setRating] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getBookEntryFor(instructorId).then((e) => {
      if (!alive) return;
      setEntry(e);
      setKind(e?.list_kind ?? "");
      setRating(e?.rating ? String(e.rating) : "");
      setNote(e?.note ?? "");
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [instructorId]);

  if (!loaded) return null;

  async function save() {
    if (!kind) return showToast("「候補」か「取引先」を選んでください。");
    setBusy(true);
    const { error } = await saveBookEntryFor(requesterId, instructorId, { list_kind: kind, rating: rating ? Number(rating) : null, note: note.trim() || null }, entry?.entry_id);
    setBusy(false);
    if (error) return showToast("保存できませんでした。");
    showToast("自社の講師台帳に保存しました。");
    setEntry(await getBookEntryFor(instructorId));
    setOpen(false);
  }

  async function remove() {
    if (!entry) return;
    setBusy(true);
    const { error } = await deleteBookEntry(entry.entry_id);
    setBusy(false);
    if (error) return showToast("削除できませんでした。");
    setEntry(null);
    setKind("");
    setRating("");
    setNote("");
    showToast("台帳から外しました。");
    setOpen(false);
  }

  return (
    <div className="detail-block" style={{ marginTop: 24 }}>
      <h2 className="detail-block__title">自社の講師台帳（社内メモ）</h2>
      <p className="detail-block__text" style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>
        この内容はあなたの会社だけに表示されます。講師や他の企業には見えません。
      </p>
      {entry && !open && (
        <p className="detail-block__text" style={{ whiteSpace: "pre-wrap" }}>
          {entry.list_kind === "regular" ? "取引先" : "候補"}
          {entry.rating ? `　評価 ${"★".repeat(entry.rating)}${"☆".repeat(5 - entry.rating)}` : ""}
          {entry.note ? `\n${entry.note}` : ""}
        </p>
      )}
      {open ? (
        <div className="inline-quote-form is-open">
          <div className="form-row">
            <div className="form-field">
              <label>区分</label>
              <Select value={kind} onChange={(e) => setKind(e.target.value as "" | BookKind)}>
                <option value="">選んでください</option>
                <option value="candidate">候補</option>
                <option value="regular">取引先</option>
              </Select>
            </div>
            <div className="form-field">
              <label>社内評価</label>
              <Select value={rating} onChange={(e) => setRating(e.target.value)}>
                <option value="">なし</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="form-field">
            <label>選定メモ</label>
            <textarea rows={3} maxLength={2000} placeholder="例：前回の研修で好評。次回も依頼したい。" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={save}>
              保存する
            </button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setOpen(false)}>
              閉じる
            </button>
            {entry && (
              <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={remove}>
                台帳から外す
              </button>
            )}
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
          {entry ? "メモを編集する" : "台帳に入れる・メモを書く"}
        </button>
      )}
    </div>
  );
}
