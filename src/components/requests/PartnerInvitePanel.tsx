"use client";

import { useCallback, useEffect, useState } from "react";

import { useConfirm } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import { createPartnerInvite, getPartnerInvite, unlinkPartner, type Invite, type Partner } from "@/lib/requester/partners";
import { formatInviteCode, inviteLeftText, partnerErrorText } from "@/lib/requests/partner-flow";

/**
 * 協力会社のアカウント連携 (#53). On a partner company's card in 関係先の管理:
 * shows whether the partner is connected, and makes the one-time invitation code.
 */
export function PartnerInvitePanel({ partner, onChanged }: { partner: Partner; onChanged: () => void }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const linked = !!partner.account_id;

  const load = useCallback(async () => {
    if (linked) return;
    setInvite(await getPartnerInvite(partner.partner_id));
  }, [linked, partner.partner_id]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function issue() {
    setBusy(true);
    const { invite: created, error } = await createPartnerInvite(partner.partner_id);
    setBusy(false);
    if (error || !created) return showToast(partnerErrorText(error));
    setInvite(created);
  }

  async function copy() {
    if (!invite) return;
    const text = `Kenshu Linkの招待コード：${formatInviteCode(invite.code)}（${inviteLeftText(invite.expires_at)}・1回だけ使えます）\nKenshu Linkに協力会社のアカウントでログインし、マイページの「関係先の案件」タブでコードを入力してください。`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("案内文をコピーしました。");
    } catch {
      showToast("コピーできませんでした。コードを手で控えてください。");
    }
  }

  async function unlink() {
    const ok = await confirm({
      title: "連携を解除しますか？",
      message: `「${partner.name}」は、この会社の案件を見られなくなります。出した提案の記録は残ります。もう一度連携するには、新しい招待コードを渡してください。`,
      confirmLabel: "解除する",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await unlinkPartner(partner.partner_id);
    setBusy(false);
    if (error) return showToast(partnerErrorText(error));
    showToast("連携を解除しました。");
    onChanged();
  }

  if (linked) {
    return (
      <div className="pa-link pa-link--on">
        <span className="pa-link__state">✓ アカウント連携済み</span>
        <span className="pa-link__text">契約先・間に入る関係先になっている案件を、この会社が自分のマイページで確認できます。</span>
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={unlink}>
          連携を解除
        </button>
      </div>
    );
  }

  return (
    <div className="pa-link">
      <span className="pa-link__state pa-link__state--off">未連携</span>
      <span className="pa-link__text">招待コードを相手に渡すと、相手が自分のアカウントで案件を確認し、講師を提案できます。</span>
      {invite && (
        <div className="pa-code" aria-live="polite">
          <span className="pa-code__value">{formatInviteCode(invite.code)}</span>
          <span className="pa-code__meta">{inviteLeftText(invite.expires_at)}・1回だけ使えます</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={copy}>
            案内文をコピー
          </button>
        </div>
      )}
      <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={issue}>
        {invite ? "新しいコードを発行" : "招待コードを発行"}
      </button>
    </div>
  );
}
