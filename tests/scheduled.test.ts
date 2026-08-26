import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { setupDb } from './helpers/db';
import { scheduled } from '../src/scheduled';
import { createMailbox, getActiveMailbox, listMessages, logEvent, pruneEvents } from '../src/db/queries';

const NOW = Date.now();

beforeEach(async () => {
  await setupDb();
});

describe('scheduled handler', () => {
  it('cleans expired mailboxes and messages', async () => {
    const expired = `old@${env.DOMAIN}`;
    await createMailbox(env.DB, expired, 'h', NOW - 20 * 60 * 1000, NOW - 10 * 60 * 1000);
    await env.DB.prepare(
      `INSERT INTO messages (id, mailbox, from_name, from_addr, subject, preview, text_body, received_at)
       VALUES ('m1', ?, NULL, 'a@x.com', 's', 'p', 'b', ?)`,
    ).bind(expired, NOW - 20 * 60 * 1000).run();

    const live = `live@${env.DOMAIN}`;
    await createMailbox(env.DB, live, 'h', NOW, NOW + 10 * 60 * 1000);

    await scheduled({ noop() {} } as unknown as ScheduledController, env);

    expect(await getActiveMailbox(env.DB, expired, NOW)).toBeNull();
    expect(await getActiveMailbox(env.DB, live, NOW)).not.toBeNull();
    expect(await listMessages(env.DB, expired, NOW)).toEqual([]);
  });
});

describe('scheduled admin bookkeeping', () => {
  it('writes a cron_cleanup event and prunes old events', async () => {
    const OLD = NOW - 8 * 24 * 60 * 60 * 1000;
    await logEvent(env.DB, { type: 'mailbox_created', ipHash: 'old-ip', createdAtMs: OLD });
    await logEvent(env.DB, { type: 'mailbox_created', ipHash: 'new-ip', createdAtMs: NOW });

    await scheduled({ noop() {} } as unknown as ScheduledController, env);

    const cleanup = await env.DB.prepare(`SELECT detail FROM admin_events WHERE type = 'cron_cleanup' ORDER BY id DESC LIMIT 1`).first<{ detail: string }>();
    expect(cleanup?.detail).toMatch(/^mailboxes=\d+ messages=\d+$/);
    const old = await env.DB.prepare(`SELECT COUNT(*) AS c FROM admin_events WHERE ip_hash = 'old-ip'`).first<{ c: number }>();
    expect(old?.c).toBe(0);
    const fresh = await env.DB.prepare(`SELECT COUNT(*) AS c FROM admin_events WHERE ip_hash = 'new-ip'`).first<{ c: number }>();
    expect(fresh?.c).toBe(1);
  });
});
