# Feature Toggles từ Admin Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép admin bật/tắt 4 tính năng (reCAPTCHA, tạo mailbox, giới hạn tốc độ, tên tùy chỉnh) ngay từ admin panel, lưu trong D1.

**Architecture:** Bảng `settings` (key-value) trong D1 lưu override của 4 cờ; không có row = dùng mặc định (recaptcha theo env secret, 3 cờ còn lại bật). Lib `src/lib/features.ts` resolve giá trị hiệu lực; admin API có GET/PUT/DELETE; route mailbox và `/api/config` công khai đọc cờ hiệu lực. Frontend admin thành danh sách toggle; frontend công khai ẩn ô tên tùy chỉnh / hiện banner bảo trì.

**Tech Stack:** Cloudflare Worker + Hono + D1, Vue 3 + TypeScript, Vitest (@cloudflare/vitest-pool-workers + @vue/test-utils/happy-dom).

**Spec:** `docs/superpowers/specs/2026-08-27-feature-toggles-admin-design.md`

## Global Constraints

- Key cờ: `feature.recaptcha`, `feature.mailbox_create`, `feature.rate_limit`, `feature.custom_name`. Giá trị lưu `'1'`/`'0'`.
- Mặc định: `recaptcha` = `Boolean(RECAPTCHA_SECRET_KEY && RECAPTCHA_SITE_KEY)`; `mailbox_create`/`rate_limit`/`custom_name` = `true`. `isDefault = true` khi không có row override.
- Admin API: PUT `{ key, enabled }` upsert + ghi event `config_changed`; DELETE `:key` reset + ghi event. Key không hợp lệ → 400 `INVALID_KEY`.
- Mailbox POST thứ tự check: (1) `mailbox_create` tắt → 403 `MAINTENANCE`; (2) `recaptcha` bật → verify, tắt → bỏ qua; (3) `rate_limit` bật → `checkAndRecordUsage`; (4) `custom_name` tắt + gửi `custom` → 403 `CUSTOM_NAME_DISABLED`. Route đọc/đổi hạn/xóa KHÔNG đổi.
- Public `/api/config` trả `{ recaptchaSiteKey, features: { customName, mailboxCreate } }`; `recaptchaSiteKey = ''` khi cờ recaptcha tắt.
- Trong test (miniflare binding): `RECAPTCHA_SECRET_KEY: ''`, `RECAPTCHA_SITE_KEY: 'test-site-key'`, `ADMIN_DEV_BYPASS: 'true'` → mặc định recaptcha = OFF, admin không cần token.
- `EventType` hợp lệ: `['mailbox_created','rate_limited','recaptcha_failed','cron_cleanup','config_changed']`.
- UI admin tiếng Việt. Test chạy: worker `npm run test:worker` (hoặc `npx vitest run tests/<file>`), frontend `npm run test:frontend` (hoặc `npx vitest run --config vitest.frontend.config.ts frontend/<file>`).
- Mỗi task commit riêng với trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

### Task 1: Lưu trữ settings (migration + db helpers + test helper)

**Files:**
- Create: `migrations/0003_settings.sql`
- Modify: `src/db/queries.ts` (append cuối file)
- Modify: `tests/helpers/db.ts`
- Modify: `tests/db.test.ts`

**Interfaces:**
- Produces:
  - `getSettings(db: D1Database): Promise<Record<string, string>>`
  - `setSetting(db: D1Database, key: string, value: string, nowMs?: number): Promise<void>`
  - `deleteSetting(db: D1Database, key: string): Promise<void>`
  - `resetDb` (helper) xóa thêm `settings`.

- [ ] **Step 1: Viết migration**

Create `migrations/0003_settings.sql`:
```sql
-- settings: cài đặt runtime mà admin chỉnh từ admin panel.
-- Không có row = dùng mặc định (xem src/lib/features.ts).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,   -- '1' | '0'
  updated_at INTEGER NOT NULL
);
```

- [ ] **Step 2: Thêm 3 helper vào `src/db/queries.ts`** (append cuối file, sau `listEvents`):

```ts
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
```

- [ ] **Step 3: Cập nhật `tests/helpers/db.ts`** — resetDb xóa luôn `settings`:

```ts
export async function resetDb(db: D1Database): Promise<void> {
  await db.exec('DELETE FROM messages; DELETE FROM ip_usage; DELETE FROM mailboxes; DELETE FROM admin_events; DELETE FROM settings;');
}
```

- [ ] **Step 4: Viết test cho helpers** — thêm describe vào `tests/db.test.ts` (import `getSettings, setSetting, deleteSetting` vào dòng 3-7):

```ts
describe('settings', () => {
  it('setSetting upserts and getSettings reads back', async () => {
    await setSetting(db, 'feature.custom_name', '0');
    expect(await getSettings(db)).toEqual({ 'feature.custom_name': '0' });
    await setSetting(db, 'feature.custom_name', '1');
    expect(await getSettings(db)).toEqual({ 'feature.custom_name': '1' });
  });

  it('deleteSetting removes a key', async () => {
    await setSetting(db, 'feature.custom_name', '0');
    await deleteSetting(db, 'feature.custom_name');
    expect(await getSettings(db)).toEqual({});
  });
});
```

- [ ] **Step 5: Chạy test worker**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS (cả 2 test mới + các test cũ không đổi hành vi).

- [ ] **Step 6: Commit**

```bash
git add migrations/0003_settings.sql src/db/queries.ts tests/helpers/db.ts tests/db.test.ts
git commit -m "feat(settings): settings table + get/set/delete helpers

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Lib resolve feature flags

**Files:**
- Create: `src/lib/features.ts`
- Create: `tests/features.test.ts`

**Interfaces:**
- Consumes: `getSettings` (Task 1), `Env` (`src/env.ts`).
- Produces:
  - `export const FEATURE_KEYS = ['recaptcha','mailbox_create','rate_limit','custom_name'] as const`
  - `export type FeatureKey = (typeof FEATURE_KEYS)[number]`
  - `export interface FeatureFlag { key: FeatureKey; enabled: boolean; isDefault: boolean }`
  - `export function parseFlagValue(value: string | undefined): boolean | null`
  - `export function defaultFor(key: FeatureKey, env: Env): boolean`
  - `export async function resolveFeatureFlags(db: D1Database, env: Env): Promise<FeatureFlag[]>`

- [ ] **Step 1: Viết test fail** — create `tests/features.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { setupDb } from './helpers/db';
import { setSetting } from '../src/db/queries';
import { resolveFeatureFlags, defaultFor, parseFlagValue } from '../src/lib/features';
import type { Env } from '../src/env';

