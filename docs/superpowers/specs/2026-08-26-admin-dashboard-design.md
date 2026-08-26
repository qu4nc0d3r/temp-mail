# Admin Dashboard — Design Spec

Ngày: 2026-08-26
Trạng thái: Approved
Liên quan: temp-mail (Cloudflare Worker + Hono + D1, Vue 3 SPA)

## Mục tiêu

Xây dựng trang dashboard admin chuyên nghiệp, tiếng Việt, kết nối dữ liệu thật từ D1, bảo vệ bằng Cloudflare Access. Hiển thị: KPI + system health, charts (thời gian, top), bảng mailbox/messages gần đây, abuse monitoring.

## Quyết định đã chốt

- **Nguồn dữ liệu:** thật, từ backend qua admin API mới.
- **Auth:** Cloudflare Access ở edge (`/admin*`); backend tự verify JWT của Access (không tin header mù).
- **Charts:** Chart.js + vue-chartjs (dependency mới).
- **Ngôn ngữ UI:** tiếng Việt.
- **Abuse tracking:** thêm bảng `admin_events` (migration D1) ghi rate-limit bị chặn, reCAPTCHA fail, mailbox tạo mới.
- **Kiến trúc frontend:** một SPA, view admin dưới path `/admin`, phân nhánh trong `main.ts`.

## 1. Xác thực admin (backend)

Middleware `requireAdmin` áp cho toàn bộ `/api/admin/*`.

1. Đọc header `Cf-Access-Jwt-Assertion`. Thiếu → `401`.
2. Verify chữ ký **ES256** bằng Web Crypto (`crypto.subtle.importKey` + `verify`), public keys lấy từ `https://<ACCESS_TEAM_DOMAIN>.cloudflareaccess.com/cdn-cgi/access/certs`, cache trong worker ~5 phút (biến module-level với timestamp).
3. Verify claims: `aud` == `ACCESS_APP_AUD`, `exp` > now, `nbf` <= now, `iss` thuộc domain team.
4. Pass → tiếp tục. Fail bất kỳ bước nào → `401 UNAUTHORIZED`.

Không thêm dependency (tự viết JWT verifier ~100 dòng, theo triết lý dependency-light của dự án).

**Env mới:**
- `ACCESS_TEAM_DOMAIN: string` — tên team CF Access (vd `toolviet.cloudflareaccess.com`).
- `ACCESS_APP_AUD: string` — Audience tag của Access application.
- `ADMIN_DEV_BYPASS?: string` — khi `== "true"`, middleware bỏ qua verify (chỉ dùng môi trường dev local, ghi rõ trong docs).

Thêm vào `src/env.ts`, `wrangler.toml` `[vars]`, `.dev.vars.example`.

## 2. Database — migration `0002_admin_event_log.sql`

```sql
CREATE TABLE IF NOT EXISTS admin_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,              -- 'mailbox_created' | 'rate_limited' | 'recaptcha_failed' | 'cron_cleanup'
  ip_hash TEXT,
  address TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_events_created_at ON admin_events(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_events_type ON admin_events(type);
```

**Instrumentation** — tất cả ở tầng route `src/routes/mailbox.ts` + `src/scheduled.ts` (bọc try/catch — không làm hỏng luồng chính nếu insert lỗi):
- `POST /api/mailbox` tạo thành công → type `mailbox_created`, ghi `address`, `ip_hash` (đã hash tại route).
- Trong cùng route, khi `verifyRecaptcha` trả `false` → type `recaptcha_failed`, ghi `ip_hash` trước khi throw `ApiError`.
- Khi `checkAndRecordUsage` trả `false` (bị chặn) → type `rate_limited`, `ip_hash`, `detail` = `'per_hour_limit'`.
- Cron mỗi lần chạy → type `cron_cleanup`, `detail` = `"mailboxes=X messages=Y"` (số đã dọn). Event này cũng là nguồn duy nhất cho `lastCronRunAt` + counts ở `/overview` (đọc event `cron_cleanup` mới nhất).

**Pruning:** cron hàng phút xóa `admin_events` có `created_at` cũ hơn 7 ngày. Thêm helper `pruneEvents` trong `src/db/queries.ts`, gọi từ `src/scheduled.ts` (sau `cleanupExpired`).

## 3. Admin API

Tất cả `/api/admin/*` đi qua `requireAdmin`. Thêm `adminRoutes` trong `src/routes/admin.ts`, mount trong `src/index.ts` trước `app.all('*')`.

| Endpoint | Trả về |
|---|---|
| `GET /api/admin/overview` | KPI: `activeMailboxes`, `messages24h`, `mailPerMinute`, `mailboxesCreated24h`, `rateLimited24h`, `rateLimited7d`, `recaptchaFailed24h`, `recaptchaFailed7d`; health: `lastCronRunAt`, `lastCronCleanup {deletedMailboxes, deletedMessages}`, `serverTime` |
| `GET /api/admin/stats?range=24h\|7d` | Chuỗi thời gian theo bucket: `{ t, messages, mailboxes, rateLimited, recaptchaFailed }[]`. `24h` → bucket 15 phút (96 điểm); `7d` → bucket 6 giờ (28 điểm) |
| `GET /api/admin/top?by=senders\|ips&limit=10` | `senders`: top `from_addr` theo số message (24h); `ips`: top `ip_hash` theo số mailbox tạo (24h) |
| `GET /api/admin/events?type=&limit=&offset=` | `{ events, total, limit, offset }` — event feed phân trang, `type` optional filter |
| `GET /api/admin/mailboxes?limit=&offset=` | `{ mailboxes, total, limit, offset }` — mới nhất trước, không kèm `token_hash` |
| `GET /api/admin/messages?limit=&offset=` | `{ messages, total, limit, offset }` — mới nhất trước, không kèm body HTML đầy đủ (chỉ preview) |
| `GET /api/admin/config` | `{ domain, recaptchaEnabled, devBypassEnabled }` — `devBypassEnabled` = trạng thái `ADMIN_DEV_BYPASS` (cảnh báo khi bật) |

