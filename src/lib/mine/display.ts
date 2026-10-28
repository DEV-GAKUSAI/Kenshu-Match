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
  /** 職種 names the instructor allowed. */
  occupations?: string[];
  /** スキル names and 実績 (work history positions / companies) the instructor allowed; used for keyword search. */
  skills?: string[];
  experience?: string[];
  /** A link to the Mine photo (valid for an hour), only if 写真 is switched on. */
  photo_url?: string;
};

export type MineDisplayMap = Record<string, MineDisplay | undefined>;

const WORK_STYLES = new Set(["ONLINE", "ONSITE", "HYBRID"]);

/** Keeps only the card fields from a full Mine public profile. */
export function toDisplay(initials: string, profile: MinePublicProfile | null | undefined, photoUrl?: string): MineDisplay {
  const qualifications = (profile?.qualifications ?? []).map((q) => q.name).filter(Boolean);
  const occupations = (profile?.occupations ?? []).map((o) => o.name).filter(Boolean);
  const skills = (profile?.skills ?? []).map((k) => k.name).filter(Boolean);
  const experience = (profile?.work_history ?? []).flatMap((w) => [w.position, w.company_name]).filter((x): x is string => !!x);
  return {
    initials,
    ...(occupations.length ? { occupations } : {}),
    ...(qualifications.length ? { qualifications } : {}),
    ...(skills.length ? { skills } : {}),
    ...(experience.length ? { experience } : {}),
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
      occupation_names: item?.occupations?.length ? item.occupations : null,
      years_of_experience: null,
      certifications: item?.qualifications?.length ? item.qualifications : null,
      self_pr: item?.self_introduction ?? null,
      work_style: tc?.work_style && WORK_STYLES.has(tc.work_style) ? (tc.work_style as WorkStyle) : null,
      prefectures: tc?.prefectures?.length ? tc.prefectures : null,
      desired_rate_min: rate,
      desired_rate_max: rate,
      skill_names: item?.skills?.length ? item.skills : null,
      experience_names: item?.experience?.length ? item.experience : null,
      available_from: tc?.available_from ?? null,
      available_until: tc?.available_until ?? null,
      training_languages: tc?.training_languages?.length ? tc.training_languages : null,
      roles: tc?.roles?.length ? tc.roles : null,
      training_skills: tc?.training_skills?.length ? tc.training_skills : null,
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
