"use client";

import type { ReactNode } from "react";

export type DetailTab = { key: string; label: ReactNode; content: ReactNode };

/**
 * Tabs whose selected tab opens a white card with a soft shadow (the card looks like it opened from the tab).
 * Every panel stays mounted, so the data of each tab is already loaded when the page opens; the others are only hidden.
 */
export function DetailTabs({
  id,
  tabs,
  active,
  onChange,
}: {
  id?: string;
  tabs: DetailTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  const border = "1px solid var(--color-border)";
  const firstSelected = tabs[0]?.key === active;
  return (
    <div id={id} style={{ scrollMarginTop: 96 }}>
      <style>{`
        @keyframes detailTabIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .detail-tabs__list { scrollbar-width: none; }
        .detail-tabs__list::-webkit-scrollbar { display: none; }
        .detail-tabs__tab { transition: background-color .2s ease, color .2s ease; }
        .detail-tabs__tab:not([aria-selected="true"]):hover { background: color-mix(in srgb, var(--color-primary) 14%, #f3f6f5) !important; }
      `}</style>
      <div
        role="tablist"
        className="detail-tabs__list"
        style={{ display: "flex", alignItems: "flex-end", gap: 0, overflowX: "auto", overflowY: "hidden", position: "relative", zIndex: 1, marginBottom: -1 }}
      >
        {tabs.map((t, index) => {
          const selected = t.key === active;
          // Tabs touch each other: only the outer corners of the row and the selected tab are rounded.
          const radius = selected ? "12px 12px 0 0" : `${index === 0 ? 12 : 0}px ${index === tabs.length - 1 ? 12 : 0}px 0 0`;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={selected}
              className="detail-tabs__tab"
              onClick={() => onChange(t.key)}
              style={{
                padding: "12px 20px",
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 700,
                whiteSpace: "nowrap",
                cursor: "pointer",
                border: 0,
                borderRadius: radius,
                marginBottom: selected ? 0 : 1,
                background: selected ? "#fff" : "color-mix(in srgb, var(--color-primary) 8%, #f3f6f5)",
                color: selected ? "var(--color-primary)" : "var(--color-ink-soft)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        style={{
          background: "#fff",
          border,
          borderRadius: firstSelected ? "0 12px 12px 12px" : "12px",
          boxShadow: "0 6px 20px rgba(20, 60, 50, 0.08)",
          padding: "24px 24px 8px",
          transition: "border-radius .2s ease",
        }}
      >
        {tabs.map((t) => (
          <div
            key={t.key}
            role="tabpanel"
            hidden={t.key !== active}
            style={t.key === active ? { animation: "detailTabIn .25s ease" } : undefined}
          >
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