**Giới hạn:** `limit` mặc định 20, tối đa 100. `offset` mặc định 0. Validation input ở mọi endpoint.

**Bảo mật:** không bao giờ trả `token_hash`, `SALT_*`, `RECAPTCHA_SECRET_KEY`, `SALT_IP`.

## 4. Frontend — view `/admin`

**Routing:** `main.ts` đọc `window.location.pathname`; `startsWith('/admin')` → mount `AdminApp` (thay `App`). SPA fallback của wrangler (`single-page-application`) đã serve index.html cho `/admin`.

**Cấu trúc `frontend/src/admin/`:**
- `AdminApp.vue` — shell: sidebar fixed (logo, nav: Tổng quan / Mailbox / Messages / Lạm dụng / Cấu hình), topbar (auto-refresh 30s + nút refresh + trạng thái poll), main content. Dừng poll khi `document.hidden`.
- `StatCard.vue` — KPI card (label, value, delta/trend, icon).
- `TimeSeriesChart.vue` — Chart.js line/area: messages + mailbox theo thời gian (2 dataset), dùng range 24h/7d switcher.
- `TopBarChart.vue` — Chart.js bar ngang: top senders / top IPs (switch tab).
- `DataTable.vue` — bảng dùng chung + phân trang (limit/offset).
- `HealthPanel.vue` — cron status, thời điểm chạy cuối, số đã dọn, config chỉ đọc.
- `api/admin.ts` — typed client (fetch + JSON, lỗi thành `AdminApiError`).

**Views (nav):**
1. **Tổng quan:** StatCards + TimeSeriesChart + HealthPanel.
2. **Mailbox:** DataTable (address, created_at, expires_at, còn sống/hết hạn).
3. **Messages:** DataTable (from_addr, subject, received_at).
4. **Lạm dụng:** TopBarChart (senders/ips) + DataTable event feed (filter theo type) + stat cards rateLimited/recaptchaFailed.
5. **Cấu hình:** HealthPanel mở rộng, config chỉ đọc.

**Giao diện:** tiếng Việt, bám CSS variables hiện có trong `frontend/src/styles/main.css`, tông tối chuyên nghiệp, sidebar fixed, responsive (mobile: topbar + hamburger toggle sidebar). Dùng skill `frontend-design` + `dataviz` khi implement để đảm bảo visual nhất quán và chart đúng chuẩn.

**Format thời gian:** admin cần format ngày giờ tuyệt đối tiếng Việt (vd `24/08/2026 14:32`) — thêm `formatDateTimeVN` vào `frontend/src/lib/format.ts` (giữ `formatRelativeTime` hiện tại cho inbox).

## 5. Testing

- **Worker** (Vitest + @cloudflare/vitest-pool-workers, theo pattern `tests/`):
  - JWT middleware: thiếu token → 401, sai chữ ký → 401, hết hạn → 401, hợp lệ → pass. Bypass mode dev.
  - Từng endpoint admin: trả đúng shape, validation limit/offset, không leak `token_hash`.
  - Instrumentation: tạo mailbox ghi `mailbox_created`; rate-limit ghi `rate_limited`; recaptcha fail ghi `recaptcha_failed`.
  - Pruning cron: xóa event > 7 ngày.
- **Frontend** (@vue/test-utils + happy-dom, theo pattern `frontend/src/**/*.spec.ts`):
  - Mock `vue-chartjs` (Chart.js khó chạy trong happy-dom).
  - Mỗi view render đúng khi API trả dữ liệu mẫu; xử lý lỗi API (hiện toast/message); phân trang đúng.
  - `main.ts` branch đúng component theo pathname (test mount).

## 6. Files touched (ước lượng)

- `migrations/0002_admin_event_log.sql` (mới)
- `src/env.ts`, `src/index.ts`, `src/routes/admin.ts` (mới), `src/db/queries.ts`, `src/routes/mailbox.ts`, `src/lib/auth.ts` (mới), `src/lib/access-jwt.ts` (mới), `src/scheduled.ts`
- `tests/admin.test.ts` (mới), `tests/api.mailbox.test.ts` (instrumentation), `tests/scheduled.test.ts` (pruning)
- `frontend/src/main.ts`, `frontend/src/admin/**` (mới), `frontend/src/api/admin.ts` (mới), `frontend/src/styles/main.css`, `frontend/src/lib/format.ts`
- `package.json` (thêm `chart.js`, `vue-chartjs`), `wrangler.toml`, `.dev.vars.example`, `docs/deployment.md`

## Non-goals

- Không thêm user/role hệ thống — CF Access là tầng duy nhất kiểm soát ai vào admin.
- Không xoá/sửa mailbox, message từ dashboard (chỉ đọc) — nằm ngoài phạm vi phiên bản đầu.
- Không hiển thị IP gốc (chỉ `ip_hash` rút gọn) — bảo mật dữ liệu.
- Không thêm vue-router.
