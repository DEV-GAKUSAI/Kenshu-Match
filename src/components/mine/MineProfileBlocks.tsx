"use client";

import type React from "react";

import { educationLine, qualificationLine, skillLine, totalExperienceLabel, workHistoryLine, type MinePublicProfile } from "@/lib/mine/public-profile";

/** The Mine items the instructor allowed. Each block shows only if Mine sent it. */
export function MineProfileBlocks({ mine, group }: { mine: MinePublicProfile | null; group: "profile" | "career" }) {
  if (!mine) return null;
  const list = (items: string[]) => (
    <ul className="detail-block__text" style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((item, i) => (
        <li key={`${item}-${i}`}>{item}</li>
      ))}
    </ul>
  );
  const blocks: { title: string; body: React.ReactNode; count?: number }[] = [];
  const CAREER = new Set(["スキル", "資格・免許", "職歴", "学歴"]);
  if (mine.self_introduction) blocks.push({ title: "自己紹介", body: <p className="detail-block__text" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{mine.self_introduction}</p> });
  if (mine.professional_summary) blocks.push({ title: "職務要約", body: <p className="detail-block__text" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{mine.professional_summary}</p> });
  if (mine.skills?.length) blocks.push({ title: "スキル", count: mine.skills.length, body: list(mine.skills.map(skillLine)) });
  if (mine.qualifications?.length) blocks.push({ title: "資格・免許", count: mine.qualifications.length, body: list(mine.qualifications.map(qualificationLine)) });
  if (mine.work_history?.length) {
    const total = totalExperienceLabel(mine.work_history);
    blocks.push({
      title: "職歴",
      count: mine.work_history.length,
      body: (
        <>
          {total && (
            <p className="detail-block__text" style={{ fontWeight: 600, marginBottom: 6 }}>
              実務経験 {total}
            </p>
          )}
          {list(mine.work_history.map(workHistoryLine))}
        </>
      ),
    });
  }
  if (mine.education?.length) blocks.push({ title: "学歴", count: mine.education.length, body: list(mine.education.map(educationLine)) });
  if (mine.languages) blocks.push({ title: "言語", body: <p className="detail-block__text">{mine.languages}</p> });
  if (mine.area) blocks.push({ title: "地域", body: <p className="detail-block__text">{mine.area}</p> });
  const shown = blocks.filter((block) => CAREER.has(block.title) === (group === "career"));
  return (
    <>
      {group === "profile" && mine.occupations?.length ? (
        <div className="detail-block">
          <h2 className="detail-block__title">職種</h2>
          <div className="instructor-card__tags">
            {mine.occupations.map((o, i) => (
              <span key={`${o.name}-${i}`} className="instructor-card__tag">
                {o.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {shown.map((block) => (
        <div className="detail-block" key={block.title}>
          <h2 className="detail-block__title">{block.title}</h2>
          {block.body}
        </div>
      ))}
    </>
  );
}
