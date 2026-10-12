import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, pageMeta, paginationSchema, param } from '../lib/http';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import { AppError, notFound } from '../lib/errors';
import { patientRef } from '../lib/serializers';
import { recordActivity } from '../lib/activity';

export const recordsRouter = Router();
recordsRouter.use(authenticate);

const recordType = z.enum(['OBSERVATION', 'DIAGNOSTIC_NOTE', 'LAB_RESULT', 'PROCEDURE', 'FOLLOW_UP']);
const severity = z.enum(['ROUTINE', 'ELEVATED', 'URGENT']);

const listQuery = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  patientId: z.string().uuid().optional(),
  type: recordType.optional(),
  severity: severity.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const include = {
  patient: { select: { id: true, syntheticId: true, firstName: true, lastName: true } },
  author: { select: { id: true, name: true, role: true } },
} satisfies Prisma.ClinicalRecordInclude;

type RecordWithRefs = Prisma.ClinicalRecordGetPayload<{ include: typeof include }>;

const serialize = (r: RecordWithRefs, role: Parameters<typeof patientRef>[1]) => ({
  id: r.id,
  type: r.type,
  severity: r.severity,
  title: r.title,
  content: r.content,
  recordedAt: r.recordedAt,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  patient: patientRef(r.patient, role),
  author: r.author,
});

recordsRouter.get(
  '/',
  requirePermission('records:read'),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, patientId, type, severity: sev, from, to } = req.query as unknown as z.infer<typeof listQuery>;
    const where: Prisma.ClinicalRecordWhereInput = {
      ...(q ? { OR: [{ title: { contains: q } }, { content: { contains: q } }] } : {}),
      ...(patientId ? { patientId } : {}),
      ...(type ? { type } : {}),
      ...(sev ? { severity: sev } : {}),
      ...(from || to ? { recordedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.clinicalRecord.count({ where }),
      prisma.clinicalRecord.findMany({ where, include, orderBy: { recordedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ data: rows.map((r) => serialize(r, req.user!.role)), meta: pageMeta(page, pageSize, total) });
  }),
);

const createSchema = z.object({
  patientId: z.string().uuid(),
  type: recordType.default('OBSERVATION'),
  severity: severity.default('ROUTINE'),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(160),
  content: z.string().trim().min(5, 'Content must be at least 5 characters').max(10000),
  recordedAt: z.string().datetime().optional(),
});

recordsRouter.post(
  '/',
  requirePermission('records:write'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof createSchema>;
    const patient = await prisma.patient.findUnique({ where: { id: b.patientId } });
    if (!patient) throw new AppError(422, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'patientId', message: 'Patient does not exist' }]);
    const record = await prisma.clinicalRecord.create({
      data: { ...b, recordedAt: b.recordedAt ? new Date(b.recordedAt) : new Date(), authorId: req.user!.id },
      include,
    });
    await recordActivity({ actorId: req.user!.id, action: 'record.create', entityType: 'Patient', entityId: patient.id, summary: `New ${record.type.toLowerCase().replace('_', ' ')} for ${patient.syntheticId}: ${record.title}` });
    res.status(201).json({ data: serialize(record, req.user!.role) });
  }),
);

recordsRouter.get(
  '/:id',
  requirePermission('records:read'),
  asyncHandler(async (req, res) => {
    const record = await prisma.clinicalRecord.findUnique({
      where: { id: param(req, 'id') },
      include: { ...include, revisions: { orderBy: { version: 'desc' }, include: { editedBy: { select: { id: true, name: true } } } } },
    });
    if (!record) throw notFound('Clinical record');
    const { revisions, ...rest } = record;
    res.json({
      data: {
        ...serialize(rest as RecordWithRefs, req.user!.role),
        revisions: revisions.map((v) => ({ version: v.version, type: v.type, severity: v.severity, title: v.title, content: v.content, editedBy: v.editedBy, createdAt: v.createdAt })),
      },
    });
  }),
);

const updateSchema = createSchema
  .omit({ patientId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

recordsRouter.patch(
  '/:id',
  requirePermission('records:write'),
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const b = req.body as z.infer<typeof updateSchema>;
    const existing = await prisma.clinicalRecord.findUnique({ where: { id } });
    if (!existing) throw notFound('Clinical record');
    // Only the author may edit - and the previous version is preserved in the same transaction.
    if (existing.authorId !== req.user!.id)
      throw new AppError(403, 'FORBIDDEN', 'Only the original author can edit this record');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.clinicalRecordRevision.create({
        data: {
          recordId: id,
          version: existing.version,
          type: existing.type,
          severity: existing.severity,
          title: existing.title,
          content: existing.content,
          editedById: req.user!.id,
        },
      });
      return tx.clinicalRecord.update({
        where: { id },
        data: { ...b, recordedAt: b.recordedAt ? new Date(b.recordedAt) : undefined, version: { increment: 1 } },
        include,
      });
    });
    await recordActivity({ actorId: req.user!.id, action: 'record.update', entityType: 'Patient', entityId: updated.patientId, summary: `Edited record "${updated.title}" (v${updated.version})` });
    res.json({ data: serialize(updated, req.user!.role) });
  }),
);
