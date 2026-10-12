import { isTest } from '../config/env';

type Level = 'info' | 'warn' | 'error';

/**
 * Minimal structured logger. Callers must never pass request bodies, passwords,
 * tokens or patient fields - only identifiers and operational metadata.
 */
function log(level: Level, msg: string, meta: Record<string, unknown> = {}) {
  if (isTest && level !== 'error') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta });
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
