/** 「10月12日(月) 10:00〜10:30」 in the meeting's time zone (browser-safe). */
export function formatMeetingTimeClient(startIso: string, endIso: string, timeZone: string): string {
  const parts = (iso: string) => {
    const values = new Intl.DateTimeFormat("ja-JP", {
      timeZone,
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const get = (type: string) => values.find((part) => part.type === type)?.value ?? "";
    return { day: `${get("month")}月${get("day")}日(${get("weekday")})`, time: `${get("hour")}:${get("minute")}` };
  };
  const start = parts(startIso);
  const end = parts(endIso);
  return `${start.day} ${start.time}〜${end.time}`;
}
