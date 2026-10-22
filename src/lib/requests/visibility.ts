// 公開範囲 (#46): who can see an open request. Enforced in the database (migration 174);
// this file only holds labels and small pure helpers (no "@/" imports, so node --test can load it).

export type Visibility = "public" | "registered" | "invited";

export const DEFAULT_VISIBILITY: Visibility = "registered";

export const VISIBILITY_TEXT: Record<Visibility, string> = {
  public: "一般公開",
  registered: "登録講師限定",
  invited: "招待限定",
};

export const VISIBILITY_HINT: Record<Visibility, string> = {
  public: "ログインしていない人も、依頼の内容を見られます。",
  registered: "ログインした講師だけが、依頼の内容を見て応募できます。",
  invited: "招待した講師だけが、依頼の内容を見て応募できます。",
};

export function normalizeVisibility(v: unknown): Visibility {
  return v === "public" || v === "registered" || v === "invited" ? v : "public";
}

/** Which instructor ids to add and which to remove to turn `current` into `next`. */
export function diffInvites(current: string[], next: string[]): { add: string[]; remove: string[] } {
  const cur = new Set(current);
  const nxt = new Set(next);
  return { add: [...nxt].filter((id) => !cur.has(id)), remove: [...cur].filter((id) => !nxt.has(id)) };
}

/** Message for the form when "invited" is chosen but nobody is picked. */
export function inviteError(visibility: Visibility, invited: string[]): string | null {
  return visibility === "invited" && invited.length === 0 ? "招待限定にする場合は、招待する講師を1名以上選んでください。" : null;
}
