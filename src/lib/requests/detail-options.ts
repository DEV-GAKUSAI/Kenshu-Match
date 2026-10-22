/** 詳細条件: extra choices on a request (catalogue lives in training_detail_options). */
export type DetailGroupKey = "audience" | "industry" | "tool" | "level" | "cert_prep" | "cert" | "language";
export type DetailOption = { id: string; group_key: DetailGroupKey; name: string; sort_order: number };

export const DETAIL_GROUPS: { key: DetailGroupKey; label: string; single: boolean }[] = [
  { key: "audience", label: "対象者", single: false },
  { key: "industry", label: "対象業界", single: false },
  { key: "tool", label: "技術・製品・ツール", single: false },
  { key: "level", label: "研修レベル", single: true },
  { key: "cert_prep", label: "資格対策の有無", single: true },
  { key: "cert", label: "対象資格", single: false },
  { key: "language", label: "研修の実施言語", single: false },
];

/** Chosen options grouped for display, in the sheet's group order. Unknown ids are ignored. */
export function groupChosen(ids: readonly string[] | null | undefined, options: readonly DetailOption[]) {
  const chosen = new Set(ids ?? []);
  return DETAIL_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    names: options.filter((o) => o.group_key === g.key && chosen.has(o.id)).map((o) => o.name),
  })).filter((g) => g.names.length > 0);
}

/** Short one-line summary, e.g. 「新入社員・Oracle・入門」. */
export function summarizeChosen(ids: readonly string[] | null | undefined, options: readonly DetailOption[], otherTools?: string | null, max = 4): string {
  const names = groupChosen(ids, options).flatMap((g) => g.names);
  const other = (otherTools ?? "").trim();
  if (other) names.push(other);
  if (names.length <= max) return names.join("・");
  return `${names.slice(0, max).join("・")} ほか${names.length - max}件`;
}
