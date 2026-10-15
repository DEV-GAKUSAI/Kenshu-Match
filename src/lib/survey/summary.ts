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

/** 「研修評価 3.6（12件）」: the scale (out of 4) is explained on the detail page. */
export function surveyScoreLabel(avg: number, count: number): string {
  return `研修評価 ${Number(avg).toFixed(1)}（${count}件）`;
}
