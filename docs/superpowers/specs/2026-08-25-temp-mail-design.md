# Temp Mail 10 phút — Design Document

**Ngày:** 2026-08-25
**Trạng thái:** Đã duyệt qua brainstorming (3 phần kiến trúc, data model/API, frontend)

## 1. Tổng quan

Dịch vụ temp mail công khai: người dùng vào trang là có ngay địa chỉ email tạm
trên tên miền chính (đã trỏ Cloudflare), nhận mail trong **10 phút**, hết hạn tự
vô hình. Hỗ trợ tự chọn tên hộp thư, gia hạn thêm 10 phút (tối đa 60 phút tổng).

**Mục tiêu v1:**

- Nhận mail tức thì, hiển thị danh sách + xem chi tiết HTML an toàn
- Copy + đếm ngược rõ ràng, auto-refresh không cần F5
- UI tiếng Anh, responsive mobile-first, dark mode theo hệ thống
- Chống lạm dụng cơ bản cho site công khai

**Ngoài phạm vi v1:** gửi mail đi, attachment lưu trữ/ tải xuống, nhiều ngôn ngữ,
chuyển đổi nhiều hộp thư song song, tài khoản người dùng.

## 2. Kiến trúc

Toàn bộ trên Cloudflare free tier — một Worker duy nhất:

```
Người gửi (Netflix, Google...)
        │ SMTP
        ▼
Cloudflare Email Routing (catch-all @domain)
        │ chuyển tiếp toàn bộ
        ▼
┌─────────────────────────────────────────────┐
│              Cloudflare Worker              │
│                                             │
│  • email() handler                          │
│    nhận mail → postal-mime parse            │
│    → lưu D1 nếu hộp thư còn hạn             │
│                                             │
│  • fetch() handler                          │
│    ├── static assets (Vue build)            │
│    └── JSON API (/api/*)                    │
│                                             │
│  • scheduled() cron mỗi phút                │
│    → xoá mailbox/message đã hết hạn         │
└─────────────────────────────────────────────┘
        │
        ▼
   Cloudflare D1 (SQLite)
```

**Stack:**

