import type { MessageDetail, MessageSummary, MailboxRecord, NewMessage } from '../env';

const DEFAULT_LIST_LIMIT = 50;

export async function createMailbox(
  db: D1Database,
  address: string,
  tokenHash: string,
  createdAtMs: number,
  expiresAtMs: number,
): Promise<boolean> {
  const res = await db
    .prepare('INSERT OR IGNORE INTO mailboxes (address, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(address, tokenHash, createdAtMs, expiresAtMs)
    .run();
  return res.meta.changes === 1;
}

export async function getActiveMailbox(db: D1Database, address: string, nowMs: number): Promise<MailboxRecord | null> {
  return (
    (await db
      .prepare('SELECT address, token_hash, created_at, expires_at FROM mailboxes WHERE address = ? AND expires_at > ?')
      .bind(address, nowMs)
      .first<MailboxRecord>()) ?? null
  );
}

export async function extendMailbox(db: D1Database, address: string, newExpiresAtMs: number, nowMs: number): Promise<boolean> {
  const res = await db
    .prepare('UPDATE mailboxes SET expires_at = ? WHERE address = ? AND expires_at > ?')
    .bind(newExpiresAtMs, address, nowMs)
    .run();
  return res.meta.changes === 1;
}

export async function deleteMailbox(db: D1Database, address: string): Promise<void> {
  await db.prepare('DELETE FROM messages WHERE mailbox = ?').bind(address).run();
  await db.prepare('DELETE FROM mailboxes WHERE address = ?').bind(address).run();
}

export async function listMessages(db: D1Database, address: string, nowMs: number): Promise<MessageSummary[]> {
  const res = await db
    .prepare(
      `SELECT id, from_name, from_addr, subject, preview, received_at
       FROM messages
       WHERE mailbox = ? AND mailbox IN (SELECT address FROM mailboxes WHERE expires_at > ?)
       ORDER BY received_at DESC
       LIMIT ?`,
    )
    .bind(address, nowMs, DEFAULT_LIST_LIMIT)
    .all<MessageSummary>();
  return res.results;
}

export async function getMessage(db: D1Database, messageId: string, address: string, nowMs: number): Promise<MessageDetail | null> {
  return (
    (await db
      .prepare(
        `SELECT m.id, m.from_name, m.from_addr, m.subject, m.preview,
                m.html_body, m.text_body, m.attachments_count, m.received_at
         FROM messages m
         JOIN mailboxes b ON b.address = m.mailbox
         WHERE m.id = ? AND m.mailbox = ? AND b.expires_at > ?`,
      )
      .bind(messageId, address, nowMs)
      .first<MessageDetail>()) ?? null
  );
}

export async function insertMessage(db: D1Database, data: NewMessage): Promise<void> {
  await db
    .prepare(
      `INSERT INTO messages
        (id, mailbox, from_name, from_addr, subject, preview, html_body, text_body, attachments_count, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.id, data.mailbox, data.fromName, data.fromAddr, data.subject, data.preview,
      data.htmlBody, data.textBody, data.attachmentsCount, data.receivedAt,
    )
    .run();
}

export async function cleanupExpired(db: D1Database, nowMs: number): Promise<{ deletedMailboxes: number; deletedMessages: number }> {
  const msg = await db
    .prepare('DELETE FROM messages WHERE mailbox NOT IN (SELECT address FROM mailboxes WHERE expires_at > ?)')
    .bind(nowMs)
    .run();
  const box = await db.prepare('DELETE FROM mailboxes WHERE expires_at <= ?').bind(nowMs).run();
  return { deletedMailboxes: box.meta.changes, deletedMessages: msg.meta.changes };
}

export async function checkAndRecordUsage(
  db: D1Database,
  ipHash: string,
  nowMs: number,
  limit = 20,
  windowMs = 60 * 60 * 1000,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT window_start, count FROM ip_usage WHERE ip_hash = ?')
    .bind(ipHash)
    .first<{ window_start: number; count: number }>();
  if (!row) {
    await db.prepare('INSERT INTO ip_usage (ip_hash, window_start, count) VALUES (?, ?, 1)').bind(ipHash, nowMs).run();
    return true;
  }
  if (nowMs - row.window_start >= windowMs) {
    await db.prepare('UPDATE ip_usage SET window_start = ?, count = 1 WHERE ip_hash = ?').bind(nowMs, ipHash).run();
    return true;
  }
  if (row.count >= limit) return false;
  await db.prepare('UPDATE ip_usage SET count = count + 1 WHERE ip_hash = ?').bind(ipHash).run();
  return true;
}
