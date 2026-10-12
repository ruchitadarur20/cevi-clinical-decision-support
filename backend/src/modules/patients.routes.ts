import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, pageMeta, paginationSchema, param } from '../lib/http';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import { notFound } from '../lib/errors';
import { serializePatient } from '../lib/serializers';
import { can } from '../lib/permissions';
import { recordActivity } from '../lib/activity';

export const patientsRouter = Router();
patientsRouter.use(authenticate);

const listQuery = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'MONITORING', 'CLOSED']).optional(),
  cohort: z.string().trim().max(80).optional(),
  sex: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNKNOWN']).optional(),
  sort: z.enum(['name', 'createdAt', 'syntheticId']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

patientsRouter.get(
  '/',
  requirePermission('patients:read'),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, status, cohort, sex, sort, order } = req.query as unknown as z.infer<typeof listQuery>;
    const identified = can(req.user!.role, 'patients:identify');

    // Researchers must not be able to probe identities by searching on names.
    const search: Prisma.PatientWhereInput[] = q
      ? [
          { syntheticId: { contains: q } },
          { researchCohort: { contains: q } },
          ...(identified ? [{ firstName: { contains: q } }, { lastName: { contains: q } }] : []),
        ]
      : [];
    const where: Prisma.PatientWhereInput = {
      ...(search.length ? { OR: search } : {}),
      ...(status ? { caseStatus: status } : {}),
      ...(cohort ? { researchCohort: cohort } : {}),
      ...(sex ? { sex } : {}),
    };
    const orderBy: Prisma.PatientOrderByWithRelationInput[] =
      sort === 'name' && identified ? [{ lastName: order }, { firstName: order }] : [{ [sort === 'name' ? 'syntheticId' : sort]: order }];

    const [total, rows] = await Promise.all([
      prisma.patient.count({ where }),
      prisma.patient.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { records: true, images: true } } },
      }),
    ]);
    res.json({
      data: rows.map((p) => ({ ...serializePatient(p, req.user!.role), recordCount: p._count.records, imageCount: p._count.images })),
      meta: pageMeta(page, pageSize, total),
    });
  }),
);

patientsRouter.get(
  '/cohorts',
  requirePermission('patients:read'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.patient.groupBy({ by: ['researchCohort'], _count: { _all: true }, orderBy: { researchCohort: 'asc' } });
    res.json({ data: rows.map((r) => ({ name: r.researchCohort, count: r._count._all })) });
  }),
);

const bodyBase = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date')
    .refine((v) => new Date(v) <= new Date(), 'Date of birth cannot be in the future')
    .refine((v) => new Date(v).getFullYear() >= 1900, 'Date of birth is out of range'),
  sex: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNKNOWN']).default('UNKNOWN'),
  researchCohort: z.string().trim().min(2).max(80),
  caseStatus: z.enum(['ACTIVE', 'MONITORING', 'CLOSED']).default('ACTIVE'),
  summary: z.string().trim().max(2000).optional().nullable(),
});
const createSchema = bodyBase;
const updateSchema = bodyBase.partial().refine((v) => Object.keys(v).length > 0, 'At least one field is required');

async function nextSyntheticId(): Promise<string> {
  const last = await prisma.patient.findFirst({ orderBy: { syntheticId: 'desc' }, select: { syntheticId: true } });
  const n = last ? parseInt(last.syntheticId.replace(/\D/g, ''), 10) + 1 : 1;
  return `SYN-${String(n).padStart(6, '0')}`;
}

patientsRouter.post(
  '/',
  requirePermission('patients:write'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof createSchema>;
    let patient;
    // Retry once if two concurrent registrations raced for the same synthetic ID (unique constraint).
    for (let attempt = 0; ; attempt++) {
      try {
        patient = await prisma.patient.create({
          data: { ...b, dateOfBirth: new Date(b.dateOfBirth), syntheticId: await nextSyntheticId(), createdById: req.user!.id },
        });
        break;
      } catch (e) {
        if ((e as any)?.code === 'P2002' && attempt < 2) continue;
        throw e;
      }
    }
    await recordActivity({ actorId: req.user!.id, action: 'patient.create', entityType: 'Patient', entityId: patient.id, summary: `Registered synthetic patient ${patient.syntheticId}` });
    res.status(201).json({ data: serializePatient(patient, req.user!.role) });
  }),
);

patientsRouter.get(
  '/:id',
  requirePermission('patients:read'),
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const patient = await prisma.patient.findUnique({
      where: { id: param(req, 'id') },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { records: true, images: true } },
        records: { orderBy: { recordedAt: 'desc' }, take: 50, include: { author: { select: { id: true, name: true } } } },
        images: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!patient) throw notFound('Patient');
    const analyses = await prisma.analysisResult.findMany({
      where: { image: { patientId: patient.id } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { image: { select: { id: true, originalName: true } } },
    });
    const activity = await prisma.activityLog.findMany({
      where: { entityId: patient.id, entityType: 'Patient' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { actor: { select: { name: true } } },
    });
    const { records, images, createdBy, _count, ...rest } = patient;
    res.json({
      data: {
        ...serializePatient(rest, role),
        createdBy,
        recordCount: _count.records,
        imageCount: _count.images,
        records: records.map((r) => ({ id: r.id, type: r.type, severity: r.severity, title: r.title, content: r.content, recordedAt: r.recordedAt, version: r.version, author: r.author })),
        images: images.map((i) => ({ id: i.id, originalName: i.originalName, modality: i.modality, width: i.width, height: i.height, processingStatus: i.processingStatus, isSynthetic: i.isSynthetic, createdAt: i.createdAt })),
        analyses: analyses.map((a) => ({ id: a.id, status: a.status, mode: a.mode, modelName: a.modelName, modelVersion: a.modelVersion, inferenceMs: a.inferenceMs, createdAt: a.createdAt, image: a.image })),
        activity: activity.map((a) => ({ id: a.id, action: a.action, summary: a.summary, actor: a.actor?.name ?? null, createdAt: a.createdAt })),
      },
    });
  }),
);

patientsRouter.patch(
  '/:id',
  requirePermission('patients:write'),
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const b = req.body as z.infer<typeof updateSchema>;
    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) throw notFound('Patient');
    const patient = await prisma.patient.update({
      where: { id },
      data: { ...b, ...(b.dateOfBirth ? { dateOfBirth: new Date(b.dateOfBirth) } : {}) },
    });
    await recordActivity({ actorId: req.user!.id, action: 'patient.update', entityType: 'Patient', entityId: id, summary: `Updated patient ${patient.syntheticId}` });
    res.json({ data: serializePatient(patient, req.user!.role) });
  }),
);

