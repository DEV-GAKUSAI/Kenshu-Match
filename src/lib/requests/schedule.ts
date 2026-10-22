// 日ごとの日程・場所・実施形態 (#43, #58). One list entry per day.

export type DayFormat = "online" | "offline" | "undecided";

export type ScheduleDay = {
  date: string; // YYYY-MM-DD, "" = 未定
  start: string; // HH:MM, "" = 未定
  end: string;
  format: DayFormat;
  place: string;
  content: string;
};

export const EMPTY_DAY: ScheduleDay = { date: "", start: "", end: "", format: "undecided", place: "", content: "" };

export const MAX_DAYS = 31;

export function normalizeDays(value: unknown): ScheduleDay[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_DAYS).map((raw) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
    const format = d.format === "online" || d.format === "offline" ? d.format : "undecided";
    return {
      date: str(d.date, 10),
      start: str(d.start, 5),
      end: str(d.end, 5),
      format,
      place: str(d.place, 120),
      content: str(d.content, 300),
    };
  });
}

/** Drop rows the company left completely empty. */
export function cleanDays(days: ScheduleDay[]): ScheduleDay[] {
  return normalizeDays(days).filter((d) => d.date || d.start || d.end || d.place.trim() || d.content.trim() || d.format !== "undecided");
}

const FORMAT_TEXT: Record<DayFormat, string> = { online: "オンライン", offline: "対面", undecided: "形態未定" };

/** 「10/21（水） 10:00〜17:00 ／ 対面・東京本社 ／ 内容」 */
export function dayLine(d: ScheduleDay): string {
  let date = "日付未定";
  if (d.date) {
    const t = new Date(`${d.date}T00:00:00+09:00`);
    date = Number.isNaN(t.getTime()) ? d.date : t.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" });
  }
  const time = d.start || d.end ? `${d.start || "?"}〜${d.end || "?"}` : "時間未定";
  const where = d.format === "offline" && d.place.trim() ? `対面・${d.place.trim()}` : d.format === "online" && d.place.trim() ? `オンライン（${d.place.trim()}）` : FORMAT_TEXT[d.format];
  return [`${date} ${time}`, where, d.content.trim()].filter(Boolean).join(" ／ ");
}

const FORMAT_TAG: Record<string, string> = { online: "オンライン", offline: "対面", both: "オンライン・対面" };

/** The format tag text. If the days mix online and on-site, say so even when the request's own setting is one of them. */
export function requestFormatLabel(r: { preferred_format: string; schedule_days?: unknown }): string {
  const formats = new Set(normalizeDays(r.schedule_days).map((d) => d.format));
  if (formats.has("online") && formats.has("offline")) return "オンライン・対面 両方";
  return FORMAT_TAG[r.preferred_format] || r.preferred_format;
}
