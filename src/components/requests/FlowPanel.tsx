"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useToast } from "@/components/common/Toast";
import { getFlow, getPartners, saveFlow, PARTNER_KIND_TEXT, type Partner, type RequestFlow } from "@/lib/requester/partners";
import { Select } from "@/components/ui/Select";

/** 商流: who we order from / pay, who sits in between, and who actually teaches (#53). Private to the company. */
export function FlowPanel({
  requestId,
  requesterId,
  decidedName,
  severalInstructors = false,
}: {
  requestId: string;
  requesterId: string;
  decidedName?: string | null;
  /** The request has role slots: no single 登壇講師; every document belongs to the instructor decided for it. */
  severalInstructors?: boolean;
}) {
  const { showToast } = useToast();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [flow, setFlow] = useState<RequestFlow | null>(null);
  const [open, setOpen] = useState(false);
  const [contract, setContract] = useState("");
  const [via, setVia] = useState<string[]>([]);
  const [speakerPartner, setSpeakerPartner] = useState("");
  const [speakerName, setSpeakerName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [p, f] = await Promise.all([getPartners(), getFlow(requestId)]);
    setPartners(p);
    setFlow(f);
    setContract(f?.contract_partner_id ?? "");
    setVia(f?.via_partner_ids ?? []);
    setSpeakerPartner(f?.speaker_partner_id ?? "");
    setSpeakerName(f?.speaker_name ?? "");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  const nameOf = (id: string | null) => partners.find((p) => p.partner_id === id)?.name ?? null;
  const contractName = nameOf(flow?.contract_partner_id ?? null);
  const viaNames = (flow?.via_partner_ids ?? []).map((id) => nameOf(id)).filter(Boolean) as string[];
  const speaker = nameOf(flow?.speaker_partner_id ?? null) ?? (flow?.speaker_name || null);
  const hasFlow = !!(contractName || viaNames.length || (!severalInstructors && speaker));

  async function save() {
    setBusy(true);
    const { error } = await saveFlow(requesterId, {
      request_id: requestId,
      contract_partner_id: contract || null,
      via_partner_ids: via,
      speaker_partner_id: severalInstructors ? null : speakerPartner || null,
      speaker_name: severalInstructors || speakerPartner ? null : speakerName.trim() || null,
    });
    setBusy(false);
    if (error) return showToast("保存できませんでした。");
    showToast("商流を保存しました。");
    setOpen(false);
    await load();
  }

  function toggleVia(id: string) {
    setVia((v) => (v.includes(id) ? v.filter((x) => x !== id) : v.length >= 5 ? v : [...v, id]));
  }

  return (
    <div style={{ display: "contents" }}>
      {hasFlow && !open && (
        <div className="tool-block" style={{ color: "var(--color-ink-soft)", marginBottom: 6 }}>
          <strong style={{ color: "var(--color-ink)" }}>商流</strong>（講師には見えません）
          <div>発注・請求の相手：{contractName ?? `${decidedName || "決定した講師"}（直接）`}</div>
          {viaNames.length > 0 && <div>間に入る関係先：{viaNames.join(" → ")}</div>}
          {!severalInstructors && <div>実際の登壇講師：{speaker ?? `${decidedName || "決定した講師"}`}</div>}
        </div>
      )}
      {open ? (
        <div className="inline-quote-form is-open tool-block">
          <p style={{ margin: "0 0 8px", color: "var(--color-ink-soft)" }}>
            <strong style={{ color: "var(--color-ink)" }}>商流＝発注・支払いの流れ。</strong>間に別の会社が入るときに設定します。
          </p>
          <p style={{ margin: "0 0 8px", color: "var(--color-ink)", background: "#fff", border: "1px solid var(--color-border)", borderRadius: "var(--radius-s)", padding: "8px 10px" }}>
            注文書を発行する前に設定してください。発行後に変更しても、発行済みの注文書には反映されません。
          </p>
          <p style={{ margin: "0 0 8px", color: "var(--color-ink-soft)" }}>
            空のままなら「決定した講師と直接取引」になります。Kenshu Linkの講師と紐づけた講師を登壇講師にすると、研修アンケートの評価がその講師につきます（アンケートのリンクを作る前に設定してください）。関係先は
            <Link href="/my-partners"> 関係先の管理</Link>
            で登録できます。
          </p>
          <div className="form-field">
            <label>発注・請求の相手（契約先）</label>
            <Select value={contract} onChange={(e) => setContract(e.target.value)}>
              <option value="">決定した講師と直接</option>
              {partners.map((p) => (
                <option key={p.partner_id} value={p.partner_id}>
                  {p.name}（{PARTNER_KIND_TEXT[p.kind]}）
                </option>
              ))}
            </Select>
          </div>
          <div className="form-field">
            <label>間に入る関係先（順番に選択・5件まで）</label>
            {partners.length === 0 && <span style={{ color: "var(--color-ink-soft)" }}>関係先が未登録です。</span>}
            {partners.map((p) => (
              <label key={p.partner_id} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                <input type="checkbox" checked={via.includes(p.partner_id)} onChange={() => toggleVia(p.partner_id)} />
                {p.name}（{PARTNER_KIND_TEXT[p.kind]}）
                {via.includes(p.partner_id) ? `（${via.indexOf(p.partner_id) + 1}番目）` : ""}
              </label>
            ))}
          </div>
          {severalInstructors ? (
            <p style={{ margin: "0 0 8px", color: "var(--color-ink-soft)" }}>
              複数名の依頼では、注文書・請求書・アンケートの評価は、それぞれ決定した講師に付きます（登壇講師の指定はありません）。
            </p>
          ) : (
          <div className="form-field">
            <label>実際の登壇講師</label>
            <Select value={speakerPartner} onChange={(e) => setSpeakerPartner(e.target.value)}>
              <option value="">決定した講師／下に入力</option>
              {partners
                .filter((p) => p.kind === "instructor")
                .map((p) => (
                  <option key={p.partner_id} value={p.partner_id}>
                    {p.name}
                  </option>
                ))}
            </Select>
            {!speakerPartner && <input type="text" maxLength={100} placeholder="登録にない講師の名前（任意）" value={speakerName} onChange={(e) => setSpeakerName(e.target.value)} style={{ marginTop: 6 }} />}
          </div>
          )}
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
          {hasFlow ? "商流を編集" : "商流を設定"}
        </button>
      )}
    </div>
  );
}
