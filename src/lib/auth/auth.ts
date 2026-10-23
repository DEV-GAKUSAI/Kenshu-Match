import { createClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { isKenshuRole } from "@/lib/auth/roles";
import type { UserRole, UserRow } from "@/types/database";

export async function signIn(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error };
  return { data };
}

export async function signUp(email: string, password: string, role: UserRole, name: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role, name } },
  });
  if (error) return { error };
  return { data };
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}

export async function signInWithGoogle(redirectTo: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) return { error };
  return { data };
}

export async function resetPasswordForEmail(email: string, redirectTo: string) {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  return { error };
}

export async function updatePassword(password: string) {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  return { error };
}

export async function completeOAuthProfile(role: UserRole, name: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("complete_oauth_profile", { p_role: role, p_name: name });
  return { error };
}

/**
 * Mirrors auth.js's syncUserFromSession(): the session's public.users row is
 * the single source of truth for role/name/status. A missing row (0 results,
 * no error) means an OAuth sign-up whose handle_new_user() trigger skipped
 * the insert because no role was chosen yet (see complete-profile page).
 */
export type CurrentUser = Pick<UserRow, "id" | "role" | "name" | "status">;

export async function loadUserProfile(
  session: Session | null
): Promise<{ user: CurrentUser | null; needsProfileCompletion: boolean; foreignRole?: boolean }> {
  if (!session) {
    return { user: null, needsProfileCompletion: false };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, role, name, status")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!error && data) {
    // 共有の users テーブルには Engineer Match / Mine の会員（ENGINEER など）もいる。
    // Kenshu Link の役割ではない場合は、生徒として扱わず「Mineから開く」案内へ回す。
    if (!isKenshuRole(data.role)) return { user: null, needsProfileCompletion: true, foreignRole: true };
    return { user: data, needsProfileCompletion: false };
  }
  return { user: null, needsProfileCompletion: true };
}
