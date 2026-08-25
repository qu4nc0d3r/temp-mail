import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { setupDb } from './helpers/db';
import { scheduled } from '../src/scheduled';
import { createMailbox, getActiveMailbox, listMessages } from '../src/db/queries';

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
