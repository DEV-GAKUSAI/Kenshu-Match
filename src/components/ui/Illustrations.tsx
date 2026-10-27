// Small inline pictures for empty states and tabs (no image files; they follow the brand green).

const G = "#17B08A";
const G_SOFT = "#E3F7F0";
const G_MID = "#5FD0AA";
const INK = "#1d3a33";

/** A paper with lines and a stamp: orders / invoices. */
export function DocIllustration({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill={G_SOFT} />
      <rect x="18" y="10" width="28" height="38" rx="4" fill="#fff" stroke={G} strokeWidth="2" />
      <path d="M24 20h16M24 26h16M24 32h9" stroke={G_MID} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="42" cy="44" r="9" fill={G} />
      <path d="M38 44l3 3 5-6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** An envelope and a speech bubble: contact details. */
export function ContactIllustration({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill={G_SOFT} />
      <rect x="12" y="20" width="32" height="24" rx="4" fill="#fff" stroke={G} strokeWidth="2" />
      <path d="M14 23l14 11 14-11" stroke={G} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 38h12a3 3 0 013 3v6a3 3 0 01-3 3h-3l-4 4v-4h-5a3 3 0 01-3-3v-6a3 3 0 013-3z" fill={G} />
      <circle cx="42" cy="44" r="1.3" fill="#fff" />
      <circle cx="46" cy="44" r="1.3" fill="#fff" />
      <circle cx="50" cy="44" r="1.3" fill="#fff" />
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function DocIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}

export function MailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

export function PhoneIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z" />
    </svg>
  );
}

export function UserIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </svg>
  );
}

export function CopySmallIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 012-2h9" />
    </svg>
  );
}

export function SendIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </svg>
  );
}

export function StarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5z" />
    </svg>
  );
}

export function YenIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 7l3 5 3-5M8.5 12.5h7M8.5 15.5h7M12 12v6" />
    </svg>
  );
}

/** An empty tray with a small sparkle: nothing here yet. */
export function EmptyIllustration({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill={G_SOFT} />
      <path d="M14 34l6-14a3 3 0 012.8-2h18.4a3 3 0 012.8 2l6 14" stroke={G} strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 34h10a8 8 0 0016 0h10v10a4 4 0 01-4 4H18a4 4 0 01-4-4z" fill="#fff" stroke={G} strokeWidth="2" strokeLinejoin="round" />
      <path d="M46 12v6M43 15h6" stroke={G_MID} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="18" cy="14" r="2" fill={G_MID} />
    </svg>
  );
}

export const ILLUSTRATION_INK = INK;
