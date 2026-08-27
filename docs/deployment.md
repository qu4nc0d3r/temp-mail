# Deployment — Temp Mail

## 1. Tạo D1 database

```bash
npx wrangler d1 create temp-mail
```

Sao chép `database_id` từ output vào `wrangler.toml` (field `[[d1_databases]].database_id`).

## 2. Cấu hình domain + salts

- `DOMAIN` trong `[vars]` wrangler.toml là **đuôi địa chỉ mail** (nơi Email Routing nhận),
  vd `toolviet.net` → địa chỉ dạng `kx9m2p@toolviet.net`.
  *(URL web mà người dùng truy cập là chuyện khác — cấu hình sau deploy qua Workers Custom Domain.)*
- `SALT_TOKEN` / `SALT_IP` là **muối hash** (token hộp thư / IP rate-limit) — nên là chuỗi ngẫu nhiên dài,
  sinh bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- Đặt trong `[vars]` wrangler.toml là ổn cho repo riêng tư. Nếu repo sắp public, chuyển sang secret:
  `npx wrangler secret put SALT_TOKEN` (secret ghi đè var cùng tên).

> ⚠️ **Quan trọng:** Không đổi `SALT_TOKEN` sau khi đã có người dùng tạo hộp thư —
> token hash trong DB sẽ không khớp nữa, mọi inbox hiện tại không đọc được. Chốt trước khi go-live.

## 3. Deploy

```bash
npm run deploy   # = vite build + wrangler deploy
```

## 4. Email Routing (dashboard)

1. Vào Cloudflare Dashboard → Email → Email Routing → Enable (Cloudflare tự tạo MX + SPF).
2. Tab Routing rules → **Catch-all** → action = **Send to a Worker** → chọn `temp-mail`.
3. Verify MX/SPF DNS records hoạt động (Email Routing dashboard hiển thị trạng thái).

## 5. Kiểm tra end-to-end

- Mở site, copy địa chỉ, gửi email từ Gmail → mail xuất hiện trong inbox trong vòng vài giây (poll 5s).
- Thử: tên custom, extend, xoá, hết hạn 10 phút, rate limit 20/h.

## Xác thực admin (Admin API key)

1. Tạo khóa mạnh: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Set secret (KHÔNG đặt trong wrangler.toml `[vars]`):
   `npx wrangler secret put ADMIN_API_KEY`
3. Truy cập `https://<domain>/admin` → nhập khóa → được cấp session 2 giờ
   (HMAC-SHA256, tự lưu trong sessionStorage). Đăng xuất hoặc hết hạn → nhập lại.
4. Chỉ set `ADMIN_DEV_BYPASS=true` ở .dev.vars local — KHÔNG đặt ở production.
   Nếu lỡ bật ở production, dashboard hiển thị cảnh báo đỏ trên trang Tổng quan.

## Lưu ý

- Email Routing chỉ nhận — dịch vụ này **không gửi mail đi**.
- Attachment không được lưu (chỉ đếm số lượng).
- Cron `* * * * *` tự động chạy trên Cloudflare sau deploy — không cần cấu hình thêm.
