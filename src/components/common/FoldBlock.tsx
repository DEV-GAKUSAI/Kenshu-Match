"use client";

import { useState, type ReactNode } from "react";

/** A section that is closed until clicked (button-like header, green arrow on the right). */
export function FoldBlock({ id, title, children }: { id?: string; title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      id={id}
      className="detail-block"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      style={{ scrollMarginTop: 96 }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          marginBottom: open ? 14 : 0,
          border: "1px solid var(--color-primary)",
          borderRadius: 12,
          background: "color-mix(in srgb, var(--color-primary) 8%, #fff)",
          fontWeight: 700,
          fontSize: 15,
        }}
      >
        <span>{title}</span>
        <span
          aria-hidden
          style={{
            marginLeft: "auto",
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--color-primary)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
          }}
        >
          {open ? "▲" : "▼"}
        </span>
      </summary>
      {children}
    </details>
  );
}
