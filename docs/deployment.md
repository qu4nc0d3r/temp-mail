# Deployment — Temp Mail

## 1. Tạo D1 database

```bash
npx wrangler d1 create temp-mail
```

Sao chép `database_id` từ output vào `wrangler.toml` (field `[[d1_databases]].database_id`).

## 2. Cấu hình domain + secrets

- Sửa `DOMAIN` trong `[vars]` wrangler.toml thành tên miền thật (vd `tempmail.example.com`).
- Đặt salt production (secret ghi đè var cùng tên):

```bash
npx wrangler secret put SALT_TOKEN
npx wrangler secret put SALT_IP
```

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

## Lưu ý

- Email Routing chỉ nhận — dịch vụ này **không gửi mail đi**.
- Attachment không được lưu (chỉ đếm số lượng).
- Cron `* * * * *` tự động chạy trên Cloudflare sau deploy — không cần cấu hình thêm.
