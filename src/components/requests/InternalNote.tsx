"use client";

import { NoteIcon } from "@/components/requests/ToolIcons";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useToast } from "@/components/common/Toast";
import { createClient } from "@/lib/supabase/client";

/** 社内メモ・担当者: only the company sees it, never the instructors (#46 / #47). */
export function InternalNote({ requestId, requesterId }: { requestId: string; requesterId: string }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<{ owner: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const db = createClient() as unknown as SupabaseClient;
    void db
      .from("request_internal_notes")
      .select("owner_name, internal_note")
      .eq("request_id", requestId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const row = data as { owner_name: string | null; internal_note: string | null } | null;
        setOwner(row?.owner_name ?? "");
        setNote(row?.internal_note ?? "");
        setSaved(row ? { owner: row.owner_name ?? "", note: row.internal_note ?? "" } : null);
      });
    return () => {
      alive = false;
    };
  }, [requestId]);

  async function save() {
    setBusy(true);
    const db = createClient() as unknown as SupabaseClient;
    const { error } = await db
      .from("request_internal_notes")
      .upsert({ request_id: requestId, requester_id: requesterId, owner_name: owner.trim() || null, internal_note: note.trim() || null, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return showToast("保存できませんでした。");
    setSaved({ owner: owner.trim(), note: note.trim() });
    setOpen(false);
    showToast("社内メモを保存しました。");
  }

  return (
    <div style={{ display: "contents" }}>
      {saved && !open && (saved.owner || saved.note) && (
        <div className="tool-block" style={{ color: "var(--color-ink-soft)", whiteSpace: "pre-wrap", marginBottom: 6 }}>
          <strong style={{ color: "var(--color-ink)" }}>社内メモ</strong>（講師には見えません）
          {saved.owner ? `\n担当：${saved.owner}` : ""}
          {saved.note ? `\n${saved.note}` : ""}
        </div>
      )}
      {open ? (
        <div className="inline-quote-form is-open tool-block">
          <div className="form-field">
            <label>担当者</label>
            <input type="text" maxLength={80} value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div className="form-field">
            <label>社内メモ（講師には見えません）</label>
            <textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={save}>
              保存する
            </button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setOpen(false)}>
              閉じる
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--ghost btn--sm tool-btn" onClick={() => setOpen(true)}>
          <NoteIcon />
          {saved ? "メモを編集" : "メモ・担当者"}
        </button>
      )}
    </div>
  );
}