beforeEach(async () => {
  await setupDb();
});

describe('parseFlagValue', () => {
  it('parses 1/0 and null otherwise', () => {
    expect(parseFlagValue('1')).toBe(true);
    expect(parseFlagValue('0')).toBe(false);
    expect(parseFlagValue('x')).toBeNull();
    expect(parseFlagValue(undefined)).toBeNull();
  });
});

describe('defaultFor', () => {
  it('defaults non-recaptcha features to true', () => {
    expect(defaultFor('mailbox_create', env as unknown as Env)).toBe(true);
    expect(defaultFor('rate_limit', env as unknown as Env)).toBe(true);
    expect(defaultFor('custom_name', env as unknown as Env)).toBe(true);
  });

  it('defaults recaptcha from env secrets', () => {
    expect(defaultFor('recaptcha', { ...env, RECAPTCHA_SECRET_KEY: '', RECAPTCHA_SITE_KEY: 'k' } as unknown as Env)).toBe(false);
    expect(defaultFor('recaptcha', { ...env, RECAPTCHA_SECRET_KEY: 's', RECAPTCHA_SITE_KEY: 'k' } as unknown as Env)).toBe(true);
  });
});

describe('resolveFeatureFlags', () => {
  it('returns defaults when settings empty', async () => {
    const flags = await resolveFeatureFlags(env.DB, env as unknown as Env);
    expect(flags).toHaveLength(4);
    expect(flags.find((f) => f.key === 'mailbox_create')).toEqual({ key: 'mailbox_create', enabled: true, isDefault: true });
    expect(flags.find((f) => f.key === 'rate_limit')).toEqual({ key: 'rate_limit', enabled: true, isDefault: true });
    expect(flags.find((f) => f.key === 'custom_name')).toEqual({ key: 'custom_name', enabled: true, isDefault: true });
    expect(flags.find((f) => f.key === 'recaptcha')?.isDefault).toBe(true);
  });

  it('respects overrides from settings', async () => {
    await setSetting(env.DB, 'feature.mailbox_create', '0');
    await setSetting(env.DB, 'feature.rate_limit', '0');
    const flags = await resolveFeatureFlags(env.DB, env as unknown as Env);
    expect(flags.find((f) => f.key === 'mailbox_create')).toEqual({ key: 'mailbox_create', enabled: false, isDefault: false });
    expect(flags.find((f) => f.key === 'rate_limit')).toEqual({ key: 'rate_limit', enabled: false, isDefault: false });
  });

  it('treats a recaptcha override as authoritative', async () => {
    await setSetting(env.DB, 'feature.recaptcha', '1');
    const flags = await resolveFeatureFlags(env.DB, env as unknown as Env);
    expect(flags.find((f) => f.key === 'recaptcha')).toEqual({ key: 'recaptcha', enabled: true, isDefault: false });
  });
});
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run tests/features.test.ts`
Expected: FAIL (module `../src/lib/features` chưa tồn tại).

- [ ] **Step 3: Viết implementation** — create `src/lib/features.ts`:

```ts
import type { Env } from '../env';
import { getSettings } from '../db/queries';

