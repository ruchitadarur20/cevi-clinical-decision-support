import { z, type ZodTypeAny } from 'zod';
import { ApiError } from './api';

/** Returns a field->message map, or null when the data is valid. */
export function validateForm<T extends ZodTypeAny>(schema: T, data: unknown): { errors: Record<string, string> | null; value?: z.infer<T> } {
  const r = schema.safeParse(data);
  if (r.success) return { errors: null, value: r.data };
  const errors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  return { errors };
}

export const serverFieldErrors = (e: unknown): Record<string, string> => (e instanceof ApiError ? e.fieldErrors : {});

export const patientSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
    .refine((v) => new Date(v) <= new Date(), 'Date of birth cannot be in the future'),
  sex: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNKNOWN']),
  researchCohort: z.string().trim().min(2, 'Research cohort is required').max(80),
  caseStatus: z.enum(['ACTIVE', 'MONITORING', 'CLOSED']),
  summary: z.string().trim().max(2000).optional(),
});

export const recordSchema = z.object({
  patientId: z.string().uuid('Select a patient'),
  type: z.enum(['OBSERVATION', 'DIAGNOSTIC_NOTE', 'LAB_RESULT', 'PROCEDURE', 'FOLLOW_UP']),
  severity: z.enum(['ROUTINE', 'ELEVATED', 'URGENT']),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(160),
  content: z.string().trim().min(5, 'Content must be at least 5 characters').max(10000),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const userSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Enter a valid email address'),
  role: z.enum(['ADMINISTRATOR', 'CLINICIAN', 'RESEARCHER']),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});
