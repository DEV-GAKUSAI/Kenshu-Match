"use client";

import { useCallback, useEffect, useState } from "react";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import { decideProposal, getProposals, type Partner, type Proposal } from "@/lib/requester/partners";
import { countProposals, partnerErrorText, proposalStatusText } from "@/lib/requests/partner-flow";

function dateText(iso: string): string {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "" : t.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" });
}

/**
 * 協力会社からの講師の提案 (#53). Inside the 商流 area of a request (company side).
 * 採用 sets the request's 登壇講師 (not for requests with several roles); 見送る only marks it.
 */
export function PartnerProposalsBox({
  requestId,
  partners,
  severalInstructors,
  onDecided,
}: {
  requestId: string;
  partners: Partner[];
  severalInstructors: boolean;
  /** Called after an answer, so the 商流 line and the list badge refresh. */
  onDecided: () => void;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOld, setShowOld] = useState(false);

  const load = useCallback(async () => {
    setList(await getProposals(requestId));
  }, [requestId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  if (!list || list.length === 0) return null;
  const counts = countProposals(list);
  const waiting = list.filter((p) => p.status === "new");
  const old = list.filter((p) => p.status !== "new");
  const partnerName = (id: string) => partners.find((p) => p.partner_id === id)?.name ?? "関係先";

  async function answer(p: Proposal, accept: boolean) {
    if (accept) {
      const ok = await confirm({
        title: `「${p.lecturer_name}」さんを採用しますか？`,
        message: severalInstructors
          ? "この依頼は複数名のため、登壇講師は自動では設定されません。採用の記録だけが残ります。"
          : `実際の登壇講師に設定します。${p.instructor_id ? "研修アンケートの評価は、この講師につきます（アンケートのリンクを作る前に設定してください）。" : ""}発行済みの注文書・請求書は変わりません。`,
        confirmLabel: "採用する",
      });
      if (!ok) return;
    }
    setBusy(true);
    const { result, error } = await decideProposal(p.proposal_id, accept);
    setBusy(false);
    if (error) return showToast(partnerErrorText(error));
    showToast(!accept ? "見送りました。" : result === "speaker_set" ? "登壇講師に設定しました。" : "採用として記録しました。");
    await load();
    onDecided();
  }

  const row = (p: Proposal) => (
    <div key={p.proposal_id} className="pa-prop">
      <div className="pa-prop__main">
        <strong>{p.lecturer_name}</strong>
        {p.instructor_id && <span className="instructor-card__tag">Kenshu Link講師</span>}
        <span className="pa-prop__meta">
          提案：{partnerName(p.partner_id)}　{dateText(p.created_at)}
        </span>
        {p.note && <div className="pa-prop__note">{p.note}</div>}
      </div>
      {p.status === "new" ? (
        <div className="pa-prop__actions">
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => answer(p, true)}>
            {severalInstructors ? "採用する" : "登壇講師に設定する"}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => answer(p, false)}>
            見送る
          </button>
        </div>
      ) : (
        <span className={`req-badge ${p.status === "accepted" ? "req-badge--accepted" : "req-badge--cancelled"}`}>{proposalStatusText(p.status)}</span>
      )}
    </div>
  );

  return (
    <div className="tool-block pa-props">
      <strong style={{ color: "var(--color-ink)" }}>協力会社からの提案</strong>
      <span style={{ color: "var(--color-ink-soft)" }}>
        {counts.new > 0 ? `（確認待ち ${counts.new}件）` : "（すべて回答済み）"}
      </span>
      {waiting.map(row)}
      {old.length > 0 && (
        <>
          <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 6 }} onClick={() => setShowOld((v) => !v)} aria-expanded={showOld}>
            {showOld ? "回答済みの提案を閉じる" : `回答済みの提案を見る（${old.length}件）`}
          </button>
          {showOld && old.map(row)}
        </>
      )}
    </div>
  );
}
