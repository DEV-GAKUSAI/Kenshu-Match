// 日ごとの日程・場所・実施形態 (#43, #58). One list entry per day.
import { isPrefecture, prefectureShort } from "./prefectures.ts";

export type DayFormat = "online" | "offline" | "undecided";

export type ScheduleDay = {
  date: string; // YYYY-MM-DD, "" = 未定
  start: string; // HH:MM, "" = 未定
  end: string;
  format: DayFormat;
  place: string;
  content: string;
  /** 都道府県 (#58): one of the 47, "" = 未設定. Used for the area search. */
  prefecture?: string;
  /** 会場調整中 (#58): the venue (not the date) is not fixed yet. Missing = 確定. */
  venueTentative?: boolean;
  /** 休憩 (#43): optional, HH:MM. Both or none. */
  breakStart?: string;
  breakEnd?: string;
  /** 調整中 (#43): this day's date/time is not fixed yet. Missing = 確定. */
  tentative?: boolean;
};

export const EMPTY_DAY: ScheduleDay = { date: "", start: "", end: "", format: "undecided", place: "", content: "", prefecture: "", venueTentative: false, breakStart: "", breakEnd: "", tentative: false };

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
      prefecture: isPrefecture(d.prefecture) ? d.prefecture : "",
      venueTentative: d.venueTentative === true,
      breakStart: str(d.breakStart, 5),
      breakEnd: str(d.breakEnd, 5),
      tentative: d.tentative === true,
    };
  });
}

/** Drop rows the company left completely empty. */
export function cleanDays(days: ScheduleDay[]): ScheduleDay[] {
  return normalizeDays(days).filter(
    (d) => d.date || d.start || d.end || d.place.trim() || d.content.trim() || d.prefecture || d.venueTentative || d.format !== "undecided" || d.breakStart || d.breakEnd || d.tentative,
  );
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * First problem in the day list, or null (#43). The end must be after the start, and a break needs both
 * times, inside the start–end range. Times are HH:MM, so comparing the text is enough.
 */
export function validateDays(days: ScheduleDay[]): string | null {
  const list = normalizeDays(days);
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const label = `${i + 1}日目`;
    for (const t of [d.start, d.end, d.breakStart ?? "", d.breakEnd ?? ""]) {
      if (t && !TIME.test(t)) return `${label}：時刻の形式が正しくありません。`;
    }
    if (d.start && d.end && d.end <= d.start) return `${label}：終了時刻は開始時刻より後にしてください。`;
    const bs = d.breakStart ?? "";
    const be = d.breakEnd ?? "";
    if ((bs && !be) || (!bs && be)) return `${label}：休憩は開始と終了の両方を入力してください。`;
    if (bs && be) {
      if (be <= bs) return `${label}：休憩の終了時刻は開始時刻より後にしてください。`;
      if ((d.start && bs < d.start) || (d.end && be > d.end)) return `${label}：休憩は開始〜終了の時間内にしてください。`;
    }
  }
  return null;
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
  const place = d.place.trim();
  let where: string;
  if (d.format === "offline") {
    where = ["対面", d.prefecture, place].filter(Boolean).join("・");
  } else if (d.format === "online") {
    where = place ? `オンライン（${place}）` : FORMAT_TEXT.online;
  } else {
    where = [FORMAT_TEXT.undecided, d.prefecture, place].filter(Boolean).join("・");
  }
  const venueState = d.venueTentative && d.format !== "online" ? "会場調整中" : "";
  const rest = d.breakStart && d.breakEnd ? `休憩 ${d.breakStart}〜${d.breakEnd}` : "";
  const state = d.tentative ? "日程調整中" : "";
  return [`${date} ${time}`, rest, where, venueState, d.content.trim(), state].filter(Boolean).join(" ／ ");
}

const FORMAT_TAG: Record<string, string> = { online: "オンライン", offline: "対面", both: "オンライン・対面" };

/** The format tag text. If the days mix online and on-site, say so even when the request's own setting is one of them. */
export function requestFormatLabel(r: { preferred_format: string; schedule_days?: unknown }): string {
  const formats = new Set(normalizeDays(r.schedule_days).map((d) => d.format));
  if (formats.has("online") && formats.has("offline")) return "オンライン・対面 両方";
  return FORMAT_TAG[r.preferred_format] || r.preferred_format;
}

/**
 * Warning for a request that needs all days (#43): applicants who can only do some days, or who did not
 * answer at all, so the company does not overlook them. Returns null when there is nothing to warn about.
 * "none" (日程は要相談) is counted with 一部のみ because it is not a clear yes either.
 */
export function allDaysWarning(required: boolean, answers: (string | null | undefined)[]): string | null {
  if (!required || answers.length === 0) return null;
  const partial = answers.filter((a) => a === "partial" || a === "none").length;
  const unanswered = answers.filter((a) => !a).length;
  const parts = [partial > 0 ? `一部の日程のみ ${partial}名` : null, unanswered > 0 ? `全日程の可否が未回答 ${unanswered}名` : null].filter(Boolean);
  return parts.length > 0 ? `全日程必須：${parts.join("・")}` : null;
}

/** The prefectures named in the days (no repeats, in the order given). */
export function dayPrefectures(days: unknown): string[] {
  return [...new Set(normalizeDays(days).map((d) => d.prefecture ?? "").filter(Boolean))];
}

/**
 * Area search (#58): does the request take place in this prefecture? A day's prefecture decides. Older requests
 * (and days without a prefecture) are matched by the free-text location / place, e.g. 「東京本社」 for 東京都.
 */
export function matchesPrefecture(r: { schedule_days?: unknown; location?: string | null }, prefecture: string): boolean {
  if (!prefecture) return true;
  const days = normalizeDays(r.schedule_days);
  if (days.some((d) => d.prefecture === prefecture)) return true;
  const short = prefectureShort(prefecture);
  const texts = [r.location ?? "", ...days.filter((d) => !d.prefecture).map((d) => d.place)];
  // 「京都」 is inside 「東京都」: do not let a 京都府 search find Tokyo text.
  const found = (t: string, name: string) => (name === "京都" ? /(?<!東)京都/.test(t) : t.includes(name));
  return texts.some((t) => found(t, prefecture) || found(t, short));
}
