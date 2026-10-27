// Small pictures for the partner company screens (#53). Plain SVG, no image files.

/** 依頼元の企業 → 協力会社（あなた）→ 登壇講師 */
export function PartnerFlowArt({ meLabel = "あなた（協力会社）" }: { meLabel?: string }) {
  return (
    <svg className="pa-art" viewBox="0 0 560 120" role="img" aria-label={`依頼元の企業から、${meLabel}を通って、登壇講師へつながる図`}>
      <defs>
        <marker id="pa-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9" fill="none" stroke="#7fcfb6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      <line x1="156" y1="60" x2="198" y2="60" stroke="#7fcfb6" strokeWidth="2" markerEnd="url(#pa-arrow)" />
      <line x1="362" y1="60" x2="404" y2="60" stroke="#7fcfb6" strokeWidth="2" markerEnd="url(#pa-arrow)" />
      <g>
        <rect x="8" y="26" width="148" height="68" rx="14" className="pa-box" />
        <path d="M60 52h44v26H60z M68 52v-6h28v6" fill="none" stroke="#5aa58f" strokeWidth="2" strokeLinejoin="round" />
        <text x="82" y="106" textAnchor="middle" className="pa-text">依頼元の企業</text>
      </g>
      <g>
        <rect x="206" y="14" width="148" height="92" rx="14" className="pa-me" />
        <circle cx="280" cy="46" r="11" fill="none" stroke="#1fb38e" strokeWidth="2" />
        <path d="M258 82c2-12 10-18 22-18s20 6 22 18" fill="none" stroke="#1fb38e" strokeWidth="2" strokeLinecap="round" />
        <text x="280" y="100" textAnchor="middle" className="pa-text pa-text--me">{meLabel}</text>
      </g>
      <g>
        <rect x="404" y="26" width="148" height="68" rx="14" className="pa-box" />
        <path d="M478 46l16 7-16 7-16-7z M470 60v8c0 3 16 3 16 0v-8" fill="none" stroke="#5aa58f" strokeWidth="2" strokeLinejoin="round" />
        <text x="478" y="106" textAnchor="middle" className="pa-text">登壇講師</text>
      </g>
    </svg>
  );
}

const STEPS = [
  { n: "1", title: "コードを受け取る", text: "依頼元の企業が、招待コードを発行します。" },
  { n: "2", title: "コードを入力する", text: "このタブに入力すると、連携が完了します。" },
  { n: "3", title: "案件を確認する", text: "共有された案件の確認と、講師の提案ができます。" },
];

/** The three steps to connect. */
export function InviteSteps() {
  return (
    <ol className="pa-steps">
      {STEPS.map((s) => (
        <li key={s.n} className="pa-step">
          <span className="pa-step__n" aria-hidden="true">
            {s.n}
          </span>
          <span className="pa-step__body">
            <strong>{s.title}</strong>
            <span>{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
