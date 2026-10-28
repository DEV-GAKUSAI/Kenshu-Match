"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useRoleTheme } from "@/hooks/useRoleTheme";
import { getInstructorNames } from "@/lib/instructor/profile";
import { getTrainingSubcategoryOptions } from "@/lib/instructor/expertise";
import { evaluationSummaryText, type EvalSummary } from "@/lib/requests/evaluation-calc";
import { getMyEvaluationSummary } from "@/lib/requests/evaluations";
import { bookFieldsError, filterBook, parsePastRate, pastRateText, MAX_STRENGTHS, MAX_SPEAKING } from "@/lib/requests/book-calc";
import { normalUnit, UNIT_OPTIONS, type BudgetUnit } from "@/lib/requests/money";
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
  const [evals, setEvals] = useState<Record<string, EvalSummary>>({});
  const [filter, setFilter] = useState<"all" | BookKind>("all");
  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [fieldFilter, setFieldFilter] = useState("");
  const [fieldOptions, setFieldOptions] = useState<{ id: string; name: string; categoryName: string }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [nf, setNf] = useState({ name: "", contact: "", kind: "candidate" as BookKind, note: "" });
  const [edit, setEdit] = useState({ kind: "candidate" as BookKind, rating: "", note: "", strengthIds: [] as string[], rateText: "", rateUnit: "hour" as BudgetUnit, speaking: "" });
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(10);

  const load = useCallback(async () => {
    const rows = await getBookEntries();
    setEntries(rows);
    const ids = rows.map((r) => r.instructor_id).filter((x): x is string => !!x);
    const map = await getInstructorNames(ids);
    setNames(Object.fromEntries(Object.entries(map).map(([id, v]) => [id, v.name ?? "（名前未設定）"])));
    setEvals(await getMyEvaluationSummary());
    const { data: fieldRows } = await getTrainingSubcategoryOptions();
    const typed = (fieldRows ?? []) as unknown as { id: string; name: string; training_categories: { name: string } | null }[];
    setFieldOptions(typed.map((f) => ({ id: f.id, name: f.name, categoryName: f.training_categories?.name ?? "" })));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state only after awaiting
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
    const problem = bookFieldsError({ strengthIds: edit.strengthIds, rateText: edit.rateText, rateUnit: edit.rateUnit, speaking: edit.speaking });
    if (problem) return showToast(problem);
    const rate = parsePastRate(edit.rateText, edit.rateUnit);
    setBusy(true);
    const { error } = await updateBookEntry(id, {
      list_kind: edit.kind,
      rating: edit.rating ? Number(edit.rating) : null,
      note: edit.note.trim() || null,
      strength_field_ids: edit.strengthIds,
      past_rate_amount: rate.amount,
      past_rate_unit: rate.unit,
      speaking_record: edit.speaking.trim() || null,
    });
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

  async function toggleFavorite(entry: BookEntry) {
    const next = !entry.is_favorite;
    setEntries((current) => (current ?? []).map((x) => (x.entry_id === entry.entry_id ? { ...x, is_favorite: next } : x)));
    const { error } = await updateBookEntry(entry.entry_id, { is_favorite: next });
    if (error) {
      setEntries((current) => (current ?? []).map((x) => (x.entry_id === entry.entry_id ? { ...x, is_favorite: !next } : x)));
      showToast("お気に入りを変更できませんでした。");
    }
  }

  const fieldNames = Object.fromEntries(fieldOptions.map((f) => [f.id, f.name]));
  const nameOf = (e: BookEntry) => (e.instructor_id ? names[e.instructor_id] ?? "" : e.external_name ?? "");
  const filtersOn = query.trim() !== "" || favOnly || fieldFilter !== "";
  const shown = filterBook(entries ?? [], { query, kind: filter, favoriteOnly: favOnly, fieldId: fieldFilter }, nameOf, fieldNames);

  return (
    <main className="mypage">
      <div className="mypage__head">
        <h1 className="mypage__title">自社の講師台帳</h1>
        <p className="mypage__role">
          <Link href="/mypage">← マイページ</Link>　この内容はあなたの会社だけに表示されます。
        </p>
      </div>


      <p className="request-card__meta" style={{ margin: "0 0 14px", lineHeight: 1.7 }}>
        「依頼ごとの評価」は、完了した依頼を開き、決定した講師の「評価」タブから入力できます（<Link href="/mypage">マイページへ</Link>）。入力するとここに平均が表示されます。
      </p>

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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
        <input
          type="search"
          placeholder="名前・得意領域・登壇実績・メモなどで探す"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(10);
          }}
          style={{ flex: "1 1 220px", minWidth: 0 }}
        />
        <Select
          aria-label="得意領域で絞り込む"
          value={fieldFilter}
          onChange={(e) => {
            setFieldFilter(e.target.value);
            setLimit(10);
          }}
          style={{ flex: "1 1 200px", minWidth: 0 }}
        >
          <option value="">得意領域：すべて</option>
          {[...new Set(fieldOptions.map((f) => f.categoryName))].map((cat) => (
            <optgroup key={cat} label={cat}>
              {fieldOptions.filter((f) => f.categoryName === cat).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <button
          type="button"
          aria-pressed={favOnly}
          className={`btn btn--sm ${favOnly ? "btn--primary" : "btn--ghost"}`}
          onClick={() => {
            setFavOnly((v) => !v);
            setLimit(10);
          }}
        >
          ★ お気に入りだけ
        </button>
        {filtersOn && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setQuery("");
              setFavOnly(false);
              setFieldFilter("");
            }}
          >
            条件をクリア
          </button>
        )}
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
          {entries.length > 0 || filtersOn ? (
            <>
              <p className="empty-state__title">条件に合う講師がいません</p>
              <p className="empty-state__desc">検索の言葉や絞り込みを変えてみてください。</p>
            </>
          ) : (
            <>
              <p className="empty-state__title">台帳にはまだ誰もいません</p>
              <p className="empty-state__desc">講師のページで「台帳に入れる」を押すか、上のボタンから登録できます。</p>
            </>
          )}
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
            <div style={{ display: "flex", alignItems: "center" }}>
            <button
              type="button"
              aria-pressed={e.is_favorite}
              aria-label={e.is_favorite ? `${title}をお気に入りから外す` : `${title}をお気に入りに入れる`}
              title={e.is_favorite ? "お気に入り" : "お気に入りに入れる"}
              onClick={() => void toggleFavorite(e)}
              style={{ flex: "none", width: 40, alignSelf: "stretch", border: 0, background: "transparent", cursor: "pointer", fontSize: 18, color: e.is_favorite ? "#e0a400" : "#b9c6c2" }}
            >
              {e.is_favorite ? "★" : "☆"}
            </button>
            <button
              type="button"
              className="req-row__head"
              style={{ paddingLeft: 4 }}
              aria-expanded={isOpen}
              onClick={() => {
                setOpenId(isOpen ? null : e.entry_id);
                setEdit({
                  kind: e.list_kind,
                  rating: e.rating ? String(e.rating) : "",
                  note: e.note ?? "",
                  strengthIds: e.strength_field_ids ?? [],
                  rateText: e.past_rate_amount === null ? "" : String(e.past_rate_amount),
                  rateUnit: normalUnit(e.past_rate_unit),
                  speaking: e.speaking_record ?? "",
                });
              }}
            >
              <span className="req-row__main">
                <span className="req-row__line1">
                  <span className="req-row__title">{title}</span>
                </span>
                <span className="req-row__line2">
                  {e.instructor_id ? "Kenshu Link登録の講師" : "Kenshu Link外の講師"}
                  {e.rating ? ` ・ ${"★".repeat(e.rating)}` : ""}
                  {e.instructor_id && evals[e.instructor_id] ? ` ・ ★${evals[e.instructor_id].avg.toFixed(1)}（依頼ごと${evals[e.instructor_id].count}件）` : ""}
                  {e.strength_field_ids?.length ? ` ・ ${e.strength_field_ids.slice(0, 3).map((id) => fieldNames[id]).filter(Boolean).join("・")}${e.strength_field_ids.length > 3 ? "ほか" : ""}` : ""}
                  {pastRateText(e) ? ` ・ 過去単価 ${pastRateText(e)}` : ""}
                  {e.note ? ` ・ ${e.note.replace(/\s+/g, " ").slice(0, 40)}` : ""}
                </span>
              </span>
              <span className={`req-badge ${e.list_kind === "regular" ? "req-badge--accepted" : "req-badge--quoted"}`}>{KIND_TEXT[e.list_kind]}</span>
              <svg className="req-row__chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            </div>
            {isOpen && (
              <div className="req-row__body">
                {e.instructor_id && (
                  <p style={{ margin: "12px 0 0" }}>
                    <Link href={`/instructor-detail?id=${e.instructor_id}`}>講師のページを見る →</Link>
                  </p>
                )}
                {e.external_contact && <p style={{ margin: "10px 0 0", fontSize: 13 }}>連絡先：{e.external_contact}</p>}
                {e.instructor_id && evaluationSummaryText(evals[e.instructor_id]) && <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: "#0e7a5f" }}>{evaluationSummaryText(evals[e.instructor_id])}</p>}
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
                  <label>得意領域（{edit.strengthIds.length} / {MAX_STRENGTHS}）</label>
                  <Select
                    aria-label="得意領域を追加する"
                    value=""
                    onChange={(ev) => {
                      const id = ev.target.value;
                      if (id && !edit.strengthIds.includes(id) && edit.strengthIds.length < MAX_STRENGTHS) setEdit({ ...edit, strengthIds: [...edit.strengthIds, id] });
                    }}
                  >
                    <option value="">＋ 研修分野を選んで追加</option>
                    {[...new Set(fieldOptions.map((f) => f.categoryName))].map((cat) => (
                      <optgroup key={cat} label={cat}>
                        {fieldOptions.filter((f) => f.categoryName === cat).map((f) => (
                          <option key={f.id} value={f.id} disabled={edit.strengthIds.includes(f.id)}>
                            {f.name}
                            {edit.strengthIds.includes(f.id) ? "（選択済み）" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                  {edit.strengthIds.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {edit.strengthIds.map((id) => (
                        <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#e6f3ef", color: "#0e6b57", borderRadius: 999, padding: "3px 6px 3px 10px", fontSize: 12.5, fontWeight: 600 }}>
                          {fieldNames[id] ?? "（不明な分野）"}
                          <button type="button" aria-label={`${fieldNames[id] ?? "分野"}を外す`} onClick={() => setEdit({ ...edit, strengthIds: edit.strengthIds.filter((x) => x !== id) })} style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 14, lineHeight: 1, color: "inherit" }}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label>過去単価（円・任意）</label>
                    <input type="text" inputMode="numeric" maxLength={12} placeholder="例：15000" value={edit.rateText} onChange={(ev) => setEdit({ ...edit, rateText: ev.target.value })} />
                  </div>
                  <div className="form-field">
                    <label>単価の種類</label>
                    <Select value={edit.rateUnit} onChange={(ev) => setEdit({ ...edit, rateUnit: ev.target.value as BudgetUnit })}>
                      {UNIT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="form-field">
                  <label>登壇実績（任意）</label>
                  <textarea rows={3} maxLength={MAX_SPEAKING} placeholder="例：Oracleのセミナーで登壇、新人研修を3社で担当" value={edit.speaking} onChange={(ev) => setEdit({ ...edit, speaking: ev.target.value })} />
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
