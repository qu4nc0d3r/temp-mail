import { cleanupExpired } from './db/queries';
import type { Env } from './env';

export async function scheduled(_controller: ScheduledController, env: Env): Promise<void> {
  await cleanupExpired(env.DB, Date.now());
}