export const FEATURE_KEYS = ['recaptcha', 'mailbox_create', 'rate_limit', 'custom_name'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface FeatureFlag {
  key: FeatureKey;
  enabled: boolean;
  isDefault: boolean;
}

const DEFAULT_ON: readonly FeatureKey[] = ['mailbox_create', 'rate_limit', 'custom_name'];

export function parseFlagValue(value: string | undefined): boolean | null {
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
}

export function defaultFor(key: FeatureKey, env: Env): boolean {
  if (key === 'recaptcha') return Boolean(env.RECAPTCHA_SECRET_KEY && env.RECAPTCHA_SITE_KEY);
  return (DEFAULT_ON as readonly string[]).includes(key);
}

export async function resolveFeatureFlags(db: D1Database, env: Env): Promise<FeatureFlag[]> {
  const settings = await getSettings(db);
  return FEATURE_KEYS.map((key) => {
    const parsed = parseFlagValue(settings[`feature.${key}`]);
    if (parsed === null) return { key, enabled: defaultFor(key, env), isDefault: true };
    return { key, enabled: parsed, isDefault: false };
  });
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run tests/features.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features.ts tests/features.test.ts
git commit -m "feat(features): resolve runtime feature flags from D1 settings

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Admin API — config features (GET mở rộng, PUT, DELETE)

**Files:**
- Modify: `src/env.ts`
- Modify: `src/routes/admin.ts`
- Modify: `tests/admin.test.ts`

**Interfaces:**
- Consumes: `resolveFeatureFlags` (Task 2), `setSetting`/`deleteSetting` (Task 1), `logEvent` (đã có trong `src/db/queries.ts`), `ApiError` (đã có).
- Produces:
  - `GET /api/admin/config` → `{ domain, devBypassEnabled, features: FeatureFlag[] }`
  - `PUT /api/admin/config/features` body `{ key, enabled }` → `{ features: FeatureFlag[] }`; sai key → 400 `INVALID_KEY`; `enabled` không phải boolean → 400 `INVALID_VALUE`
  - `DELETE /api/admin/config/features/:key` → `{ features: FeatureFlag[] }`
  - `AdminEventType` mới `'config_changed'` (khai báo trong `src/env.ts`).

- [ ] **Step 1: Viết test fail** — `tests/admin.test.ts`:

Cập nhật describe `GET /api/admin/config` hiện có (dòng ~88-96) thành:

```ts
describe('GET /api/admin/config', () => {
  it('returns config with feature flags via SELF (bypass mode in tests)', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/config');
    expect(res.status).toBe(200);
    const body = await res.json<{ domain: string; devBypassEnabled: boolean; features: { key: string; enabled: boolean; isDefault: boolean }[] }>();
    expect(body.domain).toBe(env.DOMAIN);
    expect(body.devBypassEnabled).toBe(true);
    expect(body.features).toHaveLength(4);
    expect(body.features.find((f) => f.key === 'mailbox_create')).toEqual({ key: 'mailbox_create', enabled: true, isDefault: true });
  });
});
```

Thêm describe mới (import thêm `setSetting` từ `../src/db/queries` ở đầu file — dòng import hiện có `createMailbox, insertMessage, logEvent`):

```ts
describe('PUT/DELETE /api/admin/config/features', () => {
  it('toggles a feature and records a config_changed event', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/config/features', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'rate_limit', enabled: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ features: { key: string; enabled: boolean; isDefault: boolean }[] }>();
    expect(body.features.find((f) => f.key === 'rate_limit')).toEqual({ key: 'rate_limit', enabled: false, isDefault: false });

    const rows = await env.DB.prepare(`SELECT * FROM admin_events WHERE type = 'config_changed'`).all<{ detail: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].detail).toBe('rate_limit=off');

    const cfg = await (await SELF.fetch('https://example.com/api/admin/config')).json<{ features: { key: string; enabled: boolean; isDefault: boolean }[] }>();
    expect(cfg.features.find((f) => f.key === 'rate_limit')?.enabled).toBe(false);
  });

  it('rejects an unknown key with 400 INVALID_KEY', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/config/features', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'nope', enabled: true }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('INVALID_KEY');
  });

  it('rejects a non-boolean enabled value with 400 INVALID_VALUE', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/config/features', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'rate_limit', enabled: 'yes' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('INVALID_VALUE');
  });

  it('resets a feature back to default', async () => {
    await setSetting(env.DB, 'feature.custom_name', '0');
    const res = await SELF.fetch('https://example.com/api/admin/config/features/custom_name', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json<{ features: { key: string; enabled: boolean; isDefault: boolean }[] }>();
    expect(body.features.find((f) => f.key === 'custom_name')).toEqual({ key: 'custom_name', enabled: true, isDefault: true });
  });
});
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run tests/admin.test.ts`
Expected: FAIL — test `GET /api/admin/config` sai shape (chưa có `features`), `PUT/DELETE` trả 404 (route chưa tồn tại).

- [ ] **Step 3: Cập nhật `src/env.ts`** — thêm `'config_changed'` vào union:

```ts
export type AdminEventType = 'mailbox_created' | 'rate_limited' | 'recaptcha_failed' | 'cron_cleanup' | 'config_changed';
```

- [ ] **Step 4: Cập nhật `src/routes/admin.ts`**

Thêm vào import từ `../db/queries` (dòng 6): `logEvent, setSetting, deleteSetting`. Thêm import mới sau dòng 7:

```ts
import { resolveFeatureFlags, FEATURE_KEYS, type FeatureKey } from '../lib/features';
```

Thêm `'config_changed'` vào `EVENT_TYPES` (dòng 58):

```ts
const EVENT_TYPES: readonly string[] = ['mailbox_created', 'rate_limited', 'recaptcha_failed', 'cron_cleanup', 'config_changed'];
```

Thay handler `GET /config` (dòng 38-44) và thêm PUT/DELETE ngay sau nó:

```ts
adminRoutes.get('/config', async (c) => {
  const features = await resolveFeatureFlags(c.env.DB, c.env);
  return c.json({
    domain: c.env.DOMAIN,
    devBypassEnabled: c.env.ADMIN_DEV_BYPASS === 'true',
    features,
  });
});

adminRoutes.put('/config/features', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { key?: unknown; enabled?: unknown };
  if (typeof body.key !== 'string' || !(FEATURE_KEYS as readonly string[]).includes(body.key)) {
    throw new ApiError(400, 'INVALID_KEY', 'Unknown feature key');
  }
  if (typeof body.enabled !== 'boolean') {
    throw new ApiError(400, 'INVALID_VALUE', 'enabled must be a boolean');
  }
  const key = body.key as FeatureKey;
  await setSetting(c.env.DB, `feature.${key}`, body.enabled ? '1' : '0');
  await logEvent(c.env.DB, { type: 'config_changed', detail: `${key}=${body.enabled ? 'on' : 'off'}` });
  return c.json({ features: await resolveFeatureFlags(c.env.DB, c.env) });
});

adminRoutes.delete('/config/features/:key', async (c) => {
  const raw = c.req.param('key');
  if (!(FEATURE_KEYS as readonly string[]).includes(raw)) {
    throw new ApiError(400, 'INVALID_KEY', 'Unknown feature key');
  }
  const key = raw as FeatureKey;
  await deleteSetting(c.env.DB, `feature.${key}`);
  await logEvent(c.env.DB, { type: 'config_changed', detail: `${key}=default` });
  return c.json({ features: await resolveFeatureFlags(c.env.DB, c.env) });
});
```

- [ ] **Step 5: Chạy test**

Run: `npx vitest run tests/admin.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/env.ts src/routes/admin.ts tests/admin.test.ts
git commit -m "feat(admin): read/write feature flags via admin config API

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Áp dụng cờ trong route mailbox

**Files:**
- Modify: `src/routes/mailbox.ts`
- Modify: `tests/api.mailbox.test.ts`
- Modify: `tests/recaptcha.test.ts`

**Interfaces:**
- Consumes: `resolveFeatureFlags`, `FeatureKey` (Task 2), `setSetting` (Task 1).
- Produces: hành vi POST `/api/mailbox` theo cờ: 403 `MAINTENANCE`, bỏ qua recaptcha khi tắt, bỏ qua rate-limit khi tắt, 403 `CUSTOM_NAME_DISABLED`.

- [ ] **Step 1: Viết test fail** — thêm describe vào `tests/api.mailbox.test.ts` (import thêm `setSetting` từ `../src/db/queries` — dòng 4 hiện import `logEvent`):

```ts
describe('feature flag enforcement', () => {
  it('blocks creation when mailbox_create is off (maintenance)', async () => {
    await setSetting(env.DB, 'feature.mailbox_create', '0');
    const res = await SELF.fetch('https://example.com/api/mailbox', { method: 'POST' });
    expect(res.status).toBe(403);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('MAINTENANCE');
  });

  it('still allows reading an existing mailbox during maintenance', async () => {
    const created = await SELF.fetch('https://example.com/api/mailbox', { method: 'POST' });
    const { address, token } = await created.json<{ address: string; token: string }>();
    await setSetting(env.DB, 'feature.mailbox_create', '0');
    const res = await SELF.fetch(`https://example.com/api/mailbox/${encodeURIComponent(address)}/messages`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('skips rate limiting when rate_limit is off', async () => {
    await setSetting(env.DB, 'feature.rate_limit', '0');
    for (let i = 0; i < 21; i++) {
      const r = await SELF.fetch('https://example.com/api/mailbox', { method: 'POST' });
      expect(r.status).toBe(201);
    }
  });

  it('rejects custom name when custom_name is off', async () => {
    await setSetting(env.DB, 'feature.custom_name', '0');
    const res = await SELF.fetch('https://example.com/api/mailbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ custom: 'john' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('CUSTOM_NAME_DISABLED');
  });
});
```

Thêm 2 test vào `tests/recaptcha.test.ts` describe `route wiring` (import thêm `setSetting` từ `../src/db/queries`):

```ts
it('skips recaptcha verification when the feature flag is off', async () => {
  await setSetting(env.DB, 'feature.recaptcha', '0');
  const res = await dispatch({});
  expect(res.status).toBe(201);
});

it('rejects invalid recaptcha when the feature flag is on', async () => {
  await setSetting(env.DB, 'feature.recaptcha', '1');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })));
  const res = await dispatch({ recaptchaToken: 'tok' });
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run tests/api.mailbox.test.ts tests/recaptcha.test.ts`
Expected: FAIL — các test mới fail (cờ chưa được đọc trong route).

- [ ] **Step 3: Cập nhật `src/routes/mailbox.ts`**

Thêm import sau dòng 10 (`import type { Env } from '../env';`):

```ts
import { resolveFeatureFlags, type FeatureKey } from '../lib/features';
```

Trong handler `POST /` (sau khi tính `ipHash`, trước phần body/recaptcha), thêm resolve và áp cờ:

```ts
  const flags = await resolveFeatureFlags(c.env.DB, c.env);
  const flagOn = (key: FeatureKey) => flags.find((f) => f.key === key)!.enabled;

  if (!flagOn('mailbox_create')) {
    throw new ApiError(403, 'MAINTENANCE', 'Tạm ngưng tạo mailbox mới');
  }

  const body = (await c.req.json().catch(() => ({}))) as { custom?: unknown; recaptchaToken?: unknown };
  const recaptchaToken = typeof body.recaptchaToken === 'string' ? body.recaptchaToken : '';
  const verified = flagOn('recaptcha') ? await verifyRecaptcha(c.env, recaptchaToken, ip) : true;
  if (!verified) {
    await logEvent(c.env.DB, { type: 'recaptcha_failed', ipHash });
    throw new ApiError(403, 'RECAPTCHA_FAILED', 'Could not verify you are human');
  }

  if (flagOn('rate_limit')) {
    const allowed = await checkAndRecordUsage(c.env.DB, ipHash, nowMs);
    if (!allowed) {
      await logEvent(c.env.DB, { type: 'rate_limited', ipHash, detail: 'per_hour_limit' });
      throw new ApiError(429, 'RATE_LIMITED', 'Too many mailboxes created this hour');
    }
  }

  if (body.custom !== undefined && !flagOn('custom_name')) {
    throw new ApiError(403, 'CUSTOM_NAME_DISABLED', 'Tên tùy chỉnh đã bị tắt');
  }
```

Xóa dòng `const body = ...` và `const recaptchaToken = ...` cũ (đã chuyển lên trên); giữ nguyên phần xử lý `custom` và tạo mailbox phía sau.

- [ ] **Step 4: Chạy toàn bộ test worker**

Run: `npm run test:worker`
Expected: PASS (mọi test cũ vẫn xanh: mặc định cờ recaptcha=off trong test env nên create-không-token vẫn qua; recaptcha.test.ts route wiring vẫn có secret → default on → vẫn enforce).

- [ ] **Step 5: Commit**

```bash
git add src/routes/mailbox.ts tests/api.mailbox.test.ts tests/recaptcha.test.ts
git commit -m "feat(mailbox): enforce runtime feature flags on mailbox creation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Public `/api/config` trả feature flags

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/recaptcha.test.ts`

**Interfaces:**
- Consumes: `resolveFeatureFlags`, `FeatureKey` (Task 2).
- Produces: `GET /api/config` → `{ recaptchaSiteKey: string, features: { customName: boolean, mailboxCreate: boolean } }`; `recaptchaSiteKey = ''` khi cờ recaptcha tắt.
- Thay đổi gây vỡ test cũ: test `GET /api/config` ở `tests/recaptcha.test.ts` dùng `toEqual` strict — phải cập nhật.

- [ ] **Step 1: Viết test fail** — thay describe `GET /api/config` trong `tests/recaptcha.test.ts` (dòng 136-142):

```ts
describe('GET /api/config', () => {
  it('serves the site key and feature flags when recaptcha is enabled', async () => {
    await setSetting(env.DB, 'feature.recaptcha', '1');
    const res = await SELF.fetch('https://example.com/api/config');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      recaptchaSiteKey: 'test-site-key',
      features: { customName: true, mailboxCreate: true },
    });
  });

  it('hides the site key when recaptcha is off', async () => {
    const res = await SELF.fetch('https://example.com/api/config');
    expect(await res.json()).toEqual({
      recaptchaSiteKey: '',
      features: { customName: true, mailboxCreate: true },
    });
  });
});
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npx vitest run tests/recaptcha.test.ts`
Expected: FAIL — `/api/config` vẫn trả `{ recaptchaSiteKey: 'test-site-key' }` (thiếu `features`, site key khác '').

- [ ] **Step 3: Cập nhật `src/index.ts`** — thay handler `/api/config` (dòng 13):

```ts
app.get('/api/config', async (c) => {
  const flags = await resolveFeatureFlags(c.env.DB, c.env);
  const flagOn = (key: FeatureKey) => flags.find((f) => f.key === key)!.enabled;
  return c.json({
    recaptchaSiteKey: flagOn('recaptcha') ? (c.env.RECAPTCHA_SITE_KEY ?? '') : '',
    features: {
      customName: flagOn('custom_name'),
      mailboxCreate: flagOn('mailbox_create'),
    },
  });
});
```

Thêm import đầu file:

```ts
import { resolveFeatureFlags, type FeatureKey } from './lib/features';
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run tests/recaptcha.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/recaptcha.test.ts
git commit -m "feat(api): expose feature flags via public /api/config

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Frontend API client (admin + public)

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/admin.ts`
- Modify: `frontend/src/api/client.spec.ts`
- Modify: `frontend/src/api/admin.spec.ts`

**Interfaces:**
- Produces:
  - `api.put<T>(path, body?, options?)`
  - `PublicConfig { recaptchaSiteKey: string; features: { customName: boolean; mailboxCreate: boolean } }`
  - `getPublicConfig(): Promise<PublicConfig>` (cache module-level, normalize: thiếu `features` → mặc định `true`)
  - `resetPublicConfigCache(): void` (dùng cho test)
  - `AdminConfig { domain: string; devBypassEnabled: boolean; features: AdminFeature[] }`
  - `AdminFeature { key: FeatureKey; enabled: boolean; isDefault: boolean }`
  - `FeatureKey = 'recaptcha' | 'mailbox_create' | 'rate_limit' | 'custom_name'`
  - `adminApi.updateFeature(key: FeatureKey, enabled: boolean)`
  - `adminApi.resetFeature(key: FeatureKey)`

- [ ] **Step 1: Viết test fail** — `frontend/src/api/client.spec.ts` thêm vào describe `api client`:

```ts
it('put sends the body as json', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  await api.put<{ ok: boolean }>('/api/admin/config/features', { key: 'rate_limit', enabled: false });
  const [, init] = fetchMock.mock.calls[0];
  expect(init!.method).toBe('PUT');
  expect(JSON.parse(init!.body as string)).toEqual({ key: 'rate_limit', enabled: false });
});
```

`frontend/src/api/admin.spec.ts` thêm vào describe `adminApi`:

```ts
it('updates a feature via PUT', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ features: [] }), { status: 200 }),
  );
  await adminApi.updateFeature('rate_limit', false);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/admin/config/features');
  expect(init?.method).toBe('PUT');
  expect(JSON.parse(init?.body as string)).toEqual({ key: 'rate_limit', enabled: false });
});

