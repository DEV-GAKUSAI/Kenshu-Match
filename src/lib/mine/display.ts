import { initialsFromName, type MinePublicProfile } from "./public-profile.ts";
import type { WorkStyle } from "../../types/database.ts";

/**
 * What lists and cards may show for an instructor: initials plus only what the
 * instructor allowed in Mine (自己紹介, 希望条件). Everything else Kenshu Link
 * used to keep about the person (full name, old photo, old rate, old areas, old
 * certifications) is not shown any more.
 */
export type MineDisplay = {
  initials: string;
  self_introduction?: string;
  training_conditions?: MinePublicProfile["training_conditions"];
  /** 資格・免許 names, all of them the instructor allowed. */
  qualifications?: string[];
  /** A link to the Mine photo (valid for an hour), only if 写真 is switched on. */
  photo_url?: string;
};

export type MineDisplayMap = Record<string, MineDisplay | undefined>;

const WORK_STYLES = new Set(["ONLINE", "ONSITE", "HYBRID"]);

/** Keeps only the card fields from a full Mine public profile. */
export function toDisplay(initials: string, profile: MinePublicProfile | null | undefined, photoUrl?: string): MineDisplay {
  const qualifications = (profile?.qualifications ?? []).map((q) => q.name).filter(Boolean);
  return {
    initials,
    ...(qualifications.length ? { qualifications } : {}),
    ...(photoUrl ? { photo_url: photoUrl } : {}),
    ...(profile?.self_introduction ? { self_introduction: profile.self_introduction } : {}),
    ...(profile?.training_conditions ? { training_conditions: profile.training_conditions } : {}),
  };
}

/**
 * Replaces the personal fields of directory rows with the Mine display. A row
 * with no Mine data still shows only initials (made from its old name), never
 * the full name, and no old rate, areas, photo or certifications.
 */
export function applyMineDisplay<T extends { id: string }>(rows: T[], map: MineDisplayMap): T[] {
  return rows.map((row) => {
    const old = row as unknown as { name?: string | null };
    const item = map[row.id];
    const tc = item?.training_conditions;
    const rate = typeof tc?.hourly_rate_min === "number" ? tc.hourly_rate_min : null;
    return {
      ...row,
      name: item?.initials || initialsFromName(old.name) || null,
      avatar_url: item?.photo_url ?? null,
      portfolio_url: null,
      years_of_experience: null,
      certifications: item?.qualifications?.length ? item.qualifications : null,
      self_pr: item?.self_introduction ?? null,
      work_style: tc?.work_style && WORK_STYLES.has(tc.work_style) ? (tc.work_style as WorkStyle) : null,
      prefectures: tc?.prefectures?.length ? tc.prefectures : null,
      desired_rate_min: rate,
      desired_rate_max: rate,
    };
  });
}

/** Asks Kenshu Link's server for the Mine display of these instructors (one request). */
export async function fetchMineDisplay(ids: string[]): Promise<MineDisplayMap> {
  const unique = [...new Set(ids)];
  if (!unique.length) return {};
  try {
    const res = await fetch("/api/instructors/mine-display", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unique }),
      cache: "no-store",
    });
    if (!res.ok) return {};
    const body = (await res.json()) as { items?: MineDisplayMap };
    return body.items ?? {};
  } catch {
    return {};
  }
}

/** Fetches the Mine display and applies it. If the request fails, only initials show. */
export async function withMineDisplay<T extends { id: string }>(rows: T[]): Promise<T[]> {
  return applyMineDisplay(rows, await fetchMineDisplay(rows.map((row) => row.id)));
}
