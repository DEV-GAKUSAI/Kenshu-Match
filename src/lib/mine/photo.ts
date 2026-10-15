import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "mine-profile-photos";
const SIGNED_SECONDS = 60 * 60;

/**
 * Mine keeps profile photos private. Only people who switched 写真 on get an
 * avatar_path in their public profile; this turns those paths into links that
 * work for one hour. Anything that is not exactly "<uuid>/profile-photo" is
 * ignored. A failure just means no photo (initials are shown instead).
 */
export async function signPhotoUrls(admin: SupabaseClient, paths: Record<string, string | undefined>): Promise<Record<string, string>> {
  const valid = Object.entries(paths).filter(([, path]) => typeof path === "string" && /^[0-9a-f-]{36}\/profile-photo$/i.test(path)) as [string, string][];
  if (!valid.length) return {};
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(valid.map(([, path]) => path), SIGNED_SECONDS);
  if (error || !data) return {};
  const urlByPath = new Map<string, string>();
  for (const item of data) if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
  const out: Record<string, string> = {};
  for (const [id, path] of valid) {
    const url = urlByPath.get(path);
    if (url) out[id] = url;
  }
  return out;
}
