"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import { InviteSteps, PartnerFlowArt } from "@/components/requests/PartnerArt";
import {
  acceptPartnerInvite,
  getInstructorChoices,
  getPartnerDocuments,
  getPartnerLinks,
  getPartnerRequests,
  leavePartner,
  proposeLecturer,
  withdrawProposal,
  type PartnerDocuments,
  type PartnerLink,
  type PartnerRequest,
} from "@/lib/requester/partners";
import { getBookEntries, type BookEntry } from "@/lib/requester/book";
import { Select } from "@/components/ui/Select";
import { calcOrder, type OrderLike } from "@/lib/requests/order-calc";
import { calcInvoice, dayText, type InvoiceLike } from "@/lib/requests/invoice-calc";
import { INVOICE_STATUS_TEXT } from "@/lib/requests/invoices";
import { ORDER_STATUS_TEXT } from "@/lib/requests/orders";
import { budgetText, costLines, type MoneyFields } from "@/lib/requests/money";
import {
  canPropose,
  formatInviteCode,
  INVITE_STORAGE_KEY,
  inviteReasonText,
  isCompleteInviteCode,
  normalizeInviteCode,
  partnerErrorText,
  partnerRoleText,
  proposalStatusText,
} from "@/lib/requests/partner-flow";
import { dayLine, normalizeDays, requestFormatLabel } from "@/lib/requests/schedule";

const STATUS: Record<string, { key: string; label: string }> = {
  pending: { key: "pending", label: "募集・調整中" },
  accepted: { key: "accepted", label: "講師決定" },
  completed: { key: "completed", label: "完了" },
  cancelled: { key: "cancelled", label: "キャンセル" },
};

type TabKey = "summary" | "days" | "speaker" | "money" | "docs";

