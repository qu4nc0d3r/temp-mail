import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

export async function setupDb(): Promise<D1Database> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS as unknown as D1Migration[]);
  await resetDb(env.DB);
  return env.DB;
}

export async function resetDb(db: D1Database): Promise<void> {
  await db.exec('DELETE FROM messages; DELETE FROM ip_usage; DELETE FROM mailboxes; DELETE FROM admin_events; DELETE FROM settings;');
}
