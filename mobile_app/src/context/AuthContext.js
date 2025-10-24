import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { me, logout as apiLogout } from '../services/api';

const AuthContext = createContext({ isAdmin: false, setIsAdmin: () => {} });

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  // On mount, check existing session via cookie
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await me();
        if (!alive) return;
        setIsAdmin(Boolean(res?.ok));
      } catch {
        if (!alive) return;
        setIsAdmin(false);
      } finally {
        if (alive) setChecked(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const logout = async () => {
    try { await apiLogout(); } catch {}
    setIsAdmin(false);
    try { if (typeof window !== 'undefined' && window.localStorage) { window.localStorage.removeItem('admin_token'); } } catch {}
  };

  const value = useMemo(() => ({ isAdmin, setIsAdmin, checked, logout }), [isAdmin, checked]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
