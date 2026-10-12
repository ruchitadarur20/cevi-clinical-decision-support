import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

const limiter = (opts: { windowMs: number; limit: number; message: string }) =>
  rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: opts.message } }),
  });

export const apiLimiter = limiter({ windowMs: 60_000, limit: 600, message: 'Too many requests, please slow down' });
export const loginLimiter = limiter({ windowMs: 15 * 60_000, limit: 20, message: 'Too many login attempts, try again later' });
export const analysisLimiter = limiter({ windowMs: 60_000, limit: 20, message: 'Too many analysis requests, please wait' });
