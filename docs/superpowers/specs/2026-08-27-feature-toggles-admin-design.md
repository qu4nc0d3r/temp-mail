# Feature Toggles từ Admin Panel — Design Spec

Ngày: 2026-08-27
Trạng thái: Approved
Liên quan: temp-mail (Cloudflare Worker + Hono + D1, Vue 3 SPA)

## Mục tiêu

Cho phép admin bật/tắt 4 tính năng ngay từ admin panel (không cần deploy, không cần sửa env):
reCAPTCHA bảo vệ, tạo mailbox mới, giới hạn tốc độ, tên tùy chỉnh. Config hiện tại (`GET /api/admin/config`) là chỉ đọc, lấy toàn bộ từ env — thay bằng hệ thống cờ runtime lưu trong D1, có env làm mặc định.

## Quyết định đã chốt

- **Lưu trữ:** bảng `settings` (key-value) trong D1 — đã có binding D1, không cần thêm KV.
- **Mặc định:** bảng rỗng = dùng mặc định. `mailbox_create`, `rate_limit`, `custom_name` mặc định **bật**; `recaptcha` mặc định **theo env** (có `RECAPTCHA_SECRET_KEY` + `RECAPTCHA_SITE_KEY` hay không — giữ hành vi hiện tại).
- **"Reset về mặc định"** = xóa row khỏi bảng `settings`.
- **Chế độ bảo trì** (`mailbox_create` tắt): chỉ chặn tạo mailbox mới (POST `/api/mailbox`); mailbox hiện có vẫn đọc/đổi hạn/xóa bình thường.
- **Ghi log:** mỗi lần bật/tắt/reset ghi event `config_changed` vào `admin_events`.
- **Xác nhận:** tắt cờ bảo vệ (recaptcha, rate_limit, mailbox_create) phải qua ConfirmDialog trong UI.
- **Frontend công khai:** `GET /api/config` trả thêm cờ hiệu lực để UI ẩn ô "Custom address" khi tắt, hiện thông báo khi bảo trì.
- **Ngôn ngữ UI:** tiếng Việt (nhất quán với dashboard hiện tại).

