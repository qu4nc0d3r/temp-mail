-- admin_events: nhật ký sự kiện cho dashboard admin (lạm dụng + sức khỏe hệ thống).
CREATE TABLE IF NOT EXISTS admin_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,  -- 'mailbox_created' | 'rate_limited' | 'recaptcha_failed' | 'cron_cleanup'
  ip_hash    TEXT,
  address    TEXT,
  detail     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_events_created_at ON admin_events(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_events_type ON admin_events(type);
