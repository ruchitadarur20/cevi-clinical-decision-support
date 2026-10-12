import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env, isTest } from './config/env';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { HttpMlClient, type MlClient } from './lib/mlClient';
import { LocalDiskStorage, type StorageProvider } from './lib/storage';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { authRouter } from './modules/auth.routes';
import { usersRouter } from './modules/users.routes';
import { patientsRouter } from './modules/patients.routes';
import { recordsRouter } from './modules/records.routes';
import { createImagesRouter } from './modules/images.routes';
import { createAnalysesRouter } from './modules/analyses.routes';
import { analyticsRouter } from './modules/analytics.routes';
import { activityRouter, dashboardRouter } from './modules/dashboard.routes';
import { searchRouter } from './modules/search.routes';

export interface AppDeps {
  storage?: StorageProvider;
  ml?: MlClient;
}

export function createApp(deps: AppDeps = {}) {
  const storage = deps.storage ?? new LocalDiskStorage(env.STORAGE_DIR);
  const ml = deps.ml ?? new HttpMlClient();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  // Request timeout + metadata-only access log (path only: no query strings, bodies or headers).
  app.use((req, res, next) => {
    const started = Date.now();
    res.setTimeout(env.REQUEST_TIMEOUT_MS, () => {
      if (!res.headersSent) res.status(504).json({ error: { code: 'TIMEOUT', message: 'Request timed out' } });
    });
    res.on('finish', () =>
      logger.info('request', { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started, user: req.user?.id }),
    );
    next();
  });

  app.get('/api/health', async (_req, res) => {
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'unavailable';
    }
    let mlStatus: 'ok' | 'degraded' | 'unreachable';
    try {
      const h = await ml.health();
      mlStatus = h.model_ready === true ? 'ok' : 'degraded';
    } catch {
      mlStatus = 'unreachable';
    }
    const healthy = db === 'ok';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? (mlStatus === 'ok' ? 'ok' : 'degraded') : 'down',
      uptimeSeconds: Math.round(process.uptime()),
      services: { api: 'ok', database: db, mlService: mlStatus },
      version: '1.0.0',
    });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/patients', patientsRouter);
  app.use('/api/records', recordsRouter);
  app.use('/api/images', createImagesRouter(storage));
  app.use('/api/analyses', createAnalysesRouter(storage, ml));
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/search', searchRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export { isTest };
