import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setUnauthorizedHandler } from '@/lib/api';
import type { Permission, Role, SessionUser } from '@/lib/types';
import { isDemo } from '@/lib/demoConfig';

interface AuthValue {
  user: SessionUser | null;
  loading: boolean;
  can: (p: Permission) => boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  /** Portfolio demo only: simulate signing in as another role. Undefined in the full-stack build. */
  switchRole?: (role: Role) => Promise<void>;
}
const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        return (await api.get<{ data: { user: SessionUser } }>('/auth/me')).data.user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
  const user = data ?? null;

  useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    });
    return () => setUnauthorizedHandler(null);
  }, [qc]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ data: { user: SessionUser } }>('/auth/login', { email, password });
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      qc.setQueryData(['me'], res.data.user);
      return res.data.user;
    },
    [qc],
  );
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    }
  }, [qc]);

  const switchRole = useCallback(
    async (role: Role) => {
      const res = await api.post<{ data: { user: SessionUser } }>('/auth/switch-role', { role });
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      qc.setQueryData(['me'], res.data.user);
    },
    [qc],
  );

  const value = useMemo<AuthValue>(
    () => ({ user, loading: isLoading, can: (p) => !!user?.permissions.includes(p), login, logout, ...(isDemo ? { switchRole } : {}) }),
    [user, isLoading, login, logout, switchRole],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
}
