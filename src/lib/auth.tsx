import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigure } from "./supabase";

type EtatAuth = { session: Session | null; chargement: boolean };

const AuthContext = createContext<EtatAuth>({ session: null, chargement: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<EtatAuth>({ session: null, chargement: true });

  useEffect(() => {
    if (!supabaseConfigure()) {
      setEtat({ session: null, chargement: false });
      return;
    }
    supabase()
      .auth.getSession()
      .then(({ data }) => setEtat({ session: data.session, chargement: false }));
    const { data } = supabase().auth.onAuthStateChange((_e, session) =>
      setEtat({ session, chargement: false }),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={etat}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
