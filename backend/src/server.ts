import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info('server_started', { port: env.PORT, env: env.NODE_ENV });
  console.log(`CEVI API listening on http://localhost:${env.PORT}`);
});
server.requestTimeout = env.REQUEST_TIMEOUT_MS + 5000;

const shutdown = async (signal: string) => {
  logger.info('shutdown', { signal });
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
