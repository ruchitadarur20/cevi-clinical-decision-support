import type { Permission, Role } from '@/lib/types';

/** Mirrors backend/src/lib/permissions.ts so the demo enforces the same role matrix as the real API. */
export const PERMISSIONS: Record<Permission, Role[]> = {
  'users:manage': ['ADMINISTRATOR'],
  'activity:read': ['ADMINISTRATOR', 'CLINICIAN', 'RESEARCHER'],
  'patients:read': ['ADMINISTRATOR', 'CLINICIAN', 'RESEARCHER'],
  'patients:write': ['CLINICIAN'],
  'patients:identify': ['ADMINISTRATOR', 'CLINICIAN'],
  'records:read': ['ADMINISTRATOR', 'CLINICIAN', 'RESEARCHER'],
  'records:write': ['CLINICIAN'],
  'images:read': ['ADMINISTRATOR', 'CLINICIAN', 'RESEARCHER'],
  'images:write': ['CLINICIAN'],
  'analyses:read': ['ADMINISTRATOR', 'CLINICIAN', 'RESEARCHER'],
  'analyses:create': ['CLINICIAN', 'RESEARCHER'],
  'analytics:read': ['ADMINISTRATOR', 'RESEARCHER'],
};

export const can = (role: Role, p: Permission) => PERMISSIONS[p].includes(role);
export const permissionsFor = (role: Role) => (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
