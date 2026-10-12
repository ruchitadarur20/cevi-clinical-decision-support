import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/http';
import { authenticate, requirePermission } from '../middleware/auth';
import { dayKey, lastDays, startOfWindow } from '../lib/stats';
import { patientRef } from '../lib/serializers';
import { z } from 'zod';
import { validate } from '../middleware/validate';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const days = 14;
    const since = startOfWindow(days);

    const [
      patients, activeCases, records, images, completed, pending, failed, unavailable,
      caseGroups, cohortGroups, imageStatusGroups, recentAnalyses, recentRecords, analysesWindow, recordsWindow, imagesWindow, activity,
    ] = await Promise.all([
      prisma.patient.count(),
      prisma.patient.count({ where: { caseStatus: 'ACTIVE' } }),
      prisma.clinicalRecord.count(),
      prisma.medicalImage.count(),
      prisma.analysisResult.count({ where: { status: 'COMPLETED' } }),
      prisma.analysisResult.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      prisma.analysisResult.count({ where: { status: 'FAILED' } }),
      prisma.analysisResult.count({ where: { status: 'UNAVAILABLE' } }),
      prisma.patient.groupBy({ by: ['caseStatus'], _count: { _all: true } }),
      prisma.patient.groupBy({ by: ['researchCohort'], _count: { _all: true } }),
      prisma.medicalImage.groupBy({ by: ['processingStatus'], _count: { _all: true } }),
      prisma.analysisResult.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { image: { select: { originalName: true, patient: { select: { id: true, syntheticId: true, firstName: true, lastName: true } } } } },
      }),
      prisma.clinicalRecord.count({ where: { createdAt: { gte: since } } }),
      prisma.analysisResult.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, status: true } }),
      prisma.clinicalRecord.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.medicalImage.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { actor: { select: { name: true } } } }),
    ]);

    const series = lastDays(days).map((date) => ({ date, completed: 0, failed: 0, records: 0, images: 0 }));
    const idx = new Map(series.map((s, i) => [s.date, i]));
    for (const a of analysesWindow) {
      const s = series[idx.get(dayKey(a.createdAt)) ?? -1];
      if (!s) continue;
      if (a.status === 'COMPLETED') s.completed++;
      else if (a.status === 'FAILED' || a.status === 'UNAVAILABLE') s.failed++;
    }
    for (const r of recordsWindow) { const s = series[idx.get(dayKey(r.createdAt)) ?? -1]; if (s) s.records++; }
    for (const i of imagesWindow) { const s = series[idx.get(dayKey(i.createdAt)) ?? -1]; if (s) s.images++; }

    res.json({
      data: {
        dataNotice: 'All patient data in this environment is synthetic and generated for demonstration purposes.',
        totals: { patients, activeCases, records, images, analysesCompleted: completed, analysesPending: pending, analysesFailed: failed, analysesUnavailable: unavailable, recordsLast14Days: recentRecords },
        activitySeries: series,
        caseDistribution: caseGroups.map((g) => ({ name: g.caseStatus, value: g._count._all })),
        cohortDistribution: cohortGroups.map((g) => ({ name: g.researchCohort, value: g._count._all })).sort((a, b) => b.value - a.value),
        imageProcessing: imageStatusGroups.map((g) => ({ name: g.processingStatus, value: g._count._all })),
        recentAnalyses: recentAnalyses.map((a) => ({
          id: a.id, status: a.status, mode: a.mode, modelName: a.modelName, inferenceMs: a.inferenceMs, createdAt: a.createdAt,
          imageName: a.image.originalName, patient: patientRef(a.image.patient, role),
        })),
        recentActivity: activity.map((a) => ({ id: a.id, action: a.action, summary: a.summary, actor: a.actor?.name ?? 'System', createdAt: a.createdAt })),
      },
    });
  }),
);

export const activityRouter = Router();
activityRouter.use(authenticate, requirePermission('activity:read'));
activityRouter.get(
  '/',
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(15) }) }),
  asyncHandler(async (req, res) => {
    const rows = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: (req.query as any).limit,
      include: { actor: { select: { name: true } } },
    });
    res.json({ data: rows.map((a) => ({ id: a.id, action: a.action, summary: a.summary, entityType: a.entityType, entityId: a.entityId, actor: a.actor?.name ?? 'System', createdAt: a.createdAt })) });
  }),
);
