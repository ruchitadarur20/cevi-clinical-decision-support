import type { Role, SessionUser } from '@/lib/types';
import { getState } from './store';
import { permissionsFor } from './permissions';

const KEY = 'cevi-demo-session';
const DEFAULT_ROLE: Role = 'CLINICIAN';

/** Stored value: a role name, or "none" after sign-out. First visit lands inside the app as a clinician. */
function readRaw(): string {
  try { return localStorage.getItem(KEY) ?? DEFAULT_ROLE; } catch { return DEFAULT_ROLE; }
}
export function writeSession(v: Role | 'none') {
  try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
}

export function currentUser(): SessionUser | null {
  const raw = readRaw();
  if (raw === 'none') return null;
  const role = (['ADMINISTRATOR', 'CLINICIAN', 'RESEARCHER'] as Role[]).find((r) => r === raw) ?? DEFAULT_ROLE;
  const u = getState().users.find((x) => x.role === role && x.isActive) ?? getState().users.find((x) => x.role === role);
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, permissions: permissionsFor(u.role) };
}
