"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ContactCard } from "@/components/requests/ContactCard";
import { InvoicePanel } from "@/components/requests/InvoicePanel";
import { OrderPanel } from "@/components/requests/OrderPanel";
import { getDocStates } from "@/lib/requests/docs-status";
import { docFlowIndex, type DocState } from "@/lib/requests/docs-wait";
import { CheckCircleIcon, DocIcon, DocIllustration, MailIcon, SendIcon, YenIcon } from "@/components/ui/Illustrations";

type TabKey = "docs" | "contact";

/**
 * What belongs to ONE decided lecturer, in two tabs: 注文書・請求書 and 連絡先.
 * Used inside the lecturer's own row (several lecturers) and on its own (one lecturer).
 */
export function DecidedTabs({
  responseId,
  showDocs,
  showContact,
  showInvoice = true,
  requestOpen,
  role = "requester",
  contact,
}: {
  responseId: string;
  showDocs: boolean;
  showContact: boolean;
  /** The invoice box (the lecturer can only submit after the training has been agreed). */
  showInvoice?: boolean;
  requestOpen?: boolean;
  /** Whose screen this is. */
  role?: "requester" | "instructor";
  contact: { name: string; roleLabel?: string | null; email: string; phone: string; hint?: string };
}) {
  const tabs: { key: TabKey; label: string; icon: ReactNode }[] = [];
  if (showDocs) tabs.push({ key: "docs", label: "注文書・請求書", icon: <DocIcon /> });
  if (showContact) tabs.push({ key: "contact", label: "連絡先", icon: <MailIcon /> });
  const [tab, setTab] = useState<TabKey | null>(null);
  // Where the order / invoice are now (the flow strip lights the current step).
  const [doc, setDoc] = useState<DocState | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      getDocStates([responseId])
        .then((m) => alive && setDoc(m[responseId] ?? {}))
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener("kl-order-changed", refresh);
    window.addEventListener("kl-doc-changed", refresh);
    return () => {
      alive = false;
      window.removeEventListener("kl-order-changed", refresh);
      window.removeEventListener("kl-doc-changed", refresh);
    };
  }, [responseId]);
  const flowNow = doc ? docFlowIndex(doc) : -1;
  const stepClass = (i: number) => (flowNow < 0 ? "" : i < flowNow ? " is-done" : i === flowNow ? (doc?.order?.status === "declined" ? " is-warn" : " is-now") : "");
  if (!tabs.length) return null;
  const active = tab && tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <div className="dt">
      <div className="dt__tabs" role="tablist" aria-label="書類と連絡先">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={`dt__tab${active === t.key ? " is-on" : ""}`} onClick={() => setTab(t.key)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div className="dt__panel" role="tabpanel">
        {active === "docs" && (
          <>
            <div className="dt__flow">
              <DocIllustration size={46} />
              <ol className="dt__steps" aria-label="書類の流れ">
                <li className={`dt__step${stepClass(0)}`}>
                  <SendIcon size={14} />
                  <span>1. 注文書を発行</span>
                </li>
                <li className={`dt__step${stepClass(1)}`}>
                  <CheckCircleIcon size={14} />
                  <span>2. 講師が確認</span>
                </li>
                <li className={`dt__step${stepClass(2)}`}>
                  <YenIcon size={14} />
                  <span>3. 研修後に請求書</span>
                </li>
              </ol>
            </div>
            <OrderPanel responseId={responseId} role={role} requestOpen={requestOpen} />
            {showInvoice && <InvoicePanel responseId={responseId} role={role} />}
          </>
        )}
        {active === "contact" && <ContactCard name={contact.name} roleLabel={contact.roleLabel} email={contact.email} phone={contact.phone} hint={contact.hint} />}
      </div>
    </div>
  );
}
