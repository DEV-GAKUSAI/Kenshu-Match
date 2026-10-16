"use client";

import { useState, type ReactNode } from "react";

/** A section that is closed until clicked: same heading look as the open sections, with a green arrow on the right. */
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
        className="detail-block__title"
        style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 10, marginBottom: open ? undefined : 0 }}
      >
        <span>{title}</span>
        <span
          aria-hidden
          style={{
            marginLeft: "auto",
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--color-primary)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
          }}
        >
          {open ? "▲" : "▼"}
        </span>
      </summary>
      {children}
    </details>
  );
}
