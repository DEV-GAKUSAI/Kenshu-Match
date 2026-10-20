"use client";

import { useState } from "react";

/** One closed-by-default section: a bar with a title (and a small note) that opens on click. */
export function ProfileSection({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "12px 14px",
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-s)",
          cursor: "pointer",
          font: "inherit",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--color-ink)",
          textAlign: "left",
        }}
      >
        <span>{title}</span>
        {meta ? <span style={{ color: "var(--color-ink-soft)", fontWeight: 600 }}>{meta}</span> : null}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ marginLeft: "auto", color: "var(--color-ink-soft)", transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div style={{ padding: "14px 4px 0" }}>{children}</div>}
    </div>
  );
}