/** 関係先の案件 (#53): the tab of a partner company. Enter a code, see the shared requests, propose a lecturer. */
export function PartnerRequests({ onCount, onPendingCode }: { onCount?: (n: number) => void; /** A code from the invitation link is waiting: the parent can open this tab. */ onPendingCode?: () => void }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [links, setLinks] = useState<PartnerLink[] | null>(null);
  const [rows, setRows] = useState<PartnerRequest[] | null>(null);
  const [code, setCode] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(10);

  const load = useCallback(async () => {
    const [l, r] = await Promise.all([getPartnerLinks(), getPartnerRequests()]);
    setLinks(l);
    setRows(r);
    onCount?.(r.length);
  }, [onCount]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function connect() {
    if (!isCompleteInviteCode(code)) return setCodeError("招待コードは8文字です。入力内容をご確認ください。");
    setBusy(true);
    setCodeError(null);
    const res = await acceptPartnerInvite(code);
    setBusy(false);
    if (!res.ok) return setCodeError(inviteReasonText(res.reason));
    showToast(`${res.company_name ?? "依頼元の企業"} と連携しました。`);
    setCode("");
    setCodeOpen(false);
    await load();
  }

  async function leave(l: PartnerLink) {
    const ok = await confirm({
      title: "連携をやめますか？",
      message: `「${l.company_name ?? "依頼元の企業"}」の案件が、このタブに表示されなくなります。もう一度連携するには、新しい招待コードが必要です。`,
      confirmLabel: "連携をやめる",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await leavePartner(l.partner_id);
    setBusy(false);
    if (error) return showToast(partnerErrorText(error));
    showToast("連携をやめました。");
    await load();
  }

  // A code that came with the invitation link (kept by the page /partner-invite while the partner logged in).
  useEffect(() => {
    (async () => {
      let saved = "";
      try {
        saved = localStorage.getItem(INVITE_STORAGE_KEY) ?? "";
        if (saved) localStorage.removeItem(INVITE_STORAGE_KEY);
      } catch {
        saved = "";
      }
      if (isCompleteInviteCode(saved)) {
        setCode(normalizeInviteCode(saved));
        setCodeOpen(true);
        onPendingCode?.();
      }
    })();
  }, [onPendingCode]);

  if (links === null || rows === null) return <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p>;

  const noLinks = links.length === 0;
  const codeBox = (
    <div className="pa-codebox">
      <label htmlFor="pa-code-input" className="pa-codebox__label">
        招待コード
      </label>
      <div className="pa-codebox__row">
        <input
          id="pa-code-input"
          className="pa-codebox__input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="例：K7M2-9QXA"
          value={formatInviteCode(code)}
          onChange={(e) => {
            setCode(normalizeInviteCode(e.target.value));
            setCodeError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void connect();
          }}
        />
        <button type="button" className="btn btn--primary btn--sm" disabled={busy || !code} onClick={connect}>
          連携する
        </button>
        {!noLinks && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCodeOpen(false)}>
            閉じる
          </button>
        )}
      </div>
      {codeError && (
        <p className="pa-codebox__error" role="alert">
          {codeError}
        </p>
      )}
    </div>
  );

  return (
    <div className="pa-wrap">
      <section className="pa-intro">
        <PartnerFlowArt />
        <p>
          他の企業があなたの会社を「関係先（協力会社）」として登録し、招待コードを渡すと、その企業の案件がここに表示されます。案件の確認と、登壇する講師の提案ができます。
        </p>
      </section>

      {noLinks ? (
        <section className="pa-card">
          <h3 className="pa-card__title">はじめに：招待コードを入力してください</h3>
          <InviteSteps />
          {codeBox}
        </section>
      ) : (
        <section className="pa-links">
          <h3 className="pa-card__title">連携中の依頼元</h3>
          <ul className="pa-chips">
            {links.map((l) => (
              <li key={l.partner_id} className="pa-chip">
                <span>
                  <strong>{l.company_name ?? "（名前未設定）"}</strong>
                  <span className="pa-chip__sub">登録名：{l.partner_name}</span>
                </span>
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => leave(l)}>
                  連携をやめる
                </button>
              </li>
            ))}
          </ul>
          {codeOpen ? (
            codeBox
          ) : (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCodeOpen(true)}>
              ＋ 別の依頼元の招待コードを入力
            </button>
          )}
        </section>
      )}

      {!noLinks && (
        <>
          <h3 className="pa-card__title" style={{ marginTop: 22 }}>
            共有された案件（{rows.length}件）
          </h3>
          {rows.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state__title">共有された案件はまだありません</p>
              <p className="empty-state__desc">依頼元の企業が、案件の「商流」であなたの会社を契約先または間に入る関係先に設定すると、ここに表示されます。</p>
            </div>
          ) : (
            rows.slice(0, shown).map((r) => <PartnerRequestRow key={r.request_id} r={r} onChanged={load} />)
          )}
          {rows.length > shown && (
            <p style={{ textAlign: "center", margin: "8px 0 0" }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShown((n) => n + 10)}>
                もっと見る（残り{rows.length - shown}件）
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PartnerRequestRow({ r, onChanged }: { r: PartnerRequest; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("summary");
  const days = useMemo(() => normalizeDays(r.schedule_days), [r.schedule_days]);
  const st = STATUS[r.status] ?? STATUS.pending;
  const firstDate = days.find((d) => d.date)?.date;
  const dateText = firstDate ? `${firstDate.replace(/-/g, "/")}${days.length > 1 ? ` ほか${days.length - 1}日` : ""}` : "日程未定";
  const waiting = r.proposals.filter((p) => p.status === "new").length;

  const tabs: [TabKey, string][] = [
    ["summary", "概要"],
    ["days", `日程${days.length ? `（${days.length}）` : ""}`],
    ["speaker", `登壇講師${waiting ? `（提案${waiting}）` : ""}`],
    ...(r.show_amount && r.money ? ([["money", "金額"]] as [TabKey, string][]) : []),
    ...(r.my_role === "contract" ? ([["docs", "書類"]] as [TabKey, string][]) : []),
  ];

  return (
    <div className={`req-row${open ? " is-open" : ""}`}>
      <button type="button" className="req-row__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="req-row__main">
          <span className="req-row__line1">
            <span className="req-row__title">{r.title}</span>
          </span>
          <span className="req-row__line2">{[r.company_name ?? "依頼元", partnerRoleText(r.my_role), dateText].join("　・　")}</span>
        </span>
        <span className={`req-badge req-badge--${st.key}`}>{st.label}</span>
        <svg className="req-row__chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="req-row__body">
          <div className="pa-tabs" role="tablist" aria-label="案件の情報">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={`pa-tab${tab === key ? " is-active" : ""}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
          {tab === "summary" && <SummaryTab r={r} />}
          {tab === "days" && (
            <div className="pa-panel">
              {days.length === 0 ? (
                <p className="pa-muted">日程はまだ決まっていません。</p>
              ) : (
                <ol className="pa-days">
                  {days.map((d, i) => (
                    <li key={i}>{dayLine(d)}</li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {tab === "speaker" && <SpeakerTab r={r} onChanged={onChanged} />}
          {tab === "money" && r.money && <MoneyTab money={r.money} />}
          {tab === "docs" && <DocsTab requestId={r.request_id} />}
        </div>
      )}
    </div>
  );
}

function SummaryTab({ r }: { r: PartnerRequest }) {
  return (
    <div className="pa-panel">
      <dl className="pa-dl">
        <dt>依頼元</dt>
        <dd>{r.company_name ?? "—"}</dd>
        <dt>あなたの立場</dt>
        <dd>
          {partnerRoleText(r.my_role)}
          <span className="pa-muted">（登録名：{r.partner_name}）</span>
        </dd>
        <dt>形式</dt>
        <dd>{requestFormatLabel(r)}</dd>
        {r.location && (
          <>
            <dt>場所</dt>
            <dd>{r.location}</dd>
          </>
        )}
        {r.participant_count ? (
          <>
            <dt>人数</dt>
            <dd>{r.participant_count}名</dd>
          </>
        ) : null}
        <dt>金額</dt>
        <dd className="pa-muted">{r.show_amount ? "「金額」タブをご覧ください。" : r.my_role === "contract" ? "依頼元の設定により表示されません（注文書・請求書は「書類」タブで確認できます）。" : "依頼元の設定により表示されません。"}</dd>
      </dl>
      <p className="pa-desc">{r.description}</p>
      {r.show_note && r.memo && (
        <div className="pa-memo">
          <strong>依頼元からのメモ</strong>
          <p>{r.memo}</p>
        </div>
      )}
    </div>
  );
}

const yen = (n: number | null) => (n === null ? "—" : `¥${n.toLocaleString()}`);

/** 書類 (read only): the 注文書 and 請求書 of a request, for the contract party. No bank details, no receipts. */
function DocsTab({ requestId }: { requestId: string }) {
  const [docs, setDocs] = useState<PartnerDocuments | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      setDocs(await getPartnerDocuments(requestId));
    })();
  }, [requestId]);

  if (docs === undefined) return <div className="pa-panel"><p className="pa-muted">読み込み中…</p></div>;
  if (docs === null) return <div className="pa-panel"><p className="pa-muted">書類を表示できませんでした。</p></div>;

  return (
    <div className="pa-panel">
      <p className="pa-muted" style={{ marginTop: 0 }}>契約先として、この案件の注文書・請求書を確認できます（閲覧のみ）。</p>
      <h4 className="pa-form__title">注文書</h4>
      {docs.orders.length === 0 && <p className="pa-muted">まだ発行されていません。</p>}
      {docs.orders.map((o) => {
        const t = calcOrder(o as unknown as OrderLike);
        const status = ORDER_STATUS_TEXT[o.status as keyof typeof ORDER_STATUS_TEXT] ?? String(o.status ?? "");
        return (
          <div key={String(o.order_id)} className="pa-doc">
            <div className="pa-doc__head">
              <strong>{String(o.title ?? "")}</strong>
              <span className="req-badge req-badge--pending">{status}</span>
            </div>
            <div className="pa-muted">番号 {String(o.order_no ?? "")}　・　発行 {dayText(String(o.issued_at ?? "").slice(0, 10))}</div>
            <ul className="pa-lines">
              {t.lines.map((l, i) => (
                <li key={i}>
                  {l.name}　{l.qty ? `${l.qty}${l.qtyLabel} × ` : ""}{yen(l.unitPrice)}　＝　{yen(l.amount)}
                </li>
              ))}
            </ul>
            <div className="pa-doc__total">合計 {yen(t.total)}（{t.taxLabel}）</div>
            {o.payment_terms ? <div className="pa-muted">支払条件：{String(o.payment_terms)}</div> : null}
          </div>
        );
      })}
      <h4 className="pa-form__title" style={{ marginTop: 16 }}>請求書</h4>
      {docs.invoices.length === 0 && <p className="pa-muted">まだ提出されていません。</p>}
      {docs.invoices.map((i) => {
        const t = calcInvoice(i as unknown as InvoiceLike);
        const status = INVOICE_STATUS_TEXT[i.status as keyof typeof INVOICE_STATUS_TEXT] ?? String(i.status ?? "");
        return (
          <div key={String(i.invoice_id)} className="pa-doc">
            <div className="pa-doc__head">
              <strong>{String(i.title ?? "")}</strong>
              <span className="req-badge req-badge--pending">{status}</span>
            </div>
            <div className="pa-muted">番号 {String(i.invoice_no ?? "")}　・　提出 {dayText(String(i.issued_at ?? "").slice(0, 10))}{i.due_date ? `　・　支払期日 ${dayText(String(i.due_date).slice(0, 10))}` : ""}</div>
            <ul className="pa-lines">
              {t.lines.map((l, n) => (
                <li key={n}>
                  {l.name}　{l.qty ? `${l.qty}${l.qtyLabel} × ` : ""}{yen(l.unitPrice)}　＝　{yen(l.amount)}
                </li>
              ))}
            </ul>
            <div className="pa-doc__total">合計 {yen(t.total)}（{t.taxLabel}）</div>
          </div>
        );
      })}
    </div>
  );
}

function MoneyTab({ money }: { money: Record<string, unknown> }) {
  const m = money as unknown as MoneyFields;
  const lines = costLines(m);
  return (
    <div className="pa-panel">
      <p className="pa-money">{budgetText(m) ?? "金額は未設定です。"}</p>
      {lines.length > 0 && (
        <ul className="pa-lines">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <p className="pa-muted">依頼元の企業が、この案件の金額を関係先にも見せる設定にしています。</p>
    </div>
  );
}

function SpeakerTab({ r, onChanged }: { r: PartnerRequest; onChanged: () => void }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<{ id: string; name: string }[] | null>(null);
  const [book, setBook] = useState<BookEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const mayPropose = canPropose(r.status);

  async function ensureChoices() {
    if (choices === null) setChoices(await getInstructorChoices());
  }
  // My own 講師台帳: people I already know, registered lecturers and name-only entries.
  useEffect(() => {
    if (!canPropose(r.status)) return;
    (async () => {
      const [b, c] = await Promise.all([getBookEntries(), getInstructorChoices()]);
      setBook(b);
      setChoices(c);
    })();
  }, [r.status]);
  const ledger = (book ?? [])
    .map((e) => ({
      key: e.entry_id,
      id: e.instructor_id,
      name: e.instructor_id ? (choices ?? []).find((c) => c.id === e.instructor_id)?.name ?? null : e.external_name,
    }))
    .filter((x): x is { key: string; id: string | null; name: string } => !!x.name);
  const matches = (choices ?? []).filter((c) => query.trim() && c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);

  async function submit() {
    const finalName = (pick?.name ?? name).trim();
    if (!finalName) return showToast("講師名を入力してください。");
    setBusy(true);
    const { error } = await proposeLecturer(r.request_id, finalName, pick?.id ?? null, note.trim() || null);
    setBusy(false);
    if (error) return showToast(partnerErrorText(error));
    showToast("提案を送りました。依頼元の企業が確認します。");
    setName("");
    setNote("");
    setPick(null);
    setQuery("");
    onChanged();
  }

  async function withdraw(id: string, lecturer: string) {
    const ok = await confirm({ title: "提案を取り下げますか？", message: `「${lecturer}」さんの提案を取り下げます。`, confirmLabel: "取り下げる", tone: "danger" });
    if (!ok) return;
    setBusy(true);
    const { error } = await withdrawProposal(id);
    setBusy(false);
    if (error) return showToast(partnerErrorText(error));
    showToast("取り下げました。");
    onChanged();
  }

  return (
    <div className="pa-panel">
      <p className="pa-speaker">
        現在の登壇講師：<strong>{r.speaker_name ?? "未定"}</strong>
      </p>

      {mayPropose ? (
        <div className="pa-form">
          <h4 className="pa-form__title">登壇講師を提案する</h4>
          <div className="form-field">
            <label htmlFor={`pa-name-${r.request_id}`}>講師名</label>
            <input id={`pa-name-${r.request_id}`} type="text" maxLength={100} value={pick ? pick.name : name} disabled={!!pick} onChange={(e) => setName(e.target.value)} placeholder="例：山田 太郎" />
          </div>
          {ledger.length > 0 && !pick && (
            <div className="form-field">
              <label>自社の講師台帳から選ぶ（任意）</label>
              <Select
                value=""
                onChange={(e) => {
                  const hit = ledger.find((x) => x.key === e.target.value);
                  if (!hit) return;
                  if (hit.id) setPick({ id: hit.id, name: hit.name });
                  else setName(hit.name);
                }}
              >
                <option value="">選択してください</option>
                {ledger.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.name}
                    {x.id ? "（Kenshu Link講師）" : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="form-field">
            <label htmlFor={`pa-pick-${r.request_id}`}>Kenshu Linkの講師から選ぶ（任意）</label>
            {pick ? (
              <div className="pa-picked">
                <span>
                  <strong>{pick.name}</strong>
                  <span className="instructor-card__tag">Kenshu Link講師</span>
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPick(null)}>
                  選び直す
                </button>
              </div>
            ) : (
              <>
                <input id={`pa-pick-${r.request_id}`} type="search" placeholder="名前で探す" value={query} onFocus={ensureChoices} onChange={(e) => setQuery(e.target.value)} />
                {matches.length > 0 && (
                  <ul className="pa-matches">
                    {matches.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPick(c);
                            setQuery("");
                          }}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {query.trim() && choices !== null && matches.length === 0 && <span className="pa-muted">該当する講師が見つかりません。名前だけで提案できます。</span>}
              </>
            )}
            <span className="pa-muted">Kenshu Linkの講師を選ぶと、研修アンケートの評価がその講師につきます。</span>
          </div>
          <div className="form-field">
            <label htmlFor={`pa-note-${r.request_id}`}>メモ（任意）</label>
            <textarea id={`pa-note-${r.request_id}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="得意分野や、提案の理由など" />
          </div>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={submit}>
            提案する
          </button>
        </div>
      ) : (
        <p className="pa-muted">この案件は終了しているため、提案できません。</p>
      )}

      {r.proposals.length > 0 && (
        <div className="pa-mine">
          <h4 className="pa-form__title">あなたの提案</h4>
          {r.proposals.map((p) => (
            <div key={p.proposal_id} className="pa-prop">
              <div className="pa-prop__main">
                <strong>{p.lecturer_name}</strong>
                {p.instructor_id && <span className="instructor-card__tag">Kenshu Link講師</span>}
                {p.note && <div className="pa-prop__note">{p.note}</div>}
              </div>
              <span className={`req-badge ${p.status === "accepted" ? "req-badge--accepted" : p.status === "new" ? "req-badge--pending" : "req-badge--cancelled"}`}>{proposalStatusText(p.status)}</span>
              {p.status === "new" && (
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => withdraw(p.proposal_id, p.lecturer_name)}>
                  取り下げる
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
