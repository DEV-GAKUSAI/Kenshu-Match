import Link from "next/link";
import type { InstructorPublicDirectoryRow, WorkStyle } from "@/types/database";
import { surveyScoreLabel } from "@/lib/survey/summary";

const WORK_STYLE_LABEL: Record<WorkStyle, string> = {
  ONLINE: "オンラインのみ",
  ONSITE: "対面のみ",
  HYBRID: "オンライン・対面 両方",
};

const DEFAULT_MAX_TAGS = 3;

function initial(name: string | null) {
  return (name || "?").trim().slice(0, 1);
}

interface InstructorCardProps {
  instructor: InstructorPublicDirectoryRow;
  maxTags?: number;
}

export function InstructorCard({ instructor: ins, maxTags = DEFAULT_MAX_TAGS }: InstructorCardProps) {
  const hasRate = ins.desired_rate_min != null;
  const allTags = [...(ins.expertise_fields || []), ...(ins.certifications || [])];
  const tags = allTags.slice(0, maxTags);
  const moreTags = allTags.length - tags.length;
  const occupation = (ins.occupation_names || []).join("、");
  const hasScore = !!ins.survey_count && ins.survey_avg != null;

  return (
    // The link and the card fill the grid cell, so every card in a row has the same height and the price row sits at the bottom.
    <Link href={`/instructor-detail?id=${ins.id}`} style={{ display: "block", height: "100%" }}>
      <article className="instructor-card" style={{ height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
        <div className="instructor-card__top" style={{ marginBottom: 12 }}>
          {ins.avatar_url ? (
            <img
              src={ins.avatar_url}
              alt={`${ins.name || "講師"}のプロフィール画像`}
              className="instructor-card__avatar"
              style={{ objectFit: "cover", objectPosition: "center 15%" }}
            />
          ) : (
            <span className="instructor-card__avatar">{initial(ins.name)}</span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="instructor-card__name">{ins.name || "（名前未設定）"}</div>
            <div className="instructor-card__area" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {(ins.prefectures || []).length ? ins.prefectures!.join("、") : "エリア未設定"}
            </div>
          </div>
          {hasScore && (
            <span className="instructor-card__rating" style={{ whiteSpace: "nowrap" }}>
              <span style={{ color: "#f2b84b" }}>★</span> {surveyScoreLabel(ins.survey_avg!, ins.survey_count!)}
            </span>
          )}
        </div>

        {occupation && (
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {occupation}
          </div>
        )}

        {ins.self_pr && (
          <p
            className="instructor-card__intro"
            style={{
              minHeight: 0,
              marginBottom: 12,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.6,
            }}
          >
            {ins.self_pr}
          </p>
        )}

        {tags.length > 0 && (
          <div className="instructor-card__tags" style={{ marginBottom: 14 }}>
            {tags.map((t) => (
              <span key={t} className="instructor-card__tag" style={{ maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t}
              </span>
            ))}
            {moreTags > 0 && <span className="instructor-card__tag">+{moreTags}</span>}
          </div>
        )}

        <div className="instructor-card__bottom" style={{ marginTop: "auto", paddingTop: 4 }}>
          <div className="instructor-card__rate">
            {hasRate ? (
              <>
                ¥{Number(ins.desired_rate_min).toLocaleString()}
                <span>／時間〜</span>
              </>
            ) : (
              "応相談"
            )}
          </div>
          <div className="instructor-card__format">{ins.work_style ? WORK_STYLE_LABEL[ins.work_style] : ""}</div>
        </div>
      </article>
    </Link>
  );
}
