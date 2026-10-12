import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/errors';
import { can, type Permission } from '../lib/permissions';
import { asyncHandler } from '../lib/http';

export const AUTH_COOKIE = 'cevi_token';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'cevi-api',
  });
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return (req.cookies?.[AUTH_COOKIE] as string | undefined) ?? null;
}

/**
 * Verifies the JWT and then re-loads the user from MySQL so that deactivation or
 * role changes take effect immediately (the token's role claim is never trusted).
 */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) throw unauthorized();
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'cevi-api' }) as jwt.JwtPayload;
  } catch {
    throw unauthorized('Session expired or invalid');
  }
  const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
  if (!user || !user.isActive) throw unauthorized('Account is not active');
  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  next();
});

export const requirePermission =
  (permission: Permission) => (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!can(req.user.role, permission)) return next(forbidden());
    next();
  };