it('resets a feature via DELETE', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ features: [] }), { status: 200 }),
  );
  await adminApi.resetFeature('custom_name');
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/admin/config/features/custom_name');
  expect(init?.method).toBe('DELETE');
});
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `npm run test:frontend`
Expected: FAIL — `api.put` chưa tồn tại, `adminApi.updateFeature/resetFeature` chưa tồn tại.

- [ ] **Step 3: Cập nhật `frontend/src/api/client.ts`**

Thêm `put` vào object `api` (sau `post`):

```ts
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
```

Thêm public config cache + normalize + reset vào cuối file:

```ts
export interface PublicConfig {
  recaptchaSiteKey: string;
  features: { customName: boolean; mailboxCreate: boolean };
}

export function normalizePublicConfig(raw: { recaptchaSiteKey?: string; features?: Partial<{ customName: boolean; mailboxCreate: boolean }> }): PublicConfig {
  return {
    recaptchaSiteKey: raw.recaptchaSiteKey ?? '',
    features: {
      customName: raw.features?.customName !== false,
      mailboxCreate: raw.features?.mailboxCreate !== false,
    },
  };
}

let publicConfigCache: Promise<PublicConfig> | null = null;

export function getPublicConfig(): Promise<PublicConfig> {
  if (!publicConfigCache) {
    publicConfigCache = api.get<{ recaptchaSiteKey?: string; features?: Partial<{ customName: boolean; mailboxCreate: boolean }> }>('/api/config')
      .then(normalizePublicConfig)
      .catch((e) => {
        publicConfigCache = null;
        throw e;
      });
  }
  return publicConfigCache;
}

export function resetPublicConfigCache(): void {
  publicConfigCache = null;
}
```

