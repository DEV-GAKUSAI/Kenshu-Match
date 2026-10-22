/** 応募締切 (#45): a date (YYYY-MM-DD, Japan time). Applying is possible through the end of that day. */
export function todayJst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function deadlinePassed(deadline: string | null | undefined, now: Date = new Date()): boolean {
  if (!deadline) return false;
  return todayJst(now) > deadline;
}

/** 「10/30」 style text for tags. */
export function deadlineShort(deadline: string): string {
  const [, m, d] = deadline.split("-");
  return `${Number(m)}/${Number(d)}`;
}
