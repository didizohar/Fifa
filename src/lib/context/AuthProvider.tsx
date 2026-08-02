import type { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  /** True once a PASSWORD_RECOVERY auth event (or a manual recovery-code exchange) establishes the current session -- the root navigator uses this to route to the reset-password screen instead of the normal app, even though `session` is non-null. */
  isPasswordRecovery: boolean;
  /** Called by the reset-password screen right after it manually exchanges a recovery code, in case the SDK doesn't also emit PASSWORD_RECOVERY for that path. */
  markPasswordRecovery: () => void;
  /** Called once the user has set a new password, so normal session-based routing resumes. */
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        setSession(data.session);
        setIsLoading(false);
      })
      .catch(() => {
        // A failed session restore (e.g. corrupted AsyncStorage data) must
        // still resolve isLoading -- otherwise the root navigator's
        // isResolved never becomes true and the app is stuck on the splash
        // screen forever, with no error and no way in. Treat it the same
        // as "no session": the user lands on the login screen, the safe
        // default, instead of a permanent blank launch.
        if (!isMounted) return;
        setSession(null);
        setIsLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
      if (event === "SIGNED_OUT") setIsPasswordRecovery(false);
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const markPasswordRecovery = useCallback(() => setIsPasswordRecovery(true), []);
  const clearPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

  // Memoized (GroupProvider already does this) -- every screen in the app
  // consumes this context, so an unmemoized value object here meant any
  // AuthProvider re-render (e.g. a Supabase token refresh) forced every
  // consumer everywhere to re-render too, regardless of whether the field
  // it actually reads changed.
  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, isLoading, isPasswordRecovery, markPasswordRecovery, clearPasswordRecovery }),
    [session, isLoading, isPasswordRecovery, markPasswordRecovery, clearPasswordRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuthContext must be used within an AuthProvider");
  return context;
}
