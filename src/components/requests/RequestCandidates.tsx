"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useToast } from "@/components/common/Toast";
import { UsersIcon } from "@/components/requests/ToolIcons";
import { Select } from "@/components/ui/Select";
import { getInstructorNames } from "@/lib/instructor/profile";
import { addableCandidates, pastRateText } from "@/lib/requests/book-calc";
import { loadFieldNames } from "@/lib/requests/field-names";
import { addRequestCandidate, getBookEntries, getRequestCandidateIds, KIND_TEXT, removeRequestCandidate, type BookEntry } from "@/lib/requester/book";

/** 案件別候補リスト (#57): the lecturers from the company's own 講師台帳 that it keeps as candidates for this request. Only the company sees it. */
export function RequestCandidates({ requestId, requesterId }: { requestId: string; requesterId: string }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[] | null>(null);
  const [entries, setEntries] = useState<BookEntry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [fieldNames, setFieldNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getRequestCandidateIds(requestId).then((list) => {
      if (alive) setIds(list);
    });
    return () => {
      alive = false;
    };
  }, [requestId]);

  const loadDetails = useCallback(async () => {
    const rows = await getBookEntries();
    setEntries(rows);
    const instructorIds = rows.map((r) => r.instructor_id).filter((x): x is string => !!x);
    const map = await getInstructorNames(instructorIds);
    setNames(Object.fromEntries(Object.entries(map).map(([id, v]) => [id, v.name ?? "（名前未設定）"])));
    setFieldNames(await loadFieldNames());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadDetails() sets state only after awaiting
    if (open) void loadDetails();
  }, [open, loadDetails]);

  const picked = ids ?? [];
  const nameOf = (e: BookEntry) => (e.instructor_id ? names[e.instructor_id] ?? "…" : e.external_name ?? "");
  const candidates = picked.map((id) => entries.find((e) => e.entry_id === id)).filter((e): e is BookEntry => !!e);
  const addable = addableCandidates(entries, picked);

  async function add(entryId: string) {
    if (!entryId) return;
    setBusy(true);
    const { error } = await addRequestCandidate(requesterId, requestId, entryId);
    setBusy(false);
    if (error) return showToast("候補に追加できませんでした。");
    setIds([...picked, entryId]);
  }

  async function remove(entryId: string) {
    setBusy(true);
    const { error } = await removeRequestCandidate(requestId, entryId);
    setBusy(false);
    if (error) return showToast("候補から外せませんでした。");
    setIds(picked.filter((id) => id !== entryId));
  }

  return (
    <div style={{ display: "contents" }}>
      {open ? (
        <div className="inline-quote-form is-open tool-block">
          <div className="form-field">
            <label>この依頼の候補リスト（{picked.length}名・自社だけに表示されます）</label>
            {candidates.length === 0 && <p className="request-card__meta" style={{ margin: "4px 0 8px" }}>まだ候補がいません。下から自社の講師台帳の講師を追加できます。</p>}
            {candidates.map((e) => {
              const detail = [
                e.strength_field_ids?.length ? e.strength_field_ids.slice(0, 3).map((id) => fieldNames[id]).filter(Boolean).join("・") : "",
                pastRateText(e) ? `過去単価 ${pastRateText(e)}` : "",
                e.rating ? "★".repeat(e.rating) : "",
              ]
                .filter(Boolean)
                .join(" ・ ");
              return (
                <div key={e.entry_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {e.is_favorite ? "★ " : ""}
                      {e.instructor_id ? <Link href={`/instructor-detail?id=${e.instructor_id}`}>{nameOf(e)}</Link> : nameOf(e)}
                      <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 600, color: "var(--color-ink-soft)" }}>{KIND_TEXT[e.list_kind]}</span>
                    </div>
                    {detail && <div className="request-card__meta" style={{ margin: 0 }}>{detail}</div>}
                  </div>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void remove(e.entry_id)}>
                    外す
                  </button>
                </div>
              );
            })}
          </div>
          {addable.length > 0 ? (
            <div className="form-field">
              <label>台帳から追加する</label>
              <Select aria-label="候補に追加する講師" value="" onChange={(ev) => void add(ev.target.value)}>
                <option value="">＋ 講師を選んで追加</option>
                {addable.map((e) => (
                  <option key={e.entry_id} value={e.entry_id}>
                    {e.is_favorite ? "★ " : ""}
                    {nameOf(e)}（{KIND_TEXT[e.list_kind]}）
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <p className="request-card__meta" style={{ margin: "4px 0 8px" }}>
              {entries.length === 0 ? "台帳に講師がいません。" : "台帳の講師はすべて候補に入っています。"}
              <Link href="/my-instructors">　自社の講師台帳を開く →</Link>
            </p>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn--ghost btn--sm tool-btn" onClick={() => setOpen(true)}>
          <UsersIcon />
          候補リスト{ids !== null && ids.length > 0 ? `（${ids.length}名）` : ""}
        </button>
      )}
    </div>
  );
}