| Lớp | Công nghệ |
|---|---|
| Backend | TypeScript, [Hono](https://hono.dev) trên Workers |
| MIME parse | `postal-mime` |
| DB | Cloudflare D1 |
| Frontend | Vue 3 (Composition API) + Vite + TypeScript |
| Icons | `@mdi/js` + component `<MdiIcon>` inline SVG (không emoji) |
| Font | Poppins từ Google Fonts (400/500/600/700), preload + `font-display: swap` |
| Test | Vitest |

Frontend build ra static assets, phục vụ bằng Workers Assets trên cùng Worker.
Deploy bằng `wrangler deploy`.

**Luồng chính:**

1. Vào trang → kiểm tra `localStorage`: nếu còn mailbox chưa hết hạn thì dùng lại,
   không thì gọi API tạo mới → nhận `{address, token, expiresAt}`. Token chỉ
   trả về đúng một lần lúc tạo.
2. Mail đến → Email Routing đẩy vào Worker `email()` → tra D1: địa chỉ tồn tại
   và còn hạn → parse + lưu; không → nuốt im lặng (trả success để tránh bị dò).
3. Frontend poll GET messages mỗi 5 giây khi tab visible; có mail mới → toast +
   badge số trong tiêu đề tab.
4. Hết hạn → mọi query lọc `expires_at` nên biến mất tức thì; cron dọn dữ liệu.

## 3. Data model (D1)

### Bảng `mailboxes`

```sql
CREATE TABLE mailboxes (
  address    TEXT PRIMARY KEY,           -- lowercase, vd kx9m2p@domain.com
  token_hash TEXT NOT NULL,              -- SHA-256 hex của token
  created_at INTEGER NOT NULL,           -- unix ms
  expires_at INTEGER NOT NULL            -- unix ms; index riêng cho cron
);
CREATE INDEX idx_mailboxes_expires ON mailboxes(expires_at);
```

### Bảng `messages`

```sql
CREATE TABLE messages (
  id         TEXT PRIMARY KEY,           -- nanoid
  mailbox    TEXT NOT NULL REFERENCES mailboxes(address),
  from_name  TEXT,
  from_addr  TEXT NOT NULL,
  subject    TEXT,                       -- đã decode RFC 2047
  preview    TEXT,                       -- ≤200 ký tự từ text body
  html_body  TEXT,                       -- render trong iframe sandbox
  text_body  TEXT,
  received_at INTEGER NOT NULL,
  attachments_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_messages_mailbox ON messages(mailbox);
```

Attachment: chỉ đếm số lượng (`attachments_count`), hiện chú thích
"N attachments not stored" — không lưu nội dung ở v1.

### Bảng `ip_usage` (rate limit)

```sql
CREATE TABLE ip_usage (
  ip_hash    TEXT PRIMARY KEY,           -- SHA-256 của IP + salt
  window_start INTEGER NOT NULL,         -- unix ms
  count      INTEGER NOT NULL DEFAULT 0
);
```

## 4. API

Base: same-origin `/api`. Auth: header `Authorization: Bearer <token>`.
Lỗi thống nhất `{error:{code,message}}`.

| Method | Path | Body / Query | Response | Ghi chú |
|---|---|---|---|---|
| POST | `/api/mailbox` | `{custom?: string}` | `{address, token, expiresAt, serverTime}` | token trả một lần duy nhất; rate limit 20/h/IP |
| GET | `/api/mailbox/:address/messages` | Bearer | `{messages[], expiresAt, serverTime}` | messages sắp newest-first |
| GET | `/api/mailbox/:address/messages/:id` | Bearer | `{message}` — full detail `{id, fromName, fromAddr, subject, preview, htmlBody, textBody, attachmentsCount, receivedAt}` | dùng khi mở mail xem chi tiết |
| POST | `/api/mailbox/:address/extend` | Bearer | `{expiresAt}` | +10 phút, trần 60 phút tính từ created_at |
| DELETE | `/api/mailbox/:address` | Bearer | `{ok:true}` | xoá mailbox + messages ngay |
| GET | `/api/health` | — | `{ok:true}` | |

**Quy tắc nghiệp vụ:**

- Token: 32 byte random hex; lưu SHA-256 hash so sánh constant-time
- Custom name: lowercase, regex `[a-z0-9._-]{3,30}`; chặn reserved
  (`admin`, `postmaster`, `abuse`, `noreply`, `support`, `webmaster`, `hostmaster`,
  `security`, `privacy`, `contact`, `info`, `help`, `sales`, `billing`)
- Trùng địa chỉ đang còn hạn → 409; gợi ý random khác
- Mọi query mailbox/messages đều thêm `WHERE expires_at > now`
- Rate limit tạo mailbox: 20/giờ/IP (bảng `ip_usage`, **fixed window 1 giờ**
  bắt đầu từ request tạo đầu tiên của IP)

**HTTP status:** 400 tên sai định dạng · 401 sai/thiếu token · 404 không tìm thấy
hoặc đã hết hạn · 409 trùng · 429 vượt rate limit · 500 lỗi hệ thống.

## 5. Frontend

### Bố cục một màn hình

```
┌────────────────────────────────────────────┐
│  FlashBox          [10-min temp mail]      │  header
├────────────────────────────────────────────┤
│  YOUR TEMPORARY ADDRESS                    │
│  kx9m2p@yourdomain.com          [copy]     │
│  ⏱ Expires in 09:42   [+10 min] [delete]  │  countdown vàng→đỏ <2 phút
│────────────────────────────────────────────│
│  INBOX (3)                      [refresh]  │
│  ● Netflix     Your code is 482919    12s  │
│    Netflix     ...preview...          1m   │
│  Bấm mail → modal chi tiết                 │
└────────────────────────────────────────────┘
```

*(Tên sản phẩm "FlashBox" là placeholder — user có thể đổi sau.)*

### Thành phần & hành vi

- `<MdiIcon :path="...">`: inline SVG từ `@mdi/js`; icon cho copy, refresh,
  clock, mail, trash, close, alert… — **không dùng emoji**
- **Toast system** tự viết: composable `useToast()` + `<ToastContainer>`;
  4 loại success/error/warning/info với icon MDI riêng, progress bar,
  auto-dismiss ~4s, stack góc phải, animation trượt
- **AppModal**: Teleport, backdrop mờ, đóng ESC/X/click-outside, khoá scroll,
  focus trap cơ bản
- **apiClient** tự viết bọc fetch: inject Bearer, JSON encode/decode,
  timeout 10s bằng AbortController, chuẩn hoá lỗi `{code,message}`,
  exports `get/post/del` typed — không axios
- Auto-refresh poll 5s, dừng khi tab ẩn (`visibilitychange`);
  tiêu đề tab `(1)` nhấp nháy khi có mail mới
- Countdown lấy mốc từ `serverTime` (offset tính một lần) — không lệch giờ máy
- Custom name: input mở khi bấm Edit, validate client-side trước khi gửi
- Trạng thái: active / expiring (<2 phút, đỏ) / expired → nút tạo địa chỉ mới
- Dark mode theo `prefers-color-scheme`

### Responsive (mobile-first)

- Breakpoints: `<640px` mobile · `640–1024px` tablet · `>1024px` desktop
- Mobile: địa chỉ ellipsis + nút copy to riêng; list full-width;
  modal chi tiết thành bottom-sheet; nút hành động xếp dọc nếu chật
- Desktop: max-width ~720px căn giữa; hover states đầy đủ
- Touch targets ≥44px; chữ dùng `clamp()`

### Render HTML mail an toàn

Chi tiết mail hiển thị trong `<iframe sandbox srcdoc=...>`:
không script, không navigation ra ngoài; link được chặn/mở tab mới với
`rel="noopener noreferrer"`. Không bao giờ `v-html` nội dung mail trực tiếp.

## 6. Xử lý lỗi

**Backend:** mọi lỗi `{error:{code,message}}` + status đúng như bảng trên.
Mail đến địa chỉ lạ → nuốt im lặng. Cron xoá hàng hết hạn mỗi phút.

**Frontend:** lỗi mạng → toast error + retry; 401 → về màn hình hết hạn;
offline → banner. Polling backoff nhẹ khi lỗi liên tiếp.

## 7. Testing

- **Vitest backend:** tạo địa chỉ (random/custom/trùng/reserved/sai format),
  xác thực token (đúng/sai/hết hạn), TTL filter mọi endpoint, extend trần 60',
  rate limit, parse MIME cơ bản
- **Vue component tests:** countdown format, copy action, toast lifecycle,
  apiClient error normalization
- **Thủ công:** `wrangler dev` + gửi mail giả lập (curl SMTP-less qua
  `wrangler dev --test-scheduled` và unit test email handler); kiểm tra
  responsive 3 breakpoint bằng DevTools device emulation

## 8. Cấu hình & triển khai

- `wrangler.toml`: binding D1, assets dir, cron trigger `* * * * *`;
  Worker export handler `email()` — nhận mail được bật bằng **Email Routing
  catch-all rule → Worker** trên Cloudflare dashboard (không cần binding riêng)
- DNS: Cloudflare tự tạo MX/SPF khi bật Email Routing catch-all → Worker
  (domain KHÔNG có mail thật — an toàn bật catch-all)
- Secrets: `SALT_IP_HASH` qua `wrangler secret put`
- Deploy: `npm run build && wrangler deploy`
