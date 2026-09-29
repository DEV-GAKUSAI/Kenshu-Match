/**
 * Only the public Supabase URL and public key are read here.
 * Both the legacy ANON_KEY name and Supabase's PUBLISHABLE_KEY name are supported.
 * The service role key must never be imported into anything reachable from the
 * browser bundle, so it deliberately has no accessor in this file.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in .env.local (see .env.example).`,
    );
  }
  return value;
}

export function getSupabaseEnv() {
  return {
    url: requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    anonKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}
