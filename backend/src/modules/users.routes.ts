import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, pageMeta, paginationSchema, param } from '../lib/http';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import { AppError, conflict, notFound } from '../lib/errors';
import { publicUser } from '../lib/serializers';
import { recordActivity } from '../lib/activity';

export const usersRouter = Router();
usersRouter.use(authenticate, requirePermission('users:manage'));

const roleEnum = z.enum(['ADMINISTRATOR', 'CLINICIAN', 'RESEARCHER']);
const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const listQuery = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  role: roleEnum.optional(),
});

usersRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, role } = req.query as unknown as z.infer<typeof listQuery>;
    const where = {
      ...(role ? { role } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ data: rows.map(publicUser), meta: pageMeta(page, pageSize, total) });
  }),
);

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  role: roleEnum,
  password: passwordSchema,
});

usersRouter.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('Email is already registered');
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, role: body.role, passwordHash: await bcrypt.hash(body.password, 12) },
    });
    await recordActivity({ actorId: req.user!.id, action: 'user.create', entityType: 'User', entityId: user.id, summary: `Created user ${user.name} (${user.role})` });
    res.status(201).json({ data: publicUser(user) });
  }),
);

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    role: roleEnum,
    isActive: z.boolean(),
    password: passwordSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

usersRouter.patch(
  '/:id',
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const body = req.body as z.infer<typeof updateSchema>;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw notFound('User');
    if (id === req.user!.id && (body.role && body.role !== existing.role || body.isActive === false))
      throw new AppError(400, 'SELF_MODIFICATION', 'You cannot change your own role or deactivate your own account');

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 12) } : {}),
      },
    });
    await recordActivity({ actorId: req.user!.id, action: 'user.update', entityType: 'User', entityId: id, summary: `Updated user ${user.name}` });
    res.json({ data: publicUser(user) });
  }),
);