- [ ] **Step 4: Cập nhật `frontend/src/api/admin.ts`**

Thay interface `AdminConfig` (dòng 40) và thêm type:

```ts
export type FeatureKey = 'recaptcha' | 'mailbox_create' | 'rate_limit' | 'custom_name';
export interface AdminFeature { key: FeatureKey; enabled: boolean; isDefault: boolean }
export interface AdminConfig { domain: string; devBypassEnabled: boolean; features: AdminFeature[] }
```

Thêm 2 method vào `adminApi` (sau `config:`):

```ts
  updateFeature: (key: FeatureKey, enabled: boolean) =>
    guard(api.put<{ features: AdminFeature[] }>('/api/admin/config/features', { key, enabled }, { token: adminSession.value })),
  resetFeature: (key: FeatureKey) =>
    guard(api.del<{ features: AdminFeature[] }>(`/api/admin/config/features/${key}`, { token: adminSession.value })),
```

- [ ] **Step 5: Chạy test frontend**

Run: `npm run test:frontend`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/admin.ts frontend/src/api/client.spec.ts frontend/src/api/admin.spec.ts
git commit -m "feat(admin): frontend API client for feature flags + public config

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: ConfigView — danh sách toggle + confirm

**Files:**
- Modify: `frontend/src/components/ConfirmDialog.vue`
- Modify: `frontend/src/admin/AdminApp.vue`
- Modify: `frontend/src/admin/views/ConfigView.vue`
- Create: `frontend/src/admin/views/ConfigView.spec.ts`

**Interfaces:**
- Consumes: `adminApi.config()`, `adminApi.updateFeature`, `adminApi.resetFeature` (Task 6), `useAdminPolling`, `useToast`, `ConfirmDialog` (đã có).
- Produces: ConfigView hiển thị 4 toggle; tắt cờ protective qua ConfirmDialog; nút reset khi `!isDefault`.
- ConfirmDialog có thêm props optional `confirmText?: string` (default `'Delete permanently'`) và `cancelText?: string` (default `'Keep'`) — backward compatible, test cũ không đổi.

- [ ] **Step 1: Mở rộng `ConfirmDialog.vue`** — thêm props:

```ts
defineProps<{ open: boolean; title?: string; message?: string; confirmText?: string; cancelText?: string }>();
```

Trong template, đổi 2 nút:

```vue
<button class="ghost" @click="emit('cancel')">{{ cancelText || 'Keep' }}</button>
<button class="danger" @click="emit('confirm')">
  <MdiIcon :path="mdiTrashCanOutline" :size="18" /> {{ confirmText || 'Delete permanently' }}
</button>
```

Destructure `const props = defineProps<...>()` và dùng `props.confirmText`/`props.cancelText` trong template, hoặc giữ `defineProps` gán biến — dùng `defineProps` gán biến `props` để template đọc được.

- [ ] **Step 2: Chạy test ConfirmDialog cũ**

Run: `npx vitest run --config vitest.frontend.config.ts frontend/src/components/ConfirmDialog.spec.ts`
Expected: PASS (prop optional, default giữ nguyên text cũ).

