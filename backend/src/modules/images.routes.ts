import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { asyncHandler, pageMeta, paginationSchema, param } from '../lib/http';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import { AppError, notFound } from '../lib/errors';
import { patientRef } from '../lib/serializers';
import { recordActivity } from '../lib/activity';
import { sanitizeFilename, validateImage } from '../lib/imageValidation';
import type { StorageProvider } from '../lib/storage';

const modality = z.enum(['XRAY', 'CT', 'MRI', 'ULTRASOUND', 'DERMATOSCOPY', 'OTHER']);
const status = z.enum(['UPLOADED', 'ANALYZING', 'ANALYZED', 'FAILED']);

const listQuery = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  patientId: z.string().uuid().optional(),
  modality: modality.optional(),
  status: status.optional(),
});

const uploadFields = z.object({
  patientId: z.string().uuid('A valid patient is required'),
  modality: modality.default('OTHER'),
  description: z.string().trim().max(500).optional(),
});

const include = {
  patient: { select: { id: true, syntheticId: true, firstName: true, lastName: true } },
  uploadedBy: { select: { id: true, name: true } },
  _count: { select: { analyses: true } },
} satisfies Prisma.MedicalImageInclude;

type ImageRow = Prisma.MedicalImageGetPayload<{ include: typeof include }>;

const serialize = (i: ImageRow, role: Parameters<typeof patientRef>[1]) => ({
  id: i.id,
  originalName: i.originalName,
  mimeType: i.mimeType,
  sizeBytes: i.sizeBytes,
  width: i.width,
  height: i.height,
  sha256: i.sha256,
  modality: i.modality,
  description: i.description,
  processingStatus: i.processingStatus,
  isSynthetic: i.isSynthetic,
  createdAt: i.createdAt,
  patient: patientRef(i.patient, role),
  uploadedBy: i.uploadedBy,
  analysisCount: i._count.analyses,
});

export function createImagesRouter(storage: StorageProvider) {
  const router = Router();
  router.use(authenticate);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10 },
  });

  router.get(
    '/',
    requirePermission('images:read'),
    validate({ query: listQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, q, patientId, modality: mod, status: st } = req.query as unknown as z.infer<typeof listQuery>;
      const where: Prisma.MedicalImageWhereInput = {
        ...(q ? { OR: [{ originalName: { contains: q } }, { description: { contains: q } }, { patient: { syntheticId: { contains: q } } }] } : {}),
        ...(patientId ? { patientId } : {}),
        ...(mod ? { modality: mod } : {}),
        ...(st ? { processingStatus: st } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.medicalImage.count({ where }),
        prisma.medicalImage.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      res.json({ data: rows.map((r) => serialize(r, req.user!.role)), meta: pageMeta(page, pageSize, total) });
    }),
  );

  router.post(
    '/',
    requirePermission('images:write'),
    upload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file) throw new AppError(422, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'file', message: 'An image file is required' }]);
      const parsed = uploadFields.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(422, 'VALIDATION_ERROR', 'Request validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
      const fields = parsed.data;

      const patient = await prisma.patient.findUnique({ where: { id: fields.patientId } });
      if (!patient) throw new AppError(422, 'VALIDATION_ERROR', 'Request validation failed', [{ field: 'patientId', message: 'Patient does not exist' }]);

      const meta = validateImage(req.file.buffer);
      await storage.put(meta.storageKey, req.file.buffer);
      const image = await prisma.medicalImage.create({
        data: {
          patientId: patient.id,
          uploadedById: req.user!.id,
          originalName: sanitizeFilename(req.file.originalname),
          storageKey: meta.storageKey,
          mimeType: meta.mimeType,
          sizeBytes: req.file.size,
          width: meta.width,
          height: meta.height,
          sha256: meta.sha256,
          modality: fields.modality,
          description: fields.description || null,
        },
        include,
      });
      await recordActivity({ actorId: req.user!.id, action: 'image.upload', entityType: 'Patient', entityId: patient.id, summary: `Uploaded image ${image.originalName} for ${patient.syntheticId}` });
      res.status(201).json({ data: serialize(image, req.user!.role) });
    }),
  );

  router.get(
    '/:id',
    requirePermission('images:read'),
    asyncHandler(async (req, res) => {
      const image = await prisma.medicalImage.findUnique({ where: { id: param(req, 'id') }, include });
      if (!image) throw notFound('Image');
      const analyses = await prisma.analysisResult.findMany({
        where: { imageId: image.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, status: true, mode: true, modelName: true, modelVersion: true, inferenceMs: true, createdAt: true },
      });
      res.json({ data: { ...serialize(image, req.user!.role), analyses } });
    }),
  );

  // Authenticated file delivery - images are never exposed as public static files.
  router.get(
    '/:id/file',
    requirePermission('images:read'),
    asyncHandler(async (req, res) => {
      const image = await prisma.medicalImage.findUnique({ where: { id: param(req, 'id') } });
      if (!image) throw notFound('Image');
      let data: Buffer;
      try {
        data = await storage.get(image.storageKey);
      } catch {
        throw notFound('Image file');
      }
      res.setHeader('Content-Type', image.mimeType);
      res.setHeader('Content-Length', data.length);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(data);
    }),
  );

  return router;
}
