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
import { MlClientError, RESEARCH_DISCLAIMER, type MlClient } from '../lib/mlClient';
import type { StorageProvider } from '../lib/storage';
import { analysisLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const include = {
  image: {
    select: {
      id: true, originalName: true, width: true, height: true, modality: true, mimeType: true, sizeBytes: true,
      patient: { select: { id: true, syntheticId: true, firstName: true, lastName: true } },
    },
  },
  requestedBy: { select: { id: true, name: true, role: true } },
} satisfies Prisma.AnalysisResultInclude;

type Row = Prisma.AnalysisResultGetPayload<{ include: typeof include }>;

const serialize = (a: Row, role: Parameters<typeof patientRef>[1]) => ({
  id: a.id,
  status: a.status,
  mode: a.mode,
  modelName: a.modelName,
  modelVersion: a.modelVersion,
  weightsSource: a.weightsSource,
  predictions: a.predictions,
  preprocessing: a.preprocessing,
  contextSnapshot: a.contextSnapshot,
  inferenceMs: a.inferenceMs,
  totalMs: a.totalMs,
  errorMessage: a.errorMessage,
  isSynthetic: a.isSynthetic,
  createdAt: a.createdAt,
  completedAt: a.completedAt,
  requestedBy: a.requestedBy,
  image: { id: a.image.id, originalName: a.image.originalName, width: a.image.width, height: a.image.height, modality: a.image.modality, mimeType: a.image.mimeType, sizeBytes: a.image.sizeBytes },
  patient: patientRef(a.image.patient, role),
  disclaimer: RESEARCH_DISCLAIMER,
});

const listQuery = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'UNAVAILABLE']).optional(),
  mode: z.enum(['EXPERIMENTAL_INFERENCE', 'DEMONSTRATION']).optional(),
  patientId: z.string().uuid().optional(),
  imageId: z.string().uuid().optional(),
});

const createSchema = z.object({
  imageId: z.string().uuid(),
  recordIds: z.array(z.string().uuid()).max(10).default([]),
});

