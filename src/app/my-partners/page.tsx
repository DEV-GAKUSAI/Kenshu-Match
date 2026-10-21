"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useRoleTheme } from "@/hooks/useRoleTheme";
import { getInstructorNames } from "@/lib/instructor/profile";
import { getBookEntries } from "@/lib/requester/book";
import { addPartner, deletePartner, getPartners, PARTNER_KIND_TEXT, updatePartner, type Partner, type PartnerKind } from "@/lib/requester/partners";
import "../mypage/mypage.css";

const EMPTY = { name: "", kind: "company" as PartnerKind, contact: "", note: "", instructorId: "" };

/** 関係先の管理 (#53): partner companies and instructors that can sit in a request's flow. */
export default function MyPartnersPage() {
  const { authReady, user } = useAuth();
  const { showToast } = useToast();
  useRoleTheme("business");
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkable, setLinkable] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setPartners(await getPartners());
    const ids = (await getBookEntries()).map((e) => e.instructor_id).filter((x): x is string => !!x);
    const names = ids.length ? await getInstructorNames(ids) : {};
    setLinkable(ids.map((id) => ({ id, name: names[id]?.name ?? "（名前未設定）" })));
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

  async function submit() {
    if (!form.name.trim()) return showToast("名前を入力してください。");
    setBusy(true);
    const payload = { name: form.name, kind: form.kind, contact: form.contact.trim() || null, note: form.note.trim() || null, instructor_id: form.kind === "instructor" && form.instructorId ? form.instructorId : null };
    const { error } = editId ? await updatePartner(editId, payload) : await addPartner(me.id, payload);
    setBusy(false);
    if (error) return showToast("保存できませんでした。");
    showToast(editId ? "更新しました。" : "関係先を登録しました。");
    setForm(EMPTY);
    setEditId(null);
    await load();
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await deletePartner(id);
    setBusy(false);
    if (error) return showToast("削除できませんでした。");
    showToast("関係先を削除しました。");
    if (editId === id) {
      setEditId(null);
      setForm(EMPTY);
    }
    await load();
  }

  return (
    <main className="mypage">
      <div className="mypage__head">
        <h1 className="mypage__title">関係先の管理</h1>
        <p className="mypage__role">協力会社や講師を登録します。依頼ごとの「商流」で、契約先・間に入る関係先・登壇講師として選べます。講師には見えません。</p>
      </div>
      <p style={{ margin: "0 0 14px" }}>
        <Link href="/mypage">← マイページに戻る</Link>
      </p>

      <div className="form-card" style={{ marginBottom: 20 }}>
        <h2 className="section__title" style={{ fontSize: 16, marginTop: 0 }}>
          {editId ? "関係先を編集" : "関係先を登録"}
        </h2>
        <div className="form-row">
          <div className="form-field">
            <label>名前</label>
            <input type="text" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-field">
            <label>区分</label>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PartnerKind })}>
              <option value="company">協力会社</option>
              <option value="instructor">講師</option>
            </select>
          </div>
        </div>
        {form.kind === "instructor" && (
          <div className="form-field">
            <label>Kenshu Linkの講師と紐づける（任意）</label>
            <select value={form.instructorId} onChange={(e) => setForm({ ...form, instructorId: e.target.value })}>
              <option value="">紐づけない</option>
              {linkable.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: "var(--color-ink-soft)" }}>
              自社の講師台帳にいるKenshu Link登録講師から選べます（先に、講師のページで「台帳に入れる」を押してください）。この講師を「実際の登壇講師」にすると、研修アンケートの評価がこの講師につきます。
            </span>
          </div>
        )}
        <div className="form-field">
          <label>連絡先（任意）</label>
          <input type="text" maxLength={300} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        </div>
        <div className="form-field">
          <label>メモ（任意）</label>
          <textarea rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={submit}>
            {editId ? "更新する" : "登録する"}
          </button>
          {editId && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setEditId(null);
                setForm(EMPTY);
              }}
            >
              やめる
            </button>
          )}
        </div>
      </div>

      {partners === null ? (
        <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>
      ) : partners.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">関係先はまだ登録されていません</p>
        </div>
      ) : (
        partners.map((p) => (
          <div key={p.partner_id} className="request-card" style={{ marginBottom: 10 }}>
            <strong>{p.name}</strong>　<span className="instructor-card__tag">{PARTNER_KIND_TEXT[p.kind]}</span>{p.instructor_id ? <span className="instructor-card__tag">Kenshu Link講師と紐づけ済み</span> : null}
            {p.contact && <div style={{ fontSize: 13, marginTop: 4 }}>連絡先：{p.contact}</div>}
            {p.note && <div style={{ fontSize: 13, marginTop: 4, whiteSpace: "pre-wrap", color: "var(--color-ink-soft)" }}>{p.note}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setEditId(p.partner_id);
                  setForm({ name: p.name, kind: p.kind, contact: p.contact ?? "", note: p.note ?? "", instructorId: p.instructor_id ?? "" });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                編集
              </button>
              <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => remove(p.partner_id)}>
                削除
              </button>
            </div>
          </div>
        ))
      )}
    </main>
  );
}
