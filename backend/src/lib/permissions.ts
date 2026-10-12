import type { Role } from '@prisma/client';

/**
 * Single source of truth for authorization. Routes call `requirePermission(...)`;
 * serializers use `canViewIdentity` to anonymize data for research roles.
 *
 * Principle of least privilege:
 *  - ADMINISTRATOR administers users and observes activity; it does not author clinical content.
 *  - CLINICIAN owns patients, records, images and may request analyses.
 *  - RESEARCHER sees anonymized data, may run experimental analyses and read analytics.
 */
export const PERMISSIONS = {
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
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, permission: Permission): boolean =>
  (PERMISSIONS[permission] as readonly Role[]).includes(role);

export const permissionsFor = (role: Role): Permission[] =>
  (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