## 1. Lưu trữ — migration `0003_settings.sql`

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,   -- '1' | '0'
  updated_at INTEGER NOT NULL
);
```

Keys:
- `feature.recaptcha`
- `feature.mailbox_create`
- `feature.rate_limit`
- `feature.custom_name`

Không seed dữ liệu lúc migrate — bảng rỗng chính là trạng thái mặc định.

## 2. Backend (Worker)

### 2.1 `src/lib/features.ts` (mới)

- Type `FeatureKey = 'recaptcha' | 'mailbox_create' | 'rate_limit' | 'custom_name'` và `FeatureKeyPublic = 'recaptcha' | 'mailbox_create' | 'custom_name'` (rate_limit không cần frontend công khai).
- `resolveFeatureFlags(db, env): Promise<FeatureFlags>` — đọc toàn bộ `feature.%` từ `settings`, trả về:
  - `effective: Record<FeatureKey, boolean>` — row tồn tại → dùng row; không → mặc định (recaptcha theo env, còn lại `true`).
  - `override: Record<FeatureKey, boolean | null>` — row tồn tại → `'1'/'0'`; không → `null` (đang theo mặc định).
  - `isDefault(key): boolean`.
- `FEATURE_KEYS` whitelist, `FEATURE_DEFAULTS`.
- parse `'1'`/`'0'` → boolean; giá trị lạ coi như mặc định.

### 2.2 `src/db/queries.ts` — helper settings

- `getSettings(db): Promise<Record<string, string>>` — `SELECT key, value FROM settings`.
- `setSetting(db, key, value): Promise<void>` — `INSERT ... ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`.
- `deleteSetting(db, key): Promise<void>`.

### 2.3 `src/routes/admin.ts` — endpoint config có thể ghi

Đã qua `requireAdmin` (middleware hiện có).

- `GET /api/admin/config` → mở rộng:
  ```json
  {
    "domain": "...",
    "devBypassEnabled": false,
    "features": [
      { "key": "recaptcha",     "enabled": true, "isDefault": true },
      { "key": "mailbox_create", "enabled": true, "isDefault": false },
      { "key": "rate_limit",     "enabled": true, "isDefault": true },
      { "key": "custom_name",    "enabled": true, "isDefault": false }
    ]
  }
  ```
- `PUT /api/admin/config/features` — body `{ key, enabled }`. Validate `key ∈ FEATURE_KEYS`, `enabled` là boolean. Upsert `'1'/'0'`. Ghi `logEvent(db, { type: 'config_changed', detail: '<key>=<on|off>' })`. Trả về config đã cập nhật (như GET).
- `DELETE /api/admin/config/features/:key` — reset về mặc định. Validate key. `deleteSetting`. Ghi event `detail: '<key>=default'`. Trả về config đã cập nhật.
- Cập nhật `EVENT_TYPES` thêm `'config_changed'`.

### 2.4 `src/routes/mailbox.ts` — áp dụng cờ (POST `/`)

Thứ tự kiểm tra (lấy `FeatureFlags` một lần ở đầu route):

1. `mailbox_create` tắt → `throw ApiError(403, 'MAINTENANCE', 'Tạm ngưng tạo mailbox mới')`. Không ghi event (tránh spam khi bị flood).
2. `recaptcha` bật → `verifyRecaptcha` như hiện tại; fail → log `recaptcha_failed` + 403. Cờ tắt → bỏ qua hoàn toàn (không gọi Google, không event).
3. `rate_limit` bật → `checkAndRecordUsage`; chặn → log `rate_limited` + 429. Cờ tắt → bỏ qua.
4. `custom_name` tắt mà `body.custom !== undefined` → `throw ApiError(403, 'CUSTOM_NAME_DISABLED', 'Tên tùy chỉnh đã bị tắt')`. Không ghi event.

Các route GET/POST extend/DELETE mailbox hiện có **không đổi** — đúng theo quyết định "chỉ chặn tạo mới".

### 2.5 `src/index.ts` — public config

`GET /api/config` → thêm:
```json
{ "recaptchaSiteKey": "...", "features": { "customName": true, "mailboxCreate": true } }
```
- `features.customName` — UI ẩn ô nhập tên khi `false`.
- `features.mailboxCreate` — UI hiện thông báo bảo trì khi `false`.
- `recaptchaSiteKey` trả `''` khi cờ `recaptcha` **tắt** (dù env có key) — `frontend/src/lib/recaptcha.ts` hiện có check site key presence, nên tự bỏ qua recaptcha, không cần sửa file này.
- Không trả `rate_limit` (không cần cho public). Không cần auth (cờ không bí mật).

### 2.6 `src/env.ts`

- `AdminEventType` thêm `'config_changed'`.
- Thêm type `FeatureKey` (hoặc dùng từ `features.ts` — tránh import vòng; đặt ở `features.ts` và import vào nơi cần).

## 3. Frontend

### 3.1 `frontend/src/api/admin.ts`

- Cập nhật `AdminConfig` → `{ domain, devBypassEnabled, features: AdminFeature[] }` với `AdminFeature = { key, enabled, isDefault }`.
- Thêm `updateFeature(key, enabled)` → `PUT /api/admin/config/features`.
- Thêm `resetFeature(key)` → `DELETE /api/admin/config/features/:key`.

### 3.2 `frontend/src/admin/views/ConfigView.vue`

- Phần "Tính năng" gồm 4 hàng toggle switch, mỗi hàng: tên, mô tả ngắn tiếng Việt, trạng thái "mặc định" (badge nhỏ), nút **reset** khi `!isDefault`.
- Tắt cờ bảo vệ (recaptcha, rate_limit, mailbox_create) → ConfirmDialog cảnh báo hậu quả trước khi gọi API.
- Dùng `useAdminPolling` hiện có để load config; sau khi PUT/DELETE → refresh.
- Giữ nguyên phần thông tin chỉ đọc (domain, devBypass, cron).
- Toast/feedback khi thành công/thất bại (dùng `useToast` có sẵn ở `frontend/src/composables/useToast.ts`).

### 3.3 Frontend công khai — `api/client.ts` / `App.vue` / `NewAddressModal.vue`

- `api/client.ts`: thêm `getPublicConfig()` → `GET /api/config` trả `{ recaptchaSiteKey, features }`. (Hiện `/api/config` chỉ được `lib/recaptcha.ts` gọi lazy để lấy site key.)
- `App.vue`: fetch `getPublicConfig()` lúc mount (cache trong module/composable), truyền xuống. Khi `features.mailboxCreate === false` → hiện banner bảo trì + vô hiệu hóa nút tạo mới.
- `NewAddressModal.vue`: thêm prop `customNameEnabled`; khi `false` ẩn ô nhập tên, submit trực tiếp với tên ngẫu nhiên.
- `lib/recaptcha.ts`: `getRecaptchaToken` trả `''` khi site key rỗng (cờ recaptcha tắt) thay vì throw — backend tự quyết định theo cờ.

### 3.4 `AbuseView.vue`

- Thêm option `config_changed` vào dropdown lọc sự kiện (cùng `rate_limited`, `recaptcha_failed`) để admin xem lịch sử bật/tắt.

## 4. Testing

- **Worker** (Vitest + @cloudflare/vitest-pool-workers, pattern `tests/`):
  - `features.ts`: mặc định (bảng rỗng), override từ row, recaptcha mặc định theo env (có/không secret), giá trị `'1'/'0'` lạ.
  - `admin.ts`: PUT/DELETE config — cần auth, key không hợp lệ → 400, upsert/reset đúng, event `config_changed` được ghi, response shape.
  - `mailbox.ts`: `mailbox_create` tắt → 403 MAINTENANCE (và không verify recaptcha); `recaptcha` tắt → request không token vẫn qua; `rate_limit` tắt → không bị chặn dù vượt 20/h; `custom_name` tắt + gửi `custom` → 403; các route đọc/xóa/đổi hạn vẫn chạy khi bảo trì.
  - `index.ts`: `GET /api/config` trả đúng shape cờ.
- **Frontend** (@vue/test-utils + happy-dom, pattern `frontend/src/**/*.spec.ts`):
  - `ConfigView`: render 4 toggle, trạng thái mặc định, confirm khi tắt cờ bảo vệ, gọi `updateFeature`/`resetFeature`, refresh sau khi đổi.
  - `NewAddressModal`: ẩn ô tên khi `customNameEnabled=false`.
  - `App`: hiện banner bảo trì khi `mailboxCreate=false`.

## 5. Files touched (ước lượng)

- `migrations/0003_settings.sql` (mới)
- `src/lib/features.ts` (mới)
- `src/env.ts`, `src/db/queries.ts`, `src/routes/admin.ts`, `src/routes/mailbox.ts`, `src/index.ts`
- `tests/features.test.ts` (mới), `tests/admin.test.ts`, `tests/api.mailbox.test.ts`, `tests/api.public.test.ts` (nếu có)
- `frontend/src/api/admin.ts`, `frontend/src/api/client.ts`
- `frontend/src/admin/views/ConfigView.vue`, `frontend/src/admin/views/AbuseView.vue`
- `frontend/src/App.vue`, `frontend/src/components/NewAddressModal.vue`
- `docs/deployment.md` (ghi chú tính năng mới nếu cần)

## Non-goals

- Không thêm cờ chỉnh **ngưỡng** rate-limit (20/h) — chỉ bật/tắt. Mở rộng sau nếu cần.
- Không thêm toggle cho cron, domain, admin auth — ngoài phạm vi.
- Không thêm vue-router, không đổi cơ chế đăng nhập admin.
- Không xoá/sửa cấu hình từ nơi khác ngoài admin API.
