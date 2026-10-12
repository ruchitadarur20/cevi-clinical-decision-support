import { prisma } from './prisma';
import { logger } from './logger';

/** Best-effort audit trail. A logging failure must never fail the user's request. */
export async function recordActivity(entry: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
}) {
  try {
    await prisma.activityLog.create({ data: { ...entry, summary: entry.summary.slice(0, 255) } });
  } catch (err) {
    logger.error('activity_log_failed', { action: entry.action, err: (err as Error).message });
  }
}
