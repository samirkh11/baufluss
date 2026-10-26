import { ReactNode, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthUser } from '../types';
import { clearAccessToken, storeAccessToken } from '../api/client';
import { AuthContext } from './useAuth';

// Storage keys keep the historic "meisterwerk." prefix so existing sessions survive the rename.
const USER_STORAGE_KEY = 'meisterwerk.user';

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);

  function signIn(accessToken: string, nextUser: AuthUser) {
    // Never show data of a previous session (other user or other company) from the cache.
    queryClient.clear();
    storeAccessToken(accessToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function signOut() {
    clearAccessToken();
    localStorage.removeItem(USER_STORAGE_KEY);
    // Drop all cached API data (customer data, prices) so the next user on this device cannot see it.
    queryClient.clear();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>;
}
