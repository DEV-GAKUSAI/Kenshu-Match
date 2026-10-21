import { dayLine, normalizeDays } from "@/lib/requests/schedule";

/** Shows the day-by-day schedule and the required conditions of a request (only what was filled in). */
export function DetailsView({ r }: { r: { schedule_days?: unknown; all_days_required?: boolean | null; req_skills?: string | null; req_prep?: string | null } }) {
  const days = normalizeDays(r.schedule_days);
  const skills = (r.req_skills ?? "").trim();
  const prep = (r.req_prep ?? "").trim();
  if (!days.length && !skills && !prep) return null;
  return (
    <div className="request-card__response" style={{ margin: "0 0 14px", fontSize: 13 }}>
      {days.length > 0 && (
        <div style={{ marginBottom: skills || prep ? 8 : 0 }}>
          <strong>日程{r.all_days_required ? "（全日程の登壇が必要）" : ""}</strong>
          {days.map((d, i) => (
            <div key={i}>
              {i + 1}日目：{dayLine(d)}
            </div>
          ))}
        </div>
      )}
      {skills && (
        <div style={{ marginBottom: prep ? 8 : 0, whiteSpace: "pre-wrap" }}>
          <strong>必須スキル・経験</strong>
          {skills}
        </div>
      )}
      {prep && (
        <div style={{ whiteSpace: "pre-wrap" }}>
          <strong>事前に対応してほしいこと</strong>
          {prep}
        </div>
      )}
    </div>
  );
}
