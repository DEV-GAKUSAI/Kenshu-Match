/**
 * The public profile a Mine user lets Kenshu Link show (Mine migration 133,
 * public.mine_public_profile_for_kenshu). Mine decides what is in it: the
 * user's own switches. Kenshu Link only displays it and never stores a copy.
 * No contact details or full name are ever in this object; company names appear only inside 職歴, which the user can switch off.
 */
export type MinePublicProfile = {
  initials?: string;
  occupations?: { category?: string; name: string }[];
  skills?: { category?: string; name: string; level?: number; level_label?: string; years?: number }[];
  qualifications?: { name: string; organization?: string; level?: string; obtained_date?: string }[];
  professional_summary?: string;
  work_history?: { company_name?: string; position?: string; employment_type?: string; start_date?: string; end_date?: string; is_current?: boolean }[];
  education?: { school_name: string; degree?: string; start_date?: string; end_date?: string }[];
  languages?: string;
  area?: string;
  self_introduction?: string;
  avatar_path?: string;
  /** 希望条件 (研修) from Mine: rate in yen per hour, ONLINE / ONSITE / HYBRID, prefectures. */
  training_conditions?: {
    hourly_rate_min?: number;
    work_style?: string;
    prefectures?: string[];
    /** 稼働条件 (#56): yyyy-mm-dd, languages, MAIN / SUB. */
    available_from?: string;
    available_until?: string;
    training_languages?: string[];
    roles?: string[];
  };
};

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: "正社員",
  CONTRACT: "契約社員",
  DISPATCH: "派遣社員",
  OUTSOURCE: "業務委託",
  FREELANCE: "フリーランス",
  PART_TIME: "アルバイト・パート",
  INTERN: "インターン",
  SHOKUTAKU: "嘱託社員",
  OTHER: "その他",
};

/** "2024-04-01" -> "2024年4月". */
export function formatYearMonth(value: string | null | undefined): string {
  if (!value) return "";
  const [year, month] = value.slice(0, 7).split("-");
  if (!year || !month) return "";
  return `${year}年${Number(month)}月`;
}

export function skillLine(skill: NonNullable<MinePublicProfile["skills"]>[number]): string {
  const parts: string[] = [skill.name];
  if (skill.level_label) parts.push(`レベル${skill.level}｜${skill.level_label}`);
  if (skill.years !== undefined && skill.years !== null) parts.push(`${skill.years}年`);
  return parts.join("・");
}

export function qualificationLine(q: NonNullable<MinePublicProfile["qualifications"]>[number]): string {
  return [q.name, q.organization, q.obtained_date ? `${formatYearMonth(q.obtained_date)}取得` : ""].filter(Boolean).join("・");
}

export function workHistoryLine(work: NonNullable<MinePublicProfile["work_history"]>[number]): string {
  const period = [work.start_date ? formatYearMonth(work.start_date) : "", work.is_current ? "現在" : work.end_date ? formatYearMonth(work.end_date) : ""]
    .filter(Boolean)
    .join(" 〜 ");
  const kind = work.employment_type ? EMPLOYMENT_LABEL[work.employment_type] ?? "" : "";
  return [work.company_name, work.position, kind, period].filter(Boolean).join("・") || "（内容未入力）";
}

export function educationLine(e: NonNullable<MinePublicProfile["education"]>[number]): string {
  return [e.school_name, e.degree].filter(Boolean).join("・");
}

/**
 * Initials used only as a fallback when the Mine profile is off: the first
 * letter of each space-separated part, each followed by a dot ("Alamgir
 * Hossain" -> "A.H."). Same rule as Mine's private.mine_name_initials.
 */
export function initialsFromName(name: string | null | undefined): string {
  const parts = (name ?? "").split(/[\s　]+/).filter(Boolean);
  return parts.map((part) => `${Array.from(part)[0]}.`).join("");
}

/**
 * "実務経験 約1年7ヶ月": the months covered by the 職歴 entries, counted once
 * even when entries overlap. An entry counts from its start month to its end
 * month (both included); a current entry, or one with no end, runs to `now`.
 * Entries with no start date are skipped. Returns "" when nothing can be counted.
 */
export function totalExperienceLabel(work: NonNullable<MinePublicProfile["work_history"]> | undefined, now: Date = new Date()): string {
  const months = new Set<number>();
  const monthIndex = (value: string) => {
    const [year, month] = value.slice(0, 7).split("-").map(Number);
    return Number.isFinite(year) && Number.isFinite(month) ? year * 12 + (month - 1) : null;
  };
  const nowIndex = now.getFullYear() * 12 + now.getMonth();
  for (const entry of work ?? []) {
    if (!entry.start_date) continue;
    const start = monthIndex(entry.start_date);
    if (start === null) continue;
    const end = entry.is_current || !entry.end_date ? nowIndex : (monthIndex(entry.end_date) ?? nowIndex);
    for (let m = start; m <= Math.min(end, nowIndex); m += 1) months.add(m);
  }
  const total = months.size;
  if (!total) return "";
  const years = Math.floor(total / 12);
  const rest = total % 12;
  if (!years) return `約${rest}ヶ月`;
  return rest ? `約${years}年${rest}ヶ月` : `約${years}年`;
}