- [ ] **Step 3: Viết test fail cho ConfigView** — create `frontend/src/admin/views/ConfigView.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { mount } from '@vue/test-utils';

import ConfigView from './ConfigView.vue';

const features = [
  { key: 'recaptcha', enabled: true, isDefault: true },
  { key: 'mailbox_create', enabled: true, isDefault: true },
  { key: 'rate_limit', enabled: false, isDefault: false },
  { key: 'custom_name', enabled: true, isDefault: false },
];

let fetchMock: MockInstance;

describe('ConfigView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/admin/config') && !init?.method) {
        return new Response(JSON.stringify({ domain: 'x.com', devBypassEnabled: false, features }), { status: 200 });
      }
      if (u.includes('/api/admin/overview')) {
        return new Response(JSON.stringify({ lastCronRunAt: null, lastCronCleanup: null }), { status: 200 });
      }
      if (init?.method === 'PUT' || init?.method === 'DELETE') {
        return new Response(JSON.stringify({ features }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
  });

  it('renders a toggle per feature with default badge', async () => {
    const wrapper = mount(ConfigView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(4);
    expect(wrapper.text()).toContain('reCAPTCHA bảo vệ');
    expect(wrapper.text()).toContain('Giới hạn tốc độ');
    expect(wrapper.findAll('.badge--default').length).toBe(2);
  });

  it('turns a non-protective feature off without confirmation', async () => {
    const wrapper = mount(ConfigView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    const switches = wrapper.findAll('[role="switch"]');
    await switches[3].trigger('click'); // custom_name đang bật → tắt trực tiếp
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/config/features', expect.objectContaining({ method: 'PUT' }));
  });

  it('shows a confirm dialog before disabling a protective feature', async () => {
    const wrapper = mount(ConfigView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    const switches = wrapper.findAll('[role="switch"]');
    await switches[0].trigger('click'); // recaptcha đang bật (protective) → confirm
    await new Promise((r) => setTimeout(r, 20));
    expect(document.body.textContent).toContain('reCAPTCHA bảo vệ');
    // chưa gọi PUT trước khi xác nhận
    const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(0);
    document.querySelector<HTMLButtonElement>('.confirm-actions .danger')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/config/features', expect.objectContaining({ method: 'PUT' }));
  });

  it('resets a non-default feature', async () => {
    const wrapper = mount(ConfigView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    const resetBtns = wrapper.findAll('.reset-btn');
    expect(resetBtns.length).toBe(2);
    await resetBtns[0].trigger('click');
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/config/features/rate_limit', expect.objectContaining({ method: 'DELETE' }));
  });
});
```

- [ ] **Step 4: Chạy để thấy fail**

Run: `npx vitest run --config vitest.frontend.config.ts frontend/src/admin/views/ConfigView.spec.ts`
Expected: FAIL (ConfigView cũ không có toggle/confirm/reset).

- [ ] **Step 5: Viết lại `ConfigView.vue`** (toàn bộ):

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAdminPolling } from '../useAdminPolling';
import { adminApi, type AdminFeature, type FeatureKey } from '../../api/admin';
import { formatDateTimeVN } from '../../lib/format';
import { useToast } from '../../composables/useToast';
import ConfirmDialog from '../../components/ConfirmDialog.vue';

const props = defineProps<{ refreshTick: number }>();
const config = useAdminPolling(() => adminApi.config());
const overview = useAdminPolling(() => adminApi.overview());
const { success: toastSuccess, error: toastError } = useToast();

const FEATURE_META: Record<FeatureKey, { name: string; desc: string; protective: boolean; confirmOff: string }> = {
  recaptcha: {
    name: 'reCAPTCHA bảo vệ',
    desc: 'Yêu cầu xác minh con người khi tạo mailbox (chống spam).',
    protective: true,
    confirmOff: 'Tắt reCAPTCHA sẽ bỏ lớp bảo vệ chống spam khi tạo mailbox. Bạn có chắc muốn tắt?',
  },
  mailbox_create: {
    name: 'Tạo mailbox mới',
    desc: 'Tắt = chế độ bảo trì: người dùng không tạo được mailbox mới (mailbox cũ vẫn hoạt động).',
    protective: true,
    confirmOff: 'Tắt sẽ chuyển trang sang chế độ bảo trì — người dùng không tạo được mailbox mới. Bạn có chắc?',
  },
  rate_limit: {
    name: 'Giới hạn tốc độ',
    desc: 'Giới hạn 20 mailbox/giờ/IP. Tắt = không giới hạn, dễ bị lạm dụng.',
    protective: true,
    confirmOff: 'Tắt giới hạn tốc độ khiến dịch vụ dễ bị lạm dụng (spam/đăng ký hàng loạt). Bạn có chắc?',
  },
  custom_name: {
    name: 'Tên tùy chỉnh',
    desc: 'Cho phép người dùng đặt tên mailbox tùy chỉnh thay vì tên ngẫu nhiên.',
    protective: false,
    confirmOff: 'Tắt tên tùy chỉnh — người dùng chỉ nhận tên mailbox ngẫu nhiên. Bạn có chắc?',
  },
};

const pending = ref<AdminFeature | null>(null);
const busy = ref(false);

function onToggle(f: AdminFeature) {
  if (f.enabled) {
    if (FEATURE_META[f.key].protective) pending.value = f;
    else void apply(f.key, false);
  } else {
    void apply(f.key, true);
  }
}

async function apply(key: FeatureKey, enabled: boolean) {
  busy.value = true;
  try {
    await adminApi.updateFeature(key, enabled);
    await config.refresh();
    toastSuccess(enabled ? 'Đã bật' : 'Đã tắt');
  } catch (e) {
    toastError(e instanceof Error ? e.message : 'Không cập nhật được');
  } finally {
    busy.value = false;
  }
}

async function onConfirmPending() {
  const f = pending.value;
  pending.value = null;
  if (f) await apply(f.key, false);
}

async function onReset(key: FeatureKey) {
  busy.value = true;
  try {
    await adminApi.resetFeature(key);
    await config.refresh();
    toastSuccess('Đã đặt lại về mặc định');
  } catch (e) {
    toastError(e instanceof Error ? e.message : 'Không đặt lại được');
  } finally {
    busy.value = false;
  }
}

