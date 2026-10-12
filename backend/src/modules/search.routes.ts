import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/http';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { can } from '../lib/permissions';
import { patientRef } from '../lib/serializers';

export const searchRouter = Router();
searchRouter.use(authenticate);

searchRouter.get(
  '/',
  validate({ query: z.object({ q: z.string().trim().min(2).max(100) }) }),
  asyncHandler(async (req, res) => {
    const { q } = req.query as { q: string };
    const role = req.user!.role;
    const identified = can(role, 'patients:identify');
    const [patients, records, images] = await Promise.all([
      can(role, 'patients:read')
        ? prisma.patient.findMany({
            where: { OR: [{ syntheticId: { contains: q } }, { researchCohort: { contains: q } }, ...(identified ? [{ firstName: { contains: q } }, { lastName: { contains: q } }] : [])] },
            take: 5,
            orderBy: { createdAt: 'desc' },
          })
        : [],
      can(role, 'records:read')
        ? prisma.clinicalRecord.findMany({ where: { title: { contains: q } }, take: 5, orderBy: { recordedAt: 'desc' }, include: { patient: { select: { id: true, syntheticId: true, firstName: true, lastName: true } } } })
        : [],
      can(role, 'images:read')
        ? prisma.medicalImage.findMany({ where: { originalName: { contains: q } }, take: 5, orderBy: { createdAt: 'desc' }, include: { patient: { select: { id: true, syntheticId: true, firstName: true, lastName: true } } } })
        : [],
    ]);
    res.json({
      data: {
        patients: patients.map((p) => ({ ...patientRef(p, role), researchCohort: p.researchCohort })),
        records: records.map((r) => ({ id: r.id, title: r.title, type: r.type, patient: patientRef(r.patient, role) })),
        images: images.map((i) => ({ id: i.id, originalName: i.originalName, patient: patientRef(i.patient, role) })),
      },
    });
  }),
);
