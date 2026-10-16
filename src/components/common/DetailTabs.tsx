"use client";

import type { ReactNode } from "react";

export type DetailTab = { key: string; label: ReactNode };

/** Tabs whose selected tab opens a white card with a soft shadow (the card looks like it opened from the tab). */
export function DetailTabs({
  id,
  tabs,
  active,
  onChange,
  children,
}: {
  id?: string;
  tabs: DetailTab[];
  active: string;
  onChange: (key: string) => void;
  children: ReactNode;
}) {
  const border = "1px solid var(--color-border)";
  return (
    <div id={id} style={{ scrollMarginTop: 96 }}>
      <div role="tablist" style={{ display: "flex", gap: 6, overflowX: "auto", position: "relative", zIndex: 1 }}>
        {tabs.map((t) => {
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(t.key)}
              style={{
                padding: "12px 20px",
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 700,
                whiteSpace: "nowrap",
                cursor: "pointer",
                border,
                borderBottom: selected ? "1px solid #fff" : border,
                borderRadius: "12px 12px 0 0",
                marginBottom: -1,
                background: selected ? "#fff" : "color-mix(in srgb, var(--color-primary) 6%, #f3f6f5)",
                color: selected ? "var(--color-primary)" : "var(--color-ink-soft)",
                boxShadow: selected ? "0 -2px 8px rgba(0,0,0,0.04)" : "none",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        style={{
          background: "#fff",
          border,
          borderRadius: "0 12px 12px 12px",
          boxShadow: "0 6px 20px rgba(20, 60, 50, 0.08)",
          padding: "24px 24px 8px",
        }}
      >
        {children}
      </div>
    </div>
  );
}
