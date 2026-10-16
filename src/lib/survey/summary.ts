/** The 研修アンケート average shown next to an instructor (pure helpers, no database access). */

export type SurveySummaryItem = { avg: number; count: number };
export type SurveySummaryMap = Record<string, SurveySummaryItem>;

/** Adds survey_avg / survey_count to rows that have survey answers. Others are left alone. */
export function applySurveySummary<T extends { id: string }>(
  rows: T[],
  map: SurveySummaryMap,
): (T & { survey_avg?: number | null; survey_count?: number | null })[] {
  return rows.map((row) => {
    const item = map[row.id];
    return item && item.count > 0 ? { ...row, survey_avg: item.avg, survey_count: item.count } : row;
  });
}

/** 「3.5 / 4（6件）」: shown after a gold star. The scale (out of 4) is explained on the detail page. */
export function surveyScoreLabel(avg: number, count: number): string {
  return `${Number(avg).toFixed(1)} / 4（${count}件）`;
}

/** Highest survey average first (more answers win a tie); instructors without answers go last, in their original order. */
export function sortBySurveyAvg<T extends { survey_avg?: number | null; survey_count?: number | null }>(rows: T[]): T[] {
  const rated = (r: T) => !!r.survey_count && r.survey_avg != null;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ra = rated(a.row);
      const rb = rated(b.row);
      if (ra !== rb) return ra ? -1 : 1;
      if (ra && rb) {
        const diff = Number(b.row.survey_avg) - Number(a.row.survey_avg);
        if (diff !== 0) return diff;
        const countDiff = Number(b.row.survey_count) - Number(a.row.survey_count);
        if (countDiff !== 0) return countDiff;
      }
      return a.index - b.index;
    })
    .map((x) => x.row);
}
