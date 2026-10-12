import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../lib/errors';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export const validate = (schemas: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
  for (const part of ['params', 'query', 'body'] as const) {
    const schema = schemas[part];
    if (!schema) continue;
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(new AppError(422, 'VALIDATION_ERROR', 'Request validation failed', details));
    }
    (req as any)[part] = result.data;
  }
  next();
};
