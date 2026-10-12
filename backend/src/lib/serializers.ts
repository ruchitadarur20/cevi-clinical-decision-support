import type { Patient, Role, User } from '@prisma/client';
import { can } from './permissions';

export function ageFromDob(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export function ageBand(age: number): string {
  const lo = Math.floor(age / 10) * 10;
  return `${lo}-${lo + 9}`;
}

/**
 * Role-aware patient serialization. Roles without `patients:identify` (researchers)
 * receive only the synthetic ID and an age band - names and exact DOB never leave the API.
 */
export function serializePatient(p: Patient, role: Role) {
  const age = ageFromDob(p.dateOfBirth);
  const identified = can(role, 'patients:identify');
  return {
    id: p.id,
    syntheticId: p.syntheticId,
    firstName: identified ? p.firstName : null,
    lastName: identified ? p.lastName : null,
    displayName: identified ? `${p.lastName}, ${p.firstName}` : `Anonymized (${p.syntheticId})`,
    dateOfBirth: identified ? p.dateOfBirth.toISOString().slice(0, 10) : null,
    age: identified ? age : null,
    ageBand: ageBand(age),
    sex: p.sex,
    researchCohort: p.researchCohort,
    caseStatus: p.caseStatus,
    summary: p.summary,
    isSynthetic: p.isSynthetic,
    anonymized: !identified,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'isActive' | 'lastLoginAt' | 'createdAt'>;

export const publicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  isActive: u.isActive,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
});

/** Compact patient reference embedded in records / images / analyses. */
export function patientRef(p: Pick<Patient, 'id' | 'syntheticId' | 'firstName' | 'lastName'>, role: Role) {
  const identified = can(role, 'patients:identify');
  return {
    id: p.id,
    syntheticId: p.syntheticId,
    displayName: identified ? `${p.lastName}, ${p.firstName}` : `Anonymized (${p.syntheticId})`,
  };
}