watch(() => props.refreshTick, () => {
  void config.refresh();
  void overview.refresh();
});
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Cấu hình</h2>

    <article class="card admin-panel">
      <h3 class="admin-panel__title">Tính năng</h3>
      <div v-if="config.error.value" class="admin-error">Không tải được cấu hình: {{ config.error.value }}</div>
      <ul class="feature-list">
        <li v-for="f in config.data.value?.features ?? []" :key="f.key" class="feature-row">
          <div class="feature-row__text">
            <span class="feature-row__name">{{ FEATURE_META[f.key].name }}</span>
            <span class="feature-row__desc">{{ FEATURE_META[f.key].desc }}</span>
          </div>
          <div class="feature-row__control">
            <span v-if="f.isDefault" class="badge badge--default" title="Đang dùng giá trị mặc định">mặc định</span>
            <button
              type="button"
              class="switch"
              role="switch"
              :aria-checked="f.enabled"
              :disabled="busy"
              :class="{ 'switch--on': f.enabled }"
              @click="onToggle(f)"
            >
              <span class="switch__knob"></span>
            </button>
            <button v-if="!f.isDefault" type="button" class="reset-btn" :disabled="busy" @click="onReset(f.key)">
              Reset
            </button>
          </div>
        </li>
      </ul>
    </article>

    <article class="card admin-panel">
      <h3 class="admin-panel__title">Hệ thống (chỉ đọc)</h3>
      <dl class="config-list">
        <div><dt>Domain</dt><dd>{{ config.data.value?.domain ?? '…' }}</dd></div>
        <div>
          <dt>Bypass xác thực (dev)</dt>
          <dd class="config-list__warn" :class="{ 'config-list__on': config.data.value?.devBypassEnabled }">
            {{ config.data.value?.devBypassEnabled ? 'ĐANG BẬT — cảnh báo' : 'Tắt' }}
          </dd>
        </div>
        <div>
          <dt>Lần chạy cron cuối</dt>
          <dd>{{ overview.data.value?.lastCronRunAt ? formatDateTimeVN(overview.data.value.lastCronRunAt) : '—' }}</dd>
        </div>
        <div v-if="overview.data.value?.lastCronCleanup">
          <dt>Dọn dẹp cron cuối</dt>
          <dd>{{ overview.data.value?.lastCronCleanup?.deletedMailboxes }} mailbox / {{ overview.data.value?.lastCronCleanup?.deletedMessages }} messages</dd>
        </div>
      </dl>
    </article>

    <ConfirmDialog
      :open="!!pending"
      :title="pending ? `Tắt ${FEATURE_META[pending.key].name}` : ''"
      :message="pending ? FEATURE_META[pending.key].confirmOff : ''"
      confirm-text="Tắt tính năng"
      cancel-text="Hủy"
      @confirm="onConfirmPending"
      @cancel="pending = null"
    />
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-panel { padding: 18px; }
.admin-panel__title { margin: 0 0 12px; font-size: 1rem; }
.admin-error { color: var(--danger); margin-bottom: 12px; }
.feature-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
.feature-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 0; border-bottom: 1px solid var(--border);
}
.feature-row:last-child { border-bottom: none; }
.feature-row__text { display: flex; flex-direction: column; gap: 2px; }
.feature-row__name { font-weight: 600; }
.feature-row__desc { color: var(--text-muted); font-size: 0.82rem; }
.feature-row__control { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.badge--default {
  font-size: 0.72rem; color: var(--text-muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; white-space: nowrap;
}
.switch {
  position: relative; width: 44px; height: 24px; border-radius: 999px;
  background: var(--border); border: none; cursor: pointer; transition: background 0.15s ease; padding: 0;
}
.switch:disabled { opacity: 0.6; cursor: not-allowed; }
.switch--on { background: var(--success); }
.switch__knob {
  position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; transition: transform 0.15s ease;
}
.switch--on .switch__knob { transform: translateX(20px); }
.reset-btn {
  border: 1px solid var(--border); color: var(--text-muted); background: transparent;
  border-radius: 6px; padding: 4px 10px; font-size: 0.78rem; cursor: pointer;
}
.reset-btn:hover { color: var(--text); background: var(--bg); }
.reset-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.config-list { display: grid; gap: 10px; margin: 0; }
.config-list > div { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--border); padding: 8px 0; }
.config-list dt { color: var(--text-muted); }
.config-list dd { margin: 0; font-weight: 600; }
.config-list__on { color: var(--danger); }
</style>
```

- [ ] **Step 6: Thêm `ToastContainer` vào `AdminApp.vue`** — import và mount (admin trước đây chưa hiển thị toast):

Import dòng 5: `import ToastContainer from '../components/ToastContainer.vue';`
Thêm ngay trước `</main>`: `<ToastContainer />`

- [ ] **Step 7: Chạy test frontend**

Run: `npm run test:frontend`
Expected: PASS (ConfigView mới + các spec cũ không vỡ. `AdminApp.spec.ts` đã xác minh không ảnh hưởng: thêm `ToastContainer` không đổi số nút nav (vẫn 5) và cấu trúc `.admin-view h2`; fetch mock của nó trả shape cũ nhưng ConfigView không mount trong spec đó).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ConfirmDialog.vue frontend/src/admin/AdminApp.vue frontend/src/admin/views/ConfigView.vue frontend/src/admin/views/ConfigView.spec.ts
git commit -m "feat(admin): feature toggle switches in ConfigView

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: AbuseView — thêm option lọc `config_changed`

**Files:**
- Modify: `frontend/src/admin/views/AbuseView.vue`
- Modify: `frontend/src/admin/views/AbuseView.spec.ts`

- [ ] **Step 1: Cập nhật `AbuseView.vue`** — thêm option vào dropdown (sau dòng 69):

```vue
<option value="config_changed">config_changed</option>
```

- [ ] **Step 2: Cập nhật test** — thêm vào `AbuseView.spec.ts` describe:

```ts
it('includes config_changed in the event type filter', async () => {
  const wrapper = mount(AbuseView, { props: { refreshTick: 0 } });
  await new Promise((r) => setTimeout(r, 20));
  const options = wrapper.findAll('select option').map((o) => o.text());
  expect(options).toContain('config_changed');
});
```

- [ ] **Step 3: Chạy test frontend**

Run: `npx vitest run --config vitest.frontend.config.ts frontend/src/admin/views/AbuseView.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/admin/views/AbuseView.vue frontend/src/admin/views/AbuseView.spec.ts
git commit -m "feat(admin): filter config_changed events in abuse view

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Frontend công khai — banner bảo trì + ẩn ô tên tùy chỉnh

**Files:**
- Modify: `frontend/src/components/AddressCard.vue`
- Modify: `frontend/src/components/NewAddressModal.vue`
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/App.spec.ts`

**Interfaces:**
- Consumes: `getPublicConfig`, `PublicConfig` (Task 6).
- Produces:
  - `AddressCard` thêm prop `customNameEnabled?: boolean` (default `true`); ẩn nút "Custom" khi `false`.
  - `NewAddressModal` thêm prop `customNameEnabled?: boolean` (default `true`); ẩn ô nhập tên khi `false`, submit emit `''` (tạo ngẫu nhiên).
  - `App.vue`: fetch public config lúc mount; `maintenance` → không tự tạo, hiện banner, CTA bị khóa; truyền `customNameEnabled` xuống AddressCard + NewAddressModal.

- [ ] **Step 1: Cập nhật `AddressCard.vue`** — props thêm:

```ts
const props = defineProps<{
  session: Session | null;
  remainingMs: number;
  customNameEnabled?: boolean;
}>();
```

Nút "Custom" (dòng 67-69) thêm `v-if`:

```vue
<button v-if="props.customNameEnabled !== false" class="ghost-btn" @click="emit('openCustom')">
  <MdiIcon :path="mdiPencilOutline" :size="18" /> Custom
</button>
```

- [ ] **Step 2: Cập nhật `NewAddressModal.vue`** — props thêm `customNameEnabled?: boolean`, và trong template bọc ô nhập tên bằng `v-if`:

```ts
const props = defineProps<{ open: boolean; loading: boolean; customNameEnabled?: boolean }>();
```

Template:
```vue
<template v-if="props.customNameEnabled !== false">
  <label class="form__label" for="custom-name">Choose a name</label>
  <div class="form__row">
    <input
      id="custom-name"
      v-model="name"
      class="form__input"
      placeholder="john.doe"
      autocomplete="off"
      spellcheck="false"
      maxlength="30"
    />
    <span class="form__suffix">@domain</span>
  </div>
  <p v-if="error" class="form__error">{{ error }}</p>
</template>
```

Hàm `submit` khi cờ tắt emit `''`:

```ts
function submit() {
  if (props.customNameEnabled === false) {
    emit('submit', '');
    return;
  }
  const value = name.value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(value)) {
    error.value = '3-30 chars: lowercase letters, digits, dot, dash, underscore';
    return;
  }
  error.value = null;
  emit('submit', value);
}
```

- [ ] **Step 3: Cập nhật `App.vue`**

Import thêm `computed` (dòng 2 `import { ref, watch, onMounted, onUnmounted } from 'vue'` → thêm `computed`), `getPublicConfig, type PublicConfig` (từ `./api/client`), và `mdiAlertCircleOutline` từ `@mdi/js`:

```ts
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { getPublicConfig, type PublicConfig } from './api/client';
import { mdiLightningBolt, mdiCheckBold, mdiAlertCircleOutline } from '@mdi/js';
```

Thêm state sau `const confirmDelete = ref(false);`:

```ts
const publicConfig = ref<PublicConfig | null>(null);
const maintenance = computed(() => publicConfig.value?.features.mailboxCreate === false);
const customNameEnabled = computed(() => publicConfig.value?.features.customName !== false);
```

Sửa `ensureSession` — không tự tạo khi bảo trì:

```ts
async function ensureSession() {
  if (maintenance.value) return;
  if (expired.value) {
    ...
  } else {
    await inbox.refresh();
  }
}
```

Thêm fetch public config trong `onMounted` — phải `await` TRƯỚC `ensureSession` để biết trạng thái bảo trì trước khi quyết định tạo mailbox (tránh race):

```ts
onMounted(async () => {
  try {
    publicConfig.value = await getPublicConfig();
  } catch {
    /* lỗi config → mặc định các cờ đều bật */
  }
  await ensureSession();
  inbox.start();
});
```

Sửa `onSubmitCustom` — hỗ trợ tên rỗng (tạo ngẫu nhiên):

```ts
async function onSubmitCustom(name: string) {
  creating.value = true;
  try {
    await create(name || undefined);
    customOpen.value = false;
    const domain = session.value?.address.split('@')[1] ?? '';
    success(name ? `Created ${name}@${domain}` : 'Created a new mailbox');
    await inbox.refresh();
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 409) toastError('That name is already taken');
    else toastError(e instanceof Error ? e.message : 'Could not create mailbox');
  } finally {
    creating.value = false;
  }
}
```

Template: banner bảo trì + truyền prop. Trong `.layout__side`, thêm banner (trước `AddressCard`):

```vue
<div v-if="maintenance" class="maintenance card">
  <MdiIcon :path="mdiAlertCircleOutline" :size="20" />
  <p>Trang đang bảo trì — tạm ngưng tạo mailbox mới.</p>
