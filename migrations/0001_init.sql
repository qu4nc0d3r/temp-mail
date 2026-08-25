-- mailboxes: hộp thư tạm. address là PK, token_hash lưu SHA-256 của token.
CREATE TABLE IF NOT EXISTS mailboxes (
  address    TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mailboxes_expires ON mailboxes(expires_at);

-- messages: mail đã nhận. Không dùng FK cascade (D1 mặc định tắt FKs) —
-- xoá theo mailbox bằng DELETE tường minh trong queries.ts.
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  mailbox    TEXT NOT NULL,
  from_name  TEXT,
  from_addr  TEXT NOT NULL,
  subject    TEXT,
  preview    TEXT,
  html_body  TEXT,
  text_body  TEXT,
  attachments_count INTEGER NOT NULL DEFAULT 0,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_mailbox ON messages(mailbox, received_at DESC);

-- ip_usage: rate limit tạo mailbox, fixed window 1 giờ.
CREATE TABLE IF NOT EXISTS ip_usage (
  ip_hash      TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0
);
