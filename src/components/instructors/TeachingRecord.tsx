"use client";

import { useEffect, useState } from "react";

import { getTeachingRecord, type TeachingEntry } from "@/lib/requester/partners";

/** 登壇実績 (#53): the lecturer's own completed 登壇, on the lecturer マイページ. Only the title and the date. */
export function TeachingRecord() {
  const [rows, setRows] = useState<TeachingEntry[] | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    (async () => {
      setRows(await getTeachingRecord());
    })();
  }, []);

  if (rows === null || rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, 5);

  return (
    <section className="pa-record" aria-label="登壇実績">
      <h2 className="section__title" style={{ fontSize: 18, margin: 0 }}>
        登壇実績（{rows.length}件）
      </h2>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-ink-soft)" }}>完了した案件のうち、あなたが登壇したものです。プロフィールには件数だけが表示されます。</p>
      <ul className="pa-record__list">
        {shown.map((r) => (
          <li key={r.request_id}>
            <span className="pa-record__date">{r.taught_on.replace(/-/g, "/")}</span>
            <span>{r.title}</span>
          </li>
        ))}
      </ul>
      {rows.length > 5 && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll((v) => !v)}>
          {all ? "閉じる" : `すべて表示（残り${rows.length - 5}件）`}
        </button>
      )}
    </section>
  );
}
