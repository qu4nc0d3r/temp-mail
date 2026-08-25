import { describe, it, expect, beforeEach } from 'vitest';
import { setupDb } from './helpers/db';
import {
  createMailbox, getActiveMailbox, extendMailbox, deleteMailbox,
  listMessages, getMessage, insertMessage, cleanupExpired, checkAndRecordUsage,
} from '../src/db/queries';

let db: D1Database;
const NOW = 1_700_000_000_000;
const TTL = 10 * 60 * 1000;

beforeEach(async () => {
  db = await setupDb();
});

describe('mailboxes', () => {
  it('create + get active mailbox', async () => {
    const ok = await createMailbox(db, 'a@tempmail.test', 'h', NOW, NOW + TTL);
    expect(ok).toBe(true);
    const m = await getActiveMailbox(db, 'a@tempmail.test', NOW + 1000);
    expect(m?.address).toBe('a@tempmail.test');
    expect(m?.expires_at).toBe(NOW + TTL);
  });

  it('create duplicate returns false', async () => {
    await createMailbox(db, 'a@tempmail.test', 'h', NOW, NOW + TTL);
    const ok = await createMailbox(db, 'a@tempmail.test', 'h2', NOW, NOW + TTL);
    expect(ok).toBe(false);
  });

  it('getActiveMailbox returns null after expiry', async () => {
    await createMailbox(db, 'a@tempmail.test', 'h', NOW, NOW + TTL);
    expect(await getActiveMailbox(db, 'a@tempmail.test', NOW + TTL + 1)).toBeNull();
  });

  it('extendMailbox updates expiry, no-op when expired', async () => {
    await createMailbox(db, 'a@tempmail.test', 'h', NOW, NOW + TTL);
    const extended = await extendMailbox(db, 'a@tempmail.test', NOW + 5 * 60 * 1000, NOW + 60 * 1000);
    expect(extended).toBe(true);
    // query trước mốc hết hạn 1s (expires_at > nowMs, nên ở đúng mốc là hết hạn)
    const m = await getActiveMailbox(db, 'a@tempmail.test', NOW + 5 * 60 * 1000 - 1000);
    expect(m?.expires_at).toBe(NOW + 5 * 60 * 1000);
    // hết hạn: extend không tác dụng
    const noop = await extendMailbox(db, 'a@tempmail.test', NOW + 999999, NOW + TTL + 1);
    expect(noop).toBe(false);
  });

  it('deleteMailbox removes mailbox and its messages', async () => {
    await createMailbox(db, 'a@tempmail.test', 'h', NOW, NOW + TTL);
    await insertMessage(db, {
      id: 'm1', mailbox: 'a@tempmail.test', fromName: null, fromAddr: 's@x.com',
      subject: 'S', preview: 'p', htmlBody: null, textBody: 'b', attachmentsCount: 0, receivedAt: NOW,
    });
    await deleteMailbox(db, 'a@tempmail.test');
    expect(await getActiveMailbox(db, 'a@tempmail.test', NOW)).toBeNull();
    expect(await listMessages(db, 'a@tempmail.test', NOW)).toEqual([]);
  });
});

describe('messages', () => {
  beforeEach(async () => {
    await createMailbox(db, 'in@tempmail.test', 'h', NOW, NOW + TTL);
  });

  it('insert + list newest first', async () => {
    await insertMessage(db, {
      id: 'm1', mailbox: 'in@tempmail.test', fromName: null, fromAddr: 'a@x.com',
      subject: 'first', preview: 'p1', htmlBody: null, textBody: 'b1', attachmentsCount: 0, receivedAt: NOW,
    });
    await insertMessage(db, {
      id: 'm2', mailbox: 'in@tempmail.test', fromName: 'Bob', fromAddr: 'b@x.com',
      subject: 'second', preview: 'p2', htmlBody: '<b>hi</b>', textBody: 'b2', attachmentsCount: 2, receivedAt: NOW + 100,
    });
    const list = await listMessages(db, 'in@tempmail.test', NOW + 200);
    expect(list.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(list[0].from_name).toBe('Bob');
  });

  it('getMessage returns full detail', async () => {
    await insertMessage(db, {
      id: 'm1', mailbox: 'in@tempmail.test', fromName: 'Alice', fromAddr: 'a@x.com',
      subject: 'hi', preview: 'p', htmlBody: '<b>x</b>', textBody: 'x', attachmentsCount: 1, receivedAt: NOW,
    });
    const detail = await getMessage(db, 'm1', 'in@tempmail.test', NOW + 100);
    expect(detail?.html_body).toBe('<b>x</b>');
    expect(detail?.attachments_count).toBe(1);
  });

  it('getMessage returns null for wrong mailbox or after expiry', async () => {
    await insertMessage(db, {
      id: 'm1', mailbox: 'in@tempmail.test', fromName: null, fromAddr: 'a@x.com',
      subject: 'hi', preview: 'p', htmlBody: null, textBody: 'x', attachmentsCount: 0, receivedAt: NOW,
    });
    expect(await getMessage(db, 'm1', 'other@tempmail.test', NOW)).toBeNull();
    expect(await getMessage(db, 'm1', 'in@tempmail.test', NOW + TTL + 1)).toBeNull();
  });
});

describe('cleanupExpired', () => {
  it('deletes expired mailboxes and their messages', async () => {
    await createMailbox(db, 'old@tempmail.test', 'h', NOW - TTL - 1000, NOW - 1000);
    await insertMessage(db, {
      id: 'm1', mailbox: 'old@tempmail.test', fromName: null, fromAddr: 'a@x.com',
      subject: 'hi', preview: 'p', htmlBody: null, textBody: 'x', attachmentsCount: 0, receivedAt: NOW - 2000,
    });
    await createMailbox(db, 'live@tempmail.test', 'h', NOW, NOW + TTL);
    const result = await cleanupExpired(db, NOW);
    expect(result.deletedMailboxes).toBe(1);
    expect(result.deletedMessages).toBe(1);
    expect(await getActiveMailbox(db, 'live@tempmail.test', NOW)).not.toBeNull();
  });
});

describe('checkAndRecordUsage', () => {
  it('allows up to limit then blocks', async () => {
    for (let i = 0; i < 20; i++) {
      expect(await checkAndRecordUsage(db, 'ip1', NOW)).toBe(true);
    }
    expect(await checkAndRecordUsage(db, 'ip1', NOW)).toBe(false);
    // cửa sổ mới
    expect(await checkAndRecordUsage(db, 'ip1', NOW + 60 * 60 * 1000)).toBe(true);
  });

  it('tracks ips independently', async () => {
    await checkAndRecordUsage(db, 'ip1', NOW);
    expect(await checkAndRecordUsage(db, 'ip2', NOW)).toBe(true);
  });
});
