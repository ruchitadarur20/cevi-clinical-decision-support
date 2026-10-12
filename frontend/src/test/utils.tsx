import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';
import type { Permission, Role, SessionUser } from '@/lib/types';

export const PERMS: Record<Role, Permission[]> = {
  ADMINISTRATOR: ['users:manage', 'activity:read', 'patients:read', 'patients:identify', 'records:read', 'images:read', 'analyses:read', 'analytics:read'],
  CLINICIAN: ['activity:read', 'patients:read', 'patients:write', 'patients:identify', 'records:read', 'records:write', 'images:read', 'images:write', 'analyses:read', 'analyses:create'],
  RESEARCHER: ['activity:read', 'patients:read', 'records:read', 'images:read', 'analyses:read', 'analyses:create', 'analytics:read'],
};

export function mockUser(role: Role): SessionUser {
  return { id: 'u1', email: `${role.toLowerCase()}@cevi.demo`, name: `Test ${role}`, role, permissions: PERMS[role] };
}

type Handler = (url: URL, init?: RequestInit) => unknown | { __status: number; body: unknown };

/** Installs a fetch mock that routes `/api/...` calls to handlers keyed by "METHOD /path". */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Array<{ key: string; url: URL; body?: unknown }> = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.pathname.replace(/^\/api/, '')}`;
    calls.push({ key, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const h = routes[key];
    if (!h) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: `no mock for ${key}` } }), { status: 404 });
    const out = h(url, init) as any;
    if (out?.__status) return new Response(out.__status === 204 ? null : JSON.stringify(out.body), { status: out.__status });
    return new Response(JSON.stringify(out), { status: 200 });
  }) as typeof fetch;
  return calls;
}

export function renderApp(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
