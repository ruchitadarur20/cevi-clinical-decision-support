import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/http';
import { authenticate, requirePermission } from '../middleware/auth';
import { average, dayKey, lastDays, percentile, startOfWindow } from '../lib/stats';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate, requirePermission('analytics:read'));

analyticsRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const days = 30;
    const since = startOfWindow(days);
    const [
      totalAnalyses, statusGroups, modeGroups, syntheticCount, modalityGroups, cohortGroups, modelGroups,
      window, completedRecent, imagesWindow, recordsWindow, logins, totals,
    ] = await Promise.all([
      prisma.analysisResult.count(),
      prisma.analysisResult.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.analysisResult.groupBy({ by: ['mode'], _count: { _all: true } }),
      prisma.analysisResult.count({ where: { isSynthetic: true } }),
      prisma.medicalImage.groupBy({ by: ['modality'], _count: { _all: true } }),
      prisma.patient.groupBy({ by: ['researchCohort'], _count: { _all: true } }),
      prisma.analysisResult.groupBy({ by: ['modelName', 'modelVersion'], _count: { _all: true }, where: { status: 'COMPLETED' } }),
      prisma.analysisResult.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, status: true, inferenceMs: true } }),
      prisma.analysisResult.findMany({
        where: { status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { inferenceMs: true, predictions: true },
      }),
      prisma.medicalImage.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.clinicalRecord.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.activityLog.findMany({ where: { action: 'auth.login', createdAt: { gte: since } }, select: { createdAt: true } }),
      Promise.all([prisma.patient.count(), prisma.clinicalRecord.count(), prisma.medicalImage.count(), prisma.user.count()]),
    ]);

    const latencies = completedRecent.map((a) => a.inferenceMs).filter((n): n is number => typeof n === 'number').sort((a, b) => a - b);
    const avg = average(latencies);

    const series = lastDays(days).map((date) => ({ date, analyses: 0, completed: 0, failed: 0, avgLatencyMs: null as number | null, images: 0, records: 0, logins: 0, _lat: [] as number[] }));
    const idx = new Map(series.map((s, i) => [s.date, i]));
    for (const a of window) {
      const s = series[idx.get(dayKey(a.createdAt)) ?? -1];
      if (!s) continue;
      s.analyses++;
      if (a.status === 'COMPLETED') { s.completed++; if (a.inferenceMs != null) s._lat.push(a.inferenceMs); }
      if (a.status === 'FAILED' || a.status === 'UNAVAILABLE') s.failed++;
    }
    for (const i of imagesWindow) { const s = series[idx.get(dayKey(i.createdAt)) ?? -1]; if (s) s.images++; }
    for (const r of recordsWindow) { const s = series[idx.get(dayKey(r.createdAt)) ?? -1]; if (s) s.records++; }
    for (const l of logins) { const s = series[idx.get(dayKey(l.createdAt)) ?? -1]; if (s) s.logins++; }

    // Top-1 label frequency. These are general ImageNet classes, NOT clinical findings.
    const labelCounts = new Map<string, number>();
    for (const a of completedRecent) {
      const preds = a.predictions as Array<{ label: string }> | null;
      const top = preds?.[0]?.label;
      if (top) labelCounts.set(top, (labelCounts.get(top) ?? 0) + 1);
    }

    res.json({
      data: {
        dataNotice: 'Metrics are computed from recorded application data. Seeded demonstration data is synthetic. No clinical performance or diagnostic accuracy is measured or implied.',
        totals: { analyses: totalAnalyses, patients: totals[0], records: totals[1], images: totals[2], users: totals[3], syntheticAnalyses: syntheticCount },
        outcomes: statusGroups.map((g) => ({ name: g.status, value: g._count._all })),
        modes: modeGroups.map((g) => ({ name: g.mode, value: g._count._all })),
        latency: {
          sampleSize: latencies.length,
          avgMs: avg === null ? null : Math.round(avg),
          p50Ms: percentile(latencies, 50),
          p95Ms: percentile(latencies, 95),
          minMs: latencies[0] ?? null,
          maxMs: latencies[latencies.length - 1] ?? null,
        },
        models: modelGroups.map((g) => ({ name: g.modelName ?? 'unknown', version: g.modelVersion ?? 'unknown', count: g._count._all })),
        trends: series.map(({ _lat, ...s }) => ({ ...s, avgLatencyMs: _lat.length ? Math.round(average(_lat)!) : null })),
        modalityDistribution: modalityGroups.map((g) => ({ name: g.modality, value: g._count._all })),
        cohortDistribution: cohortGroups.map((g) => ({ name: g.researchCohort, value: g._count._all })).sort((a, b) => b.value - a.value),
        topLabels: [...labelCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value })),
      },
    });
  }),
);
