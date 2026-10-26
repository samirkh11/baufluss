import { createContext, useContext } from 'react';
import { AuthUser } from '../types';

export interface AuthContextValue {
  user: AuthUser | null;
  signIn: (accessToken: string, user: AuthUser) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
