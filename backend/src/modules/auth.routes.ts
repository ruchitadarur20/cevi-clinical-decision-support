import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/http';
import { validate } from '../middleware/validate';
import { AUTH_COOKIE, authenticate, signToken } from '../middleware/auth';
import { AppError, unauthorized } from '../lib/errors';
import { env, isProd } from '../config/env';
import { permissionsFor } from '../lib/permissions';
import { recordActivity } from '../lib/activity';
import { loginLimiter } from '../middleware/rateLimit';

export const authRouter = Router();

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

// A real bcrypt hash used to equalise timing when the account does not exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
  maxAge: 8 * 60 * 60 * 1000,
};

authRouter.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive) throw unauthorized('Invalid email or password');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const authUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    const token = signToken(authUser);
    res.cookie(AUTH_COOKIE, token, cookieOptions);
    await recordActivity({
      actorId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      summary: `${user.name} signed in`,
    });
    res.json({ data: { user: { ...authUser, permissions: permissionsFor(user.role) }, token, expiresIn: env.JWT_EXPIRES_IN } });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(204).end();
});

authRouter.get('/me', authenticate, (req, res) => {
  const u = req.user!;
  res.json({ data: { user: { ...u, permissions: permissionsFor(u.role) } } });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash)))
      throw new AppError(400, 'WRONG_PASSWORD', 'Current password is incorrect');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    await recordActivity({ actorId: user.id, action: 'auth.password_change', entityType: 'User', entityId: user.id, summary: `${user.name} changed their password` });
    res.status(204).end();
  }),
);
