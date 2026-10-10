import { createContext, ReactNode, useContext, useState } from 'react';
import { AuthUser } from '../types';
import { clearAccessToken, storeAccessToken } from '../api/client';

interface AuthContextValue {
  user: AuthUser | null;
  signIn: (accessToken: string, user: AuthUser) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const USER_STORAGE_KEY = 'meisterwerk.user';

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);

  function signIn(accessToken: string, nextUser: AuthUser) {
    storeAccessToken(accessToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function signOut() {
    clearAccessToken();
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
