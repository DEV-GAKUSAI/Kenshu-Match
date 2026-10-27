// 応募内容 (#54) and what changed when the instructor changes a quote (#62).
// Pure helpers: the texts of the answers and the list of differences between two versions.

export const ALL_DAYS_TEXT = { all: "全日程OK", partial: "一部の日程のみ", none: "日程は要相談" } as const;
export const PREP_TEXT = { yes: "参加できる", no: "参加できない", discuss: "要相談" } as const;
export const MATERIALS_TEXT = { existing: "既存の教材を使う", create: "教材を新しく作る", either: "どちらも可" } as const;

/** The five answers saved with an application (the json kept in the change history). */
export type ApplyAnswers = {
  all_days?: string | null;
  role?: string | null;
  experience?: string | null;
  materials?: string | null;
  prep?: string | null;
};

export type ApplyDiff = { label: string; before: string; after: string };

const NONE = "未入力";

function pick(map: Record<string, string>, v: string | null | undefined): string {
  if (!v) return NONE;
  return map[v] ?? v;
}

function plain(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t || NONE;
}

/** What changed from the older answers to the newer ones (empty when nothing). Unknown old data (null) counts as "no answers". */
export function applyDiff(before: ApplyAnswers | null | undefined, after: ApplyAnswers | null | undefined): ApplyDiff[] {
  const a = before ?? {};
  const b = after ?? {};
  const out: ApplyDiff[] = [];
  const add = (label: string, x: string, y: string) => {
    if (x !== y) out.push({ label, before: x, after: y });
  };
  add("全日程への対応", pick(ALL_DAYS_TEXT, a.all_days), pick(ALL_DAYS_TEXT, b.all_days));
  add("希望する役割", plain(a.role), plain(b.role));
  add("教材の対応", pick(MATERIALS_TEXT, a.materials), pick(MATERIALS_TEXT, b.materials));
  add("事前研修への参加", pick(PREP_TEXT, a.prep), pick(PREP_TEXT, b.prep));
  add("関連する実績", plain(a.experience), plain(b.experience));
  return out;
}