export function createAnalysesRouter(storage: StorageProvider, ml: MlClient) {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/',
    requirePermission('analyses:read'),
    validate({ query: listQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, q, status, mode, patientId, imageId } = req.query as unknown as z.infer<typeof listQuery>;
      const where: Prisma.AnalysisResultWhereInput = {
        ...(status ? { status } : {}),
        ...(mode ? { mode } : {}),
        ...(imageId ? { imageId } : {}),
        ...(patientId ? { image: { patientId } } : {}),
        ...(q ? { OR: [{ image: { originalName: { contains: q } } }, { image: { patient: { syntheticId: { contains: q } } } }, { modelName: { contains: q } }] } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.analysisResult.count({ where }),
        prisma.analysisResult.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      res.json({ data: rows.map((r) => serialize(r, req.user!.role)), meta: pageMeta(page, pageSize, total) });
    }),
  );

  // Operational status of the ML service + model metadata (never throws; reports availability).
  router.get(
    '/ml-status',
    requirePermission('analyses:read'),
    asyncHandler(async (_req, res) => {
      try {
        const [health, model] = await Promise.all([ml.health(), ml.model()]);
        res.json({ data: { reachable: true, health, model, disclaimer: RESEARCH_DISCLAIMER } });
      } catch (err) {
        res.json({ data: { reachable: false, error: (err as MlClientError).message, disclaimer: RESEARCH_DISCLAIMER } });
      }
    }),
  );

  // Preview the preprocessing pipeline for a stored image without running inference.
  router.post(
    '/preprocess-preview',
    requirePermission('analyses:create'),
    validate({ body: z.object({ imageId: z.string().uuid() }) }),
    asyncHandler(async (req, res) => {
      const image = await prisma.medicalImage.findUnique({ where: { id: req.body.imageId } });
      if (!image) throw notFound('Image');
      const bytes = await storage.get(image.storageKey).catch(() => {
        throw notFound('Image file');
      });
      try {
        res.json({ data: await ml.preprocess(bytes, image.originalName) });
      } catch (err) {
        throw mapMlError(err);
      }
    }),
  );

  router.post(
    '/',
    requirePermission('analyses:create'),
    analysisLimiter,
    validate({ body: createSchema }),
    asyncHandler(async (req, res) => {
      const { imageId, recordIds } = req.body as z.infer<typeof createSchema>;
      const image = await prisma.medicalImage.findUnique({ where: { id: imageId }, include: { patient: true } });
      if (!image) throw notFound('Image');

      // Structured clinical context is attached by the backend for reviewers. It is NOT a model input.
      const records = recordIds.length
        ? await prisma.clinicalRecord.findMany({ where: { id: { in: recordIds }, patientId: image.patientId } })
        : [];
      if (records.length !== recordIds.length)
        throw new AppError(422, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'recordIds', message: 'All records must belong to the image\'s patient' }]);
      const contextSnapshot = {
        patientSyntheticId: image.patient.syntheticId,
        researchCohort: image.patient.researchCohort,
        records: records.map((r) => ({ id: r.id, type: r.type, severity: r.severity, title: r.title, recordedAt: r.recordedAt })),
        note: 'Clinical context is stored with the result for reviewer reference only; the image model does not consume it.',
      };

      const started = Date.now();
      const analysis = await prisma.analysisResult.create({
        data: { imageId, requestedById: req.user!.id, status: 'PROCESSING', contextSnapshot, isSynthetic: image.isSynthetic },
      });
      await prisma.medicalImage.update({ where: { id: imageId }, data: { processingStatus: 'ANALYZING' } });

      try {
        const bytes = await storage.get(image.storageKey);
        const result = await ml.infer(bytes, image.originalName);
        await prisma.analysisResult.update({
          where: { id: analysis.id },
          data: {
            status: 'COMPLETED',
            modelName: result.model.name,
            modelVersion: result.model.version,
            weightsSource: result.model.weights_source,
            predictions: result.predictions as unknown as Prisma.InputJsonValue,
            preprocessing: result.preprocessing as Prisma.InputJsonValue,
            inferenceMs: Math.round(result.timing.inference_ms),
            totalMs: Date.now() - started,
            completedAt: new Date(),
          },
        });
        await prisma.medicalImage.update({ where: { id: imageId }, data: { processingStatus: 'ANALYZED' } });
      } catch (err) {
        const unavailable = err instanceof MlClientError && err.code === 'MODEL_WEIGHTS_UNAVAILABLE';
        const message = err instanceof MlClientError ? err.message : 'Analysis failed unexpectedly';
        logger.warn('analysis_failed', { analysisId: analysis.id, code: (err as any)?.code });
        await prisma.analysisResult.update({
          where: { id: analysis.id },
          data: { status: unavailable ? 'UNAVAILABLE' : 'FAILED', errorMessage: message.slice(0, 500), totalMs: Date.now() - started, completedAt: new Date() },
        });
        // An unavailable model or a transient ML outage does not mark the image itself as bad.
        await prisma.medicalImage.update({
          where: { id: imageId },
          data: { processingStatus: unavailable || (err instanceof MlClientError && err.code.startsWith('ML_')) ? 'UPLOADED' : 'FAILED' },
        });
      }

      const final = await prisma.analysisResult.findUniqueOrThrow({ where: { id: analysis.id }, include });
      await recordActivity({
        actorId: req.user!.id,
        action: 'analysis.request',
        entityType: 'Patient',
        entityId: image.patientId,
        summary: `Experimental analysis ${final.status.toLowerCase()} for ${image.patient.syntheticId}`,
      });
      res.status(201).json({ data: serialize(final, req.user!.role) });
    }),
  );

  router.get(
    '/:id',
    requirePermission('analyses:read'),
    asyncHandler(async (req, res) => {
      const a = await prisma.analysisResult.findUnique({ where: { id: param(req, 'id') }, include });
      if (!a) throw notFound('Analysis');
      res.json({ data: serialize(a, req.user!.role) });
    }),
  );

  return router;
}

function mapMlError(err: unknown): AppError {
  if (err instanceof MlClientError) {
    const status = err.code === 'ML_UNREACHABLE' || err.code === 'ML_TIMEOUT' || err.code === 'MODEL_WEIGHTS_UNAVAILABLE' ? 503 : err.httpStatus === 422 ? 422 : 502;
    return new AppError(status, err.code, err.message);
  }
  return new AppError(502, 'ML_ERROR', 'ML service error');
}
