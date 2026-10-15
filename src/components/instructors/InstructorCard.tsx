import Link from "next/link";
import type { InstructorPublicDirectoryRow, WorkStyle } from "@/types/database";
import { surveyScoreLabel } from "@/lib/survey/summary";

const WORK_STYLE_LABEL: Record<WorkStyle, string> = {
  ONLINE: "オンラインのみ",
  ONSITE: "対面のみ",
  HYBRID: "オンライン・対面 両方",
};

function initial(name: string | null) {
  return (name || "?").trim().slice(0, 1);
}

interface InstructorCardProps {
  instructor: InstructorPublicDirectoryRow;
  maxTags?: number;
}

export function InstructorCard({ instructor: ins, maxTags }: InstructorCardProps) {
  const rate = ins.desired_rate_min != null ? `¥${Number(ins.desired_rate_min).toLocaleString()}` : "応相談";
  const rating = ins.rating_avg != null ? Number(ins.rating_avg).toFixed(1) : "-";
  const fields = maxTags ? (ins.expertise_fields || []).slice(0, maxTags) : ins.expertise_fields || [];

  return (
    <Link href={`/instructor-detail?id=${ins.id}`} style={{ display: "block" }}>
      <article className="instructor-card">
        <div className="instructor-card__top">
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
          <div>
            <div className="instructor-card__name">{ins.name || "（名前未設定）"}</div>
            <div className="instructor-card__area">
              {(ins.prefectures || []).length ? ins.prefectures!.join("、") : "エリア未設定"}
            </div>
          </div>
          <span className="instructor-card__rating">
            {ins.survey_count && ins.survey_avg != null ? (
              surveyScoreLabel(ins.survey_avg, ins.survey_count)
            ) : (
              <>
                ★ {rating}
                {ins.review_count ? ` (${ins.review_count})` : ""}
              </>
            )}
          </span>
        </div>
        <p className="instructor-card__intro">{ins.self_pr || "自己紹介は未登録です。"}</p>
        <div className="instructor-card__tags">
          {fields.map((f) => (
            <span key={f} className="instructor-card__tag">
              {f}
            </span>
          ))}
          {(ins.certifications || []).map((c) => (
            <span key={c} className="instructor-card__tag">
              {c}
            </span>
          ))}
        </div>
        <div className="instructor-card__bottom">
          <div className="instructor-card__rate">
            {rate}
            <span>／時間〜</span>
          </div>
          <div className="instructor-card__format">{ins.work_style ? WORK_STYLE_LABEL[ins.work_style] : ""}</div>
        </div>
      </article>
    </Link>
  );
}
