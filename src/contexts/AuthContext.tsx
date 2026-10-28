"use client";

import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isPublicPath } from "@/lib/auth/roles";
import { loadUserProfile, signIn, signInWithGoogle, signOut, type CurrentUser } from "@/lib/auth/auth";

export interface AuthContextValue {
  session: Session | null;
  user: CurrentUser | null;
  authReady: boolean;
  needsProfileCompletion: boolean;
  signIn: typeof signIn;
  signInWithGoogle: typeof signInWithGoogle;
  signOut: typeof signOut;
  /** Re-runs the users-table lookup for the current session (e.g. right after complete-profile's RPC). */
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);
  // ログインはしているが Kenshu Link の役割ではない（Mine / Engineer Match の会員）
  const [foreignRole, setForeignRole] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  // The last user we knew, so a short failure while loading the profile never logs the person out on screen.
  const lastUser = useRef<CurrentUser | null>(null);
  // Counts auth events, so a slow answer to an older event never overwrites the newer one.
  const latestEvent = useRef(0);

  useEffect(() => {
    // Do NOT call supabase.auth.getSession() here as well. onAuthStateChange
    // always fires one 'INITIAL_SESSION' event once Supabase has finished
    // resolving the session (including exchanging a Google OAuth redirect's
    // token), so it alone is the reliable source of truth. Calling
    // getSession() separately on mount can race that resolution and read an
    // empty session right after an OAuth redirect (see legacy assets/auth.js).
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      const eventNo = ++latestEvent.current;
      // Supabase asks us not to query inside this callback (it still holds its auth lock and the read can hang or fail),
      // so the profile is loaded right after it returns.
      setTimeout(() => {
        void (async () => {
          let result = await loadUserProfile(newSession);
          // A failed read (not "no profile") is retried a couple of times.
          for (let i = 0; i < 2 && result.failed; i++) {
            await new Promise((r) => setTimeout(r, 700 * (i + 1)));
            result = await loadUserProfile(newSession);
          }
          if (eventNo !== latestEvent.current) return;
          if (result.failed && newSession && lastUser.current) {
            // Still failing: keep showing the person who was logged in instead of "login required".
            setAuthReady(true);
            return;
          }
          lastUser.current = result.user;
          setUser(result.user);
          setNeedsProfileCompletion(result.needsProfileCompletion);
          setForeignRole(result.foreignRole === true);
          setAuthReady(true);
        })();
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    const { user: profile, needsProfileCompletion: incomplete, foreignRole: foreign, failed } = await loadUserProfile(data.session);
    if (failed) return; // keep what we have; a later auth event reloads it
    lastUser.current = profile;
    setUser(profile);
    setNeedsProfileCompletion(incomplete);
    setForeignRole(foreign === true);
  }, []);

  useEffect(() => {
    // OAuth first-time sign-up (role not chosen yet): send to /complete-profile,
    // same as auth.js's kenshulink:authchange handler. Guarded against the
    // complete-profile page itself to avoid a redirect loop.
    // Mine の会員は、誰でも開けるページ（トップ・講師検索など）は普通に見られる。
    if (needsProfileCompletion && pathname !== "/complete-profile" && !(foreignRole && isPublicPath(pathname))) {
      router.replace("/complete-profile");
    }
  }, [needsProfileCompletion, foreignRole, pathname, router]);

  const value: AuthContextValue = {
    session,
    user,
    authReady,
    needsProfileCompletion,
    signIn,
    signInWithGoogle,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
