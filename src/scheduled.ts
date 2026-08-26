import { cleanupExpired, logEvent, pruneEvents } from './db/queries';
import type { Env } from './env';

const EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function scheduled(_controller: ScheduledController, env: Env): Promise<void> {
  const nowMs = Date.now();
  const cleanup = await cleanupExpired(env.DB, nowMs);
  try {
    await logEvent(env.DB, {
      type: 'cron_cleanup',
      detail: `mailboxes=${cleanup.deletedMailboxes} messages=${cleanup.deletedMessages}`,
    });
    await pruneEvents(env.DB, nowMs - EVENT_RETENTION_MS);
  } catch {
    // nhật ký admin không được làm hỏng cron cleanup chính
  }
}