</div>
```

`AddressCard` thêm prop:

```vue
<AddressCard
  v-if="session"
  :session="session"
  :remaining-ms="remainingMs"
  :custom-name-enabled="customNameEnabled"
  @copy="onCopy"
  @extend="onExtend"
  @remove="onRemove"
  @open-custom="customOpen = true"
/>
```

CTA "Create a new address" khóa khi bảo trì:

```vue
<button class="expired__cta" :disabled="creating || maintenance" @click="ensureSession">
```

`NewAddressModal` truyền prop:

```vue
<NewAddressModal :open="customOpen" :loading="creating" :custom-name-enabled="customNameEnabled" @close="customOpen = false" @submit="onSubmitCustom" />
```

Thêm CSS `.maintenance` (cuối style):

```css
.maintenance {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 16px; padding: 14px 16px;
  color: var(--warning);
}
.maintenance p { margin: 0; }
```

- [ ] **Step 4: Viết test fail** — thêm vào `App.spec.ts` describe (thêm import `resetPublicConfigCache` từ `./api/client` và gọi trong `beforeEach`):

```ts
it('shows a maintenance banner and does not auto-create when mailbox_create is off', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/api/config')) {
      return new Response(JSON.stringify({ recaptchaSiteKey: '', features: { customName: false, mailboxCreate: false } }), { status: 200 });
    }
    return new Response(JSON.stringify({ messages: [] }), { status: 200 });
  });
  const wrapper = mount(App);
  await new Promise((r) => setTimeout(r, 20));
  expect(wrapper.text()).toContain('bảo trì');
  const createCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/mailbox') && c[1]?.method === 'POST');
  expect(createCall).toBeUndefined();
  wrapper.unmount();
});
```

Trong `beforeEach` thêm `resetPublicConfigCache();` (cạnh `resetRecaptchaState()`).

- [ ] **Step 5: Chạy test frontend**

Run: `npm run test:frontend`
Expected: PASS (App cũ dùng mock `/api/config` trả `{ recaptchaSiteKey: '6Lc-test' }` — không có `features` → normalize thành `{ customName: true, mailboxCreate: true }`, không phá test cũ).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AddressCard.vue frontend/src/components/NewAddressModal.vue frontend/src/App.vue frontend/src/App.spec.ts
git commit -m "feat(public): maintenance banner + hide custom name when disabled

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review ghi chú

- Spec §2.3 (PUT/DELETE + EVENT_TYPES) → Task 3. §2.4 (mailbox) → Task 4. §2.5 + §3.3 (public config) → Task 5, 9. §2.6 (env type) → Task 3. §3.1 (api client) → Task 6. §3.2 (ConfigView) → Task 7. §3.4 (AbuseView) → Task 8. §1 (migration) + §2.2 (helpers) → Task 1. §2.1 (features lib) → Task 2.
- Test cũ bị phá vỡ và được cập nhật trong plan: `tests/recaptcha.test.ts` `GET /api/config` (Task 5), `tests/admin.test.ts` `GET /api/admin/config` shape (Task 3).
