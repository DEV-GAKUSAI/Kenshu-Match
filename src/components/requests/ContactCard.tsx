"use client";

import { ContactIllustration, CopySmallIcon, MailIcon, PhoneIcon, UserIcon } from "@/components/ui/Illustrations";
import { useToast } from "@/components/common/Toast";

/** The decided lecturer's contact details: one clear card with tap-to-mail / tap-to-call and a copy button. */
export function ContactCard({ name, roleLabel, email, phone, hint = "決定した講師への連絡先です。" }: { name: string; roleLabel?: string | null; email: string; phone: string; hint?: string }) {
  const { showToast } = useToast();
  const isValue = (v: string) => v.includes("@") || /\d/.test(v);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what}をコピーしました。`);
    } catch {
      showToast("コピーできませんでした。");
    }
  }

  const row = (icon: React.ReactNode, label: string, value: string, href: string | null) => (
    <div className="cc__row">
      <span className="cc__icon">{icon}</span>
      <span className="cc__label">{label}</span>
      <span className="cc__value">
        {href && isValue(value) ? (
          <a href={href}>{value}</a>
        ) : (
          <span className="cc__empty">{value}</span>
        )}
      </span>
      {isValue(value) && (
        <button type="button" className="cc__copy" aria-label={`${label}をコピー`} onClick={() => copy(value, label)}>
          <CopySmallIcon />
        </button>
      )}
    </div>
  );

  return (
    <div className="cc">
      <div className="cc__head">
        <ContactIllustration size={52} />
        <div>
          <div className="cc__name">
            <UserIcon size={14} /> {name}
          </div>
          {roleLabel && <div className="cc__role">{roleLabel}</div>}
          <div className="cc__hint">{hint}</div>
        </div>
      </div>
      {row(<MailIcon />, "メール", email, `mailto:${email}`)}
      {row(<PhoneIcon />, "電話番号", phone, `tel:${phone.replace(/[^\d+]/g, "")}`)}
    </div>
  );
}
