-- settings: cài đặt runtime mà admin chỉnh từ admin panel.
-- Không có row = dùng mặc định (xem src/lib/features.ts).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,   -- '1' | '0'
  updated_at INTEGER NOT NULL
);
