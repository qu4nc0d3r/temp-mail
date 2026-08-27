import type { AdminEventRow, AdminEventType, AdminMailboxRow, AdminMessageRow, AdminOverview, MessageDetail, MessageSummary, MailboxRecord, NewMessage, StatsPoint } from '../env';

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

export async function logEvent(
  db: D1Database,
  e: { type: AdminEventType; ipHash?: string | null; address?: string | null; detail?: string | null; createdAtMs?: number },
): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO admin_events (type, ip_hash, address, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(e.type, e.ipHash ?? null, e.address ?? null, e.detail ?? null, e.createdAtMs ?? Date.now())
      .run();
  } catch {
    // nhật ký admin không được làm hỏng luồng chính — nuốt lỗi
  }
}

export async function pruneEvents(db: D1Database, beforeMs: number): Promise<number> {
  const res = await db.prepare('DELETE FROM admin_events WHERE created_at < ?').bind(beforeMs).run();
  return res.meta.changes;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getAdminOverview(db: D1Database, nowMs: number): Promise<AdminOverview> {
  const [active, messages24h, created24h, rl24, rl7, rf24, rf7, lastCleanup] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM mailboxes WHERE expires_at > ?').bind(nowMs).first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) AS c FROM messages WHERE received_at >= ?').bind(nowMs - DAY_MS).first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) AS c FROM mailboxes WHERE created_at >= ?').bind(nowMs - DAY_MS).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM admin_events WHERE type = 'rate_limited' AND created_at >= ?`).bind(nowMs - DAY_MS).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM admin_events WHERE type = 'rate_limited' AND created_at >= ?`).bind(nowMs - 7 * DAY_MS).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM admin_events WHERE type = 'recaptcha_failed' AND created_at >= ?`).bind(nowMs - DAY_MS).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM admin_events WHERE type = 'recaptcha_failed' AND created_at >= ?`).bind(nowMs - 7 * DAY_MS).first<{ c: number }>(),
    db.prepare(`SELECT created_at, detail FROM admin_events WHERE type = 'cron_cleanup' ORDER BY created_at DESC, id DESC LIMIT 1`).first<{ created_at: number; detail: string }>(),
  ]);
  const cnt = (r: { c: number } | null) => r?.c ?? 0;
  let deletedMailboxes = 0;
  let deletedMessages = 0;
  if (lastCleanup?.detail) {
    const m = /mailboxes=(\d+) messages=(\d+)/.exec(lastCleanup.detail);
    if (m) {
      deletedMailboxes = Number(m[1]);
      deletedMessages = Number(m[2]);
    }
  }
  const messages = cnt(messages24h);
  return {
    activeMailboxes: cnt(active),
    messages24h: messages,
    mailPerMinute: Math.round((messages / 1440) * 10000) / 10000,
    mailboxesCreated24h: cnt(created24h),
    rateLimited24h: cnt(rl24),
    rateLimited7d: cnt(rl7),
    recaptchaFailed24h: cnt(rf24),
    recaptchaFailed7d: cnt(rf7),
    lastCronRunAt: lastCleanup?.created_at ?? null,
    lastCronCleanup: lastCleanup ? { deletedMailboxes, deletedMessages } : null,
    serverTime: nowMs,
  };
}

async function bucketCount(
  db: D1Database,
  sql: string,
  startMs: number,
  bucketMs: number,
): Promise<Map<number, number>> {
  const res = await db.prepare(sql).bind(bucketMs, bucketMs, startMs).all<{ t: number; c: number }>();
  return new Map(res.results.map((r) => [r.t, r.c]));
}

export async function getStatsSeries(
  db: D1Database,
  nowMs: number,
  rangeMs: number,
  bucketMs: number,
): Promise<StatsPoint[]> {
  const startMs = nowMs - rangeMs;
  const [messages, mailboxes, rateLimited, recaptchaFailed] = await Promise.all([
    // D1/SQLite chia kiểu REAL cho `/`, nên `(ts / ?) * ?` trả về đúng ts chứ
    // không phải bội của bucketMs. Bọc CAST(... AS INTEGER) để khóa bucket
    // khớp `Math.floor(ts/bucketMs)*bucketMs` — cùng pha với endBucket ở dưới.
    bucketCount(db, 'SELECT CAST((received_at / ?) AS INTEGER) * ? AS t, COUNT(*) AS c FROM messages WHERE received_at >= ? GROUP BY t', startMs, bucketMs),
    bucketCount(db, 'SELECT CAST((created_at / ?) AS INTEGER) * ? AS t, COUNT(*) AS c FROM mailboxes WHERE created_at >= ? GROUP BY t', startMs, bucketMs),
    bucketCount(db, `SELECT CAST((created_at / ?) AS INTEGER) * ? AS t, COUNT(*) AS c FROM admin_events WHERE type = 'rate_limited' AND created_at >= ? GROUP BY t`, startMs, bucketMs),
    bucketCount(db, `SELECT CAST((created_at / ?) AS INTEGER) * ? AS t, COUNT(*) AS c FROM admin_events WHERE type = 'recaptcha_failed' AND created_at >= ? GROUP BY t`, startMs, bucketMs),
  ]);
  // Neo bucket tại biên `floor(nowMs/bucketMs)*bucketMs` (khớp với SQL đã CAST
  // ở trên) rồi lùi dần về quá khứ — nếu neo tại startMs sẽ lệch pha, mọi
  // bucket SQL không khớp → toàn 0.
  const endBucket = Math.floor(nowMs / bucketMs) * bucketMs;
  const points: StatsPoint[] = [];
  for (let t = endBucket; t > startMs; t -= bucketMs) {
    points.unshift({
      t,
      messages: messages.get(t) ?? 0,
      mailboxes: mailboxes.get(t) ?? 0,
      rateLimited: rateLimited.get(t) ?? 0,
      recaptchaFailed: recaptchaFailed.get(t) ?? 0,
    });
  }
  return points;
}

