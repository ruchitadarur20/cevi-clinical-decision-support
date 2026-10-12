import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}

 
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: { code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR', message: tooLarge ? 'File exceeds the size limit' : err.message },
    });
  }
  if ((err as any)?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
  }
  if ((err as any)?.code === 'P2002') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these unique values already exists' } });
  }
  // Unknown: log server-side with minimal metadata, return a generic message (no stack, no internals).
  logger.error('unhandled_error', { path: req.path, method: req.method, err: (err as Error)?.message });
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
