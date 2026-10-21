"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useRoleTheme } from "@/hooks/useRoleTheme";
import { getInstructorNames } from "@/lib/instructor/profile";
import { addExternalEntry, deleteBookEntry, getBookEntries, KIND_TEXT, updateBookEntry, type BookEntry, type BookKind } from "@/lib/requester/book";
import "../mypage/mypage.css";
import { Select } from "@/components/ui/Select";

/** 自社の講師台帳 (#57): my regular instructors and candidates, also people who are not on Kenshu Link. */
export default function MyInstructorsPage() {
  const { authReady, user } = useAuth();
  const { showToast } = useToast();
  useRoleTheme("business");
  const [entries, setEntries] = useState<BookEntry[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | BookKind>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [nf, setNf] = useState({ name: "", contact: "", kind: "candidate" as BookKind, note: "" });
  const [edit, setEdit] = useState({ kind: "candidate" as BookKind, rating: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(10);

  const load = useCallback(async () => {
    const rows = await getBookEntries();
    setEntries(rows);
    const ids = rows.map((r) => r.instructor_id).filter((x): x is string => !!x);
    const map = await getInstructorNames(ids);
    setNames(Object.fromEntries(Object.entries(map).map(([id, v]) => [id, v.name ?? "（名前未設定）"])));
  }, []);

  useEffect(() => {
    if (authReady && user && (user.role === "COMPANY" || user.role === "INDIVIDUAL")) void load();
  }, [authReady, user, load]);

  if (!authReady) return null;
  if (!user || (user.role !== "COMPANY" && user.role !== "INDIVIDUAL")) {
    return (
      <main className="mypage">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <p className="empty-state__title">企業・個人アカウントのみご利用いただけます</p>
        </div>
      </main>
    );
  }
  const me = user;

  async function add() {
    if (!nf.name.trim()) return showToast("講師の名前を入力してください。");
    setBusy(true);
    const { error } = await addExternalEntry(me.id, nf.name, nf.contact, { list_kind: nf.kind, rating: null, note: nf.note.trim() || null });
    setBusy(false);
    if (error) return showToast("登録できませんでした。");
    showToast("台帳に登録しました。");
    setNf({ name: "", contact: "", kind: "candidate", note: "" });
    setAddOpen(false);
    await load();
  }

  async function save(id: string) {
    setBusy(true);
    const { error } = await updateBookEntry(id, { list_kind: edit.kind, rating: edit.rating ? Number(edit.rating) : null, note: edit.note.trim() || null });
    setBusy(false);
    if (error) return showToast("保存できませんでした。");
    showToast("保存しました。");
    setOpenId(null);
    await load();
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await deleteBookEntry(id);
    setBusy(false);
    if (error) return showToast("削除できませんでした。");
    setOpenId(null);
    await load();
  }

  const shown = (entries ?? []).filter((e) => filter === "all" || e.list_kind === filter);

  return (
    <main className="mypage">
      <div className="mypage__head">
        <h1 className="mypage__title">自社の講師台帳</h1>
        <p className="mypage__role">
          <Link href="/mypage">← マイページ</Link>　この内容はあなたの会社だけに表示されます。
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
        {([["all", "すべて"], ["regular", "取引先"], ["candidate", "候補"]] as const).map(([k, label]) => (
          <button key={k} type="button" className={`btn btn--sm ${filter === k ? "btn--primary" : "btn--ghost"}`} onClick={() => {
            setFilter(k);
            setLimit(10);
          }}>
            {label}
          </button>
        ))}
        <button type="button" className="btn btn--primary btn--sm" style={{ marginLeft: "auto" }} onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? "閉じる" : "Kenshu Linkにいない講師を登録する"}
        </button>
      </div>

      {addOpen && (
        <div className="request-card" style={{ marginBottom: 14 }}>
          <div className="request-card__title">講師を台帳に登録する</div>
          <p className="request-card__meta" style={{ margin: "6px 0 10px" }}>
            すでに取引のある講師や、候補の講師を自社用に控えておけます。Kenshu Linkに登録しているかどうかは問いません。
          </p>
          <div className="form-row">
            <div className="form-field">
              <label>名前</label>
              <input type="text" maxLength={80} value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
            </div>
            <div className="form-field">
              <label>区分</label>
              <Select value={nf.kind} onChange={(e) => setNf({ ...nf, kind: e.target.value as BookKind })}>
                <option value="candidate">候補</option>
                <option value="regular">取引先</option>
              </Select>
            </div>
          </div>
          <div className="form-field">
            <label>連絡先（任意）</label>
            <input type="text" maxLength={200} placeholder="メール・電話・所属など" value={nf.contact} onChange={(e) => setNf({ ...nf, contact: e.target.value })} />
          </div>
          <div className="form-field">
            <label>メモ（任意）</label>
            <textarea rows={2} maxLength={2000} value={nf.note} onChange={(e) => setNf({ ...nf, note: e.target.value })} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={add}>
            登録する
          </button>
        </div>
      )}

      {entries === null && <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>}
      {entries !== null && shown.length === 0 && (
        <div className="empty-state">
          <p className="empty-state__title">台帳にはまだ誰もいません</p>
          <p className="empty-state__desc">講師のページで「台帳に入れる」を押すか、上のボタンから登録できます。</p>
        </div>
      )}

      {entries !== null && shown.length > 0 && (
        <h2 className="section__title" style={{ fontSize: 16, margin: "0 0 10px" }}>
          登録済みの講師（{shown.length}件）
        </h2>
      )}

      {shown.slice(0, limit).map((e) => {
        const isOpen = openId === e.entry_id;
        const title = e.instructor_id ? names[e.instructor_id] ?? "…" : e.external_name;
        return (
          <div key={e.entry_id} className={`req-row${isOpen ? " is-open" : ""}`}>
            <button
              type="button"
              className="req-row__head"
              aria-expanded={isOpen}
              onClick={() => {
                setOpenId(isOpen ? null : e.entry_id);
                setEdit({ kind: e.list_kind, rating: e.rating ? String(e.rating) : "", note: e.note ?? "" });
              }}
            >
              <span className="req-row__main">
                <span className="req-row__line1">
                  <span className="req-row__title">{title}</span>
                </span>
                <span className="req-row__line2">
                  {e.instructor_id ? "Kenshu Link登録の講師" : "Kenshu Link外の講師"}
                  {e.rating ? ` ・ ${"★".repeat(e.rating)}` : ""}
                  {e.note ? ` ・ ${e.note.replace(/\s+/g, " ").slice(0, 40)}` : ""}
                </span>
              </span>
              <span className={`req-badge ${e.list_kind === "regular" ? "req-badge--accepted" : "req-badge--quoted"}`}>{KIND_TEXT[e.list_kind]}</span>
              <svg className="req-row__chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {isOpen && (
              <div className="req-row__body">
                {e.instructor_id && (
                  <p style={{ margin: "12px 0 0" }}>
                    <Link href={`/instructor-detail?id=${e.instructor_id}`}>講師のページを見る →</Link>
                  </p>
                )}
                {e.external_contact && <p style={{ margin: "10px 0 0", fontSize: 13 }}>連絡先：{e.external_contact}</p>}
                <div className="form-row" style={{ marginTop: 12 }}>
                  <div className="form-field">
                    <label>区分</label>
                    <Select value={edit.kind} onChange={(ev) => setEdit({ ...edit, kind: ev.target.value as BookKind })}>
                      <option value="candidate">候補</option>
                      <option value="regular">取引先</option>
                    </Select>
                  </div>
                  <div className="form-field">
                    <label>社内評価</label>
                    <Select value={edit.rating} onChange={(ev) => setEdit({ ...edit, rating: ev.target.value })}>
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
                  <label>メモ</label>
                  <textarea rows={3} maxLength={2000} value={edit.note} onChange={(ev) => setEdit({ ...edit, note: ev.target.value })} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => save(e.entry_id)}>
                    保存する
                  </button>
                  <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => remove(e.entry_id)}>
                    台帳から外す
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {shown.length > limit && (
        <p style={{ textAlign: "center", margin: "8px 0 0" }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLimit((n) => n + 10)}>
            もっと見る（残り{shown.length - limit}件）
          </button>
        </p>
      )}
    </main>
  );
}