export async function getTopSenders(db: D1Database, nowMs: number, limit: number): Promise<{ label: string; count: number }[]> {
  const res = await db
    .prepare('SELECT from_addr, COUNT(*) AS count FROM messages WHERE received_at >= ? GROUP BY from_addr ORDER BY count DESC, from_addr ASC LIMIT ?')
    .bind(nowMs - DAY_MS, limit)
    .all<{ from_addr: string; count: number }>();
  return res.results.map((r) => ({ label: r.from_addr, count: r.count }));
}

export async function getTopIpHashes(db: D1Database, nowMs: number, limit: number): Promise<{ label: string; count: number }[]> {
  const res = await db
    .prepare(`SELECT ip_hash, COUNT(*) AS count FROM admin_events WHERE type = 'mailbox_created' AND created_at >= ? GROUP BY ip_hash ORDER BY count DESC, ip_hash ASC LIMIT ?`)
    .bind(nowMs - DAY_MS, limit)
    .all<{ ip_hash: string | null; count: number }>();
  return res.results.map((r) => ({ label: r.ip_hash ?? '', count: r.count }));
}

export async function listMailboxes(db: D1Database, limit: number, offset: number): Promise<{ items: AdminMailboxRow[]; total: number }> {
  const [res, total] = await Promise.all([
    db.prepare('SELECT address, created_at, expires_at FROM mailboxes ORDER BY created_at DESC, address ASC LIMIT ? OFFSET ?').bind(limit, offset).all<AdminMailboxRow>(),
    db.prepare('SELECT COUNT(*) AS c FROM mailboxes').first<{ c: number }>(),
  ]);
  return { items: res.results, total: total?.c ?? 0 };
}

const MESSAGE_SORT_COLUMNS = ['received_at', 'from_addr', 'subject', 'mailbox'] as const;
type MessageSortKey = (typeof MESSAGE_SORT_COLUMNS)[number];

export interface ListRecentMessagesOptions {
  q?: string | null;
  mailbox?: string | null;
  sortBy?: string;
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export async function listRecentMessages(db: D1Database, opts: ListRecentMessagesOptions): Promise<{ items: AdminMessageRow[]; total: number }> {
  const q = opts.q?.trim() || null;
  const mailbox = opts.mailbox?.trim() || null;
  // Whitelist cột sort — giá trị này ghép thẳng vào SQL nên không được phép
  // lọt tùy ý từ client (giống cách /events coerce type không hợp lệ về null).
  const sortBy: MessageSortKey = MESSAGE_SORT_COLUMNS.includes(opts.sortBy as MessageSortKey) ? (opts.sortBy as MessageSortKey) : 'received_at';
  const order = opts.order === 'asc' ? 'ASC' : 'DESC';

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    where.push('(from_addr LIKE ? OR from_name LIKE ? OR subject LIKE ? OR mailbox LIKE ? OR preview LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (mailbox) {
    where.push('mailbox = ?');
    params.push(mailbox);
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  const [res, total] = await Promise.all([
    db.prepare(`SELECT id, mailbox, from_name, from_addr, subject, preview, received_at FROM messages${whereSql} ORDER BY ${sortBy} ${order}, id DESC LIMIT ? OFFSET ?`).bind(...params, opts.limit, opts.offset).all<AdminMessageRow>(),
    db.prepare(`SELECT COUNT(*) AS c FROM messages${whereSql}`).bind(...params).first<{ c: number }>(),
  ]);
  return { items: res.results, total: total?.c ?? 0 };
}

export async function getAdminMessage(db: D1Database, id: string): Promise<MessageDetail | null> {
  return (
    (await db
      .prepare('SELECT id, mailbox, from_name, from_addr, subject, preview, html_body, text_body, attachments_count, received_at FROM messages WHERE id = ?')
      .bind(id)
      .first<MessageDetail>()) ?? null
  );
}

export async function listEvents(
  db: D1Database,
  type: AdminEventType | null,
  limit: number,
  offset: number,
): Promise<{ items: AdminEventRow[]; total: number }> {
  const where = type ? ' WHERE type = ?' : '';
  const params: unknown[] = type ? [type] : [];
  const [res, total] = await Promise.all([
    db.prepare(`SELECT id, type, ip_hash, address, detail, created_at FROM admin_events${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all<AdminEventRow>(),
    db.prepare(`SELECT COUNT(*) AS c FROM admin_events${where}`).bind(...params).first<{ c: number }>(),
  ]);
  return { items: res.results, total: total?.c ?? 0 };
}

export async function getSettings(db: D1Database): Promise<Record<string, string>> {
  const res = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  return Object.fromEntries(res.results.map((r) => [r.key, r.value]));
}

export async function setSetting(db: D1Database, key: string, value: string, nowMs: number = Date.now()): Promise<void> {
  await db
    .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(key, value, nowMs)
    .run();
}

export async function deleteSetting(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
}
