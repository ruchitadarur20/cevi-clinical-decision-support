import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ML_SERVICE_URL: z.string().url().default('http://127.0.0.1:8001'),
  ML_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(8),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print variable names only - never values - so secrets cannot leak into logs.
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsed.data;
export const isTest = env.NODE_ENV === 'test';
export const isProd = env.NODE_ENV === 'production';
