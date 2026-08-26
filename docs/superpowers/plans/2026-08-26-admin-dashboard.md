# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng dashboard admin tiếng Việt, chuyên nghiệp, bảo vệ bằng Cloudflare Access, đọc dữ liệu thật từ D1 qua admin API mới, với KPI + system health, charts, bảng dữ liệu và abuse monitoring.

**Architecture:** Backend thêm migration `admin_events`, middleware `requireAdmin` verify JWT của Cloudflare Access (ES256, WebCrypto, không dependency mới), và 7 endpoint `/api/admin/*` đọc thẳng D1. Frontend giữ một SPA duy nhất — `main.ts` phân nhánh theo `location.pathname.startsWith('/admin')`, dynamic-import `AdminApp` (sidebar + topbar + auto-refresh 30s), các view dùng Chart.js/vue-chartjs.

**Tech Stack:** Cloudflare Worker + Hono + D1 (đã có), Vue 3 `<script setup>` + Vite (đã có), `chart.js` + `vue-chartjs` (mới), Vitest + `@cloudflare/vitest-pool-workers` + happy-dom (đã có).

**Spec:** [2026-08-26-admin-dashboard-design.md](../specs/2026-08-26-admin-dashboard-design.md)

## Global Constraints

- **UI copy:** toàn bộ text người dùng nhìn thấy trên dashboard bằng tiếng Việt.
- **Không thêm dependency** ngoài `chart.js` + `vue-chartjs`.
- **Không dùng vue-router** — view switch bằng state trong `AdminApp`.
- **Không bao giờ trả** `token_hash`, `SALT_*`, `RECAPTCHA_SECRET_KEY`, `SALT_IP`, IP gốc (chỉ `ip_hash` rút gọn client-side).
- **Auth fail-closed:** thiếu env `ACCESS_TEAM_DOMAIN`/`ACCESS_APP_AUD` hoặc token sai → `401`. `ADMIN_DEV_BYPASS === 'true'` chỉ cho phép bỏ qua verify.
- **Pagination:** `limit` mặc định 20, tối đa 100; `offset` mặc định 0.
- **Dashboard chỉ đọc** — không endpoint xoá/sửa dữ liệu.
- **Instrumentation bọc try/catch**, không làm hỏng luồng chính.
- **`admin_events` bị prune** khi cũ hơn 7 ngày (cron hàng phút).

---

### Task 1: Bảng `admin_events` + `logEvent`/`pruneEvents` (DB layer)

**Files:**
- Create: `migrations/0002_admin_event_log.sql`
- Modify: `src/env.ts` (thêm type + 3 field Env)
- Modify: `src/db/queries.ts` (thêm `logEvent`, `pruneEvents`)
- Modify: `tests/helpers/db.ts` (resetDb xoá `admin_events`)
- Modify: `tests/db.test.ts` (thêm describe `admin_events`)

**Interfaces:**
- Consumes: không.
- Produces: `logEvent(db, e: { type: AdminEventType; ipHash?: string | null; address?: string | null; detail?: string | null; createdAtMs?: number }): Promise<void>` (không bao giờ throw); `pruneEvents(db, beforeMs: number): Promise<number>`; `AdminEventType` trong `env.ts`. Task 4 và 5+ phụ thuộc các hàm này.

- [ ] **Step 1: Viết migration + cập nhật resetDb + viết test fail**

`migrations/0002_admin_event_log.sql`:
```sql
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
```

`tests/helpers/db.ts` — dòng `resetDb` hiện tại:
```ts
await db.exec('DELETE FROM messages; DELETE FROM ip_usage; DELETE FROM mailboxes;');
```
thay thành:
```ts
await db.exec('DELETE FROM messages; DELETE FROM ip_usage; DELETE FROM mailboxes; DELETE FROM admin_events;');
```

`src/env.ts` — thêm vào đầu interface `Env`:
```ts
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_APP_AUD?: string;
  ADMIN_DEV_BYPASS?: string;
```
và thêm (trước `MailboxRecord`):
```ts
export type AdminEventType = 'mailbox_created' | 'rate_limited' | 'recaptcha_failed' | 'cron_cleanup';

export interface AdminEventRow {
  id: number;
  type: AdminEventType;
  ip_hash: string | null;
  address: string | null;
  detail: string | null;
  created_at: number;
}
```

Thêm vào cuối `tests/db.test.ts`:
```ts
describe('admin_events', () => {
  it('logEvent inserts a row and never throws', async () => {
    await logEvent(db, { type: 'mailbox_created', ipHash: 'h1', address: 'a@tempmail.test' });
    const rows = await db.prepare('SELECT * FROM admin_events').all<AdminEventRow>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].type).toBe('mailbox_created');
    expect(rows.results[0].ip_hash).toBe('h1');
    expect(rows.results[0].created_at).toBeGreaterThan(0);
    // không ném lỗi kể cả khi thiếu field
    await logEvent(db, { type: 'cron_cleanup' });
  });

  it('pruneEvents deletes only events older than beforeMs', async () => {
    await logEvent(db, { type: 'mailbox_created', createdAtMs: NOW - 10 * 24 * 60 * 60 * 1000 });
    await logEvent(db, { type: 'mailbox_created', createdAtMs: NOW - 1000 });
    const removed = await pruneEvents(db, NOW - 7 * 24 * 60 * 60 * 1000);
    expect(removed).toBe(1);
    const left = await db.prepare('SELECT COUNT(*) AS c FROM admin_events').first<{ c: number }>();
    expect(left?.c).toBe(1);
  });
});
```
Thêm `logEvent, pruneEvents` vào `import {...}` của `tests/db.test.ts` và `AdminEventRow` vào imports từ `../src/env`.

- [ ] **Step 2: Chạy để thấy FAIL**

Run: `npm run test:worker -- tests/db.test.ts`
Expected: FAIL — `logEvent is not a function` / type error.

- [ ] **Step 3: Implement**

`src/db/queries.ts` — thêm (đầu file có sẵn import type từ `../env`, thêm `AdminEventType` vào đó):
```ts
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
```

- [ ] **Step 4: Chạy lại — PASS**

Run: `npm run test:worker -- tests/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add migrations/0002_admin_event_log.sql src/env.ts src/db/queries.ts tests/helpers/db.ts tests/db.test.ts
git commit -m "feat(db): add admin_events table with logEvent/pruneEvents"
```

---

### Task 2: JWT verifier cho Cloudflare Access (`access-jwt.ts`)

**Files:**
- Create: `src/lib/access-jwt.ts`
- Test: `tests/access-jwt.test.ts`

**Interfaces:**
- Consumes: không.
- Produces: `verifyAccessJwt(jwt: string, opts: { teamDomain: string; audience: string; nowMs?: number; fetchImpl?: typeof fetch }): Promise<{ email?: string; sub?: string } | null>`. Task 3 (middleware) dùng hàm này.

- [ ] **Step 1: Viết test fail (dùng crypto thật — tạo key ES256, ký token)**

`tests/access-jwt.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { verifyAccessJwt } from '../src/lib/access-jwt';

const TEAM = 'toolviet.cloudflareaccess.com';
const AUD = 'test-aud';

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function enc(obj: unknown): string {
  return bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function makeKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
}

async function signToken(privateKey: CryptoKey, payload: Record<string, unknown>): Promise<string> {
  const header = { alg: 'ES256', kid: 'test-key' };
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(signingInput));
  return `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
}

function jwksFetcher(pubJwk: JsonWebKey): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ keys: [{ ...pubJwk, kid: 'test-key', alg: 'ES256' }] }), { status: 200 })) as typeof fetch;
}

async function validToken(): Promise<{ token: string; fetchImpl: typeof fetch }> {
  const keyPair = await makeKeyPair();
  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const nowSec = Math.floor(Date.now() / 1000);
  const token = await signToken(keyPair.privateKey, {
    iss: `https://${TEAM}`, aud: [AUD], email: 'admin@toolviet.net',
    exp: nowSec + 3600, nbf: nowSec - 10, iat: nowSec,
  });
  return { token, fetchImpl: jwksFetcher(pubJwk) };
}

describe('verifyAccessJwt', () => {
  it('accepts a valid signed token and returns email', async () => {
    const { token, fetchImpl } = await validToken();
    const claims = await verifyAccessJwt(token, { teamDomain: TEAM, audience: AUD, fetchImpl });
    expect(claims?.email).toBe('admin@toolviet.net');
  });

  it('rejects a token with a tampered payload', async () => {
    const { token, fetchImpl } = await validToken();
    const [h, , s] = token.split('.');
    const tampered = `${h}.${enc({ iss: `https://${TEAM}`, aud: [AUD], email: 'evil@toolviet.net', exp: 9999999999 })}.${s}`;
    expect(await verifyAccessJwt(tampered, { teamDomain: TEAM, audience: AUD, fetchImpl })).toBeNull();
  });

  it('rejects an expired token', async () => {
    const { token, fetchImpl } = await validToken();
    const [h, , s] = token.split('.');
    const expired = `${h}.${enc({ iss: `https://${TEAM}`, aud: [AUD], email: 'admin@toolviet.net', exp: Math.floor(Date.now() / 1000) - 10 })}.${s}`;
    expect(await verifyAccessJwt(expired, { teamDomain: TEAM, audience: AUD, fetchImpl })).toBeNull();
  });

  it('rejects a token with the wrong audience', async () => {
    const { token, fetchImpl } = await validToken();
    expect(await verifyAccessJwt(token, { teamDomain: TEAM, audience: 'other-aud', fetchImpl })).toBeNull();
  });

  it('rejects a token signed by a key not in the JWKS', async () => {
    const other = await makeKeyPair();
    const pubJwk = await crypto.subtle.exportKey('jwk', other.publicKey);
    const { token } = await validToken();
    expect(await verifyAccessJwt(token, { teamDomain: TEAM, audience: AUD, fetchImpl: jwksFetcher(pubJwk) })).toBeNull();
  });

  it('rejects malformed jwt and wrong issuer', async () => {
    const { token, fetchImpl } = await validToken();
    expect(await verifyAccessJwt('not-a-jwt', { teamDomain: TEAM, audience: AUD, fetchImpl })).toBeNull();
    const [h, , s] = token.split('.');
    const wrongIss = `${h}.${enc({ iss: 'https://evil.example', aud: [AUD], exp: Math.floor(Date.now() / 1000) + 3600 })}.${s}`;
    expect(await verifyAccessJwt(wrongIss, { teamDomain: TEAM, audience: AUD, fetchImpl })).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy để thấy FAIL**

Run: `npm run test:worker -- tests/access-jwt.test.ts`
Expected: FAIL — cannot find module `../src/lib/access-jwt`.

- [ ] **Step 3: Implement**

`src/lib/access-jwt.ts`:
```ts
export interface AccessJwtOptions {
  teamDomain: string;
  audience: string;
  nowMs?: number;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export interface AccessJwtClaims {
  email?: string;
  sub?: string;
}

interface JwksKey {
  kid?: string;
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
}

const JWKS_TTL_MS = 5 * 60 * 1000;
let jwksCache: { teamDomain: string; keys: JwksKey[]; fetchedAtMs: number } | null = null;

function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeJson<T>(part: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part))) as T;
  } catch {
    return null;
  }
}

async function getJwks(opts: AccessJwtOptions): Promise<JwksKey[]> {
  // Chỉ cache khi dùng fetch thật (không inject fetchImpl) — test inject fetchImpl
  // mỗi lần nên luôn fetch mới, tránh cache cũ nhiễm giữa các test.
  const cache = jwksCache;
  if (!opts.fetchImpl && cache && cache.teamDomain === opts.teamDomain && Date.now() - cache.fetchedAtMs < JWKS_TTL_MS) {
    return cache.keys;
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`https://${opts.teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('JWKS fetch failed');
  const data = (await res.json()) as { keys?: JwksKey[] };
  const keys = data.keys ?? [];
  if (!opts.fetchImpl) jwksCache = { teamDomain: opts.teamDomain, keys, fetchedAtMs: Date.now() };
  return keys;
}

export async function verifyAccessJwt(jwt: string, opts: AccessJwtOptions): Promise<AccessJwtClaims | null> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  const header = decodeJson<{ kid?: string; alg?: string }>(headerB64);
  if (!header?.kid) return null;
  if (header.alg && header.alg !== 'ES256') return null;

  let keys: JwksKey[];
  try {
    keys = await getJwks(opts);
  } catch {
    return null;
  }
  const key = keys.find((k) => k.kid === header.kid);
  if (!key || key.kty !== 'EC' || key.crv !== 'P-256' || !key.x || !key.y) return null;

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: key.x, y: key.y, kid: key.kid },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    return null;
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToBytes(signatureB64);
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, signature, signingInput);
  } catch {
    return null;
  }
  if (!valid) return null;

  const claims = decodeJson<{
    iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string; sub?: string;
  }>(payloadB64);
  if (!claims) return null;
  if (claims.iss !== `https://${opts.teamDomain}`) return null;
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud ?? ''];
  if (!auds.includes(opts.audience)) return null;
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  if (typeof claims.exp === 'number' && claims.exp <= nowSec) return null;
  if (typeof claims.nbf === 'number' && claims.nbf > nowSec) return null;

  return { email: claims.email, sub: claims.sub };
}
```

- [ ] **Step 4: Chạy lại — PASS**

Run: `npm run test:worker -- tests/access-jwt.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/access-jwt.ts tests/access-jwt.test.ts
git commit -m "feat(auth): add Cloudflare Access JWT verifier (ES256, no deps)"
```

---

### Task 3: Middleware `requireAdmin` + mount `adminRoutes` + `/config`

**Files:**
- Modify: `src/lib/auth.ts` (thêm `requireAdmin`)
- Create: `src/routes/admin.ts`
- Modify: `src/index.ts` (mount)
- Test: `tests/admin.test.ts`
- Modify: `.dev.vars.example`, `docs/deployment.md`, `vitest.config.ts` (binding `ADMIN_DEV_BYPASS`)

**Interfaces:**
- Consumes: `verifyAccessJwt` (Task 2).
- Produces: `requireAdmin(c: Context<{ Bindings: Env }>, next: () => Promise<void>): Promise<Response | void>`; `adminRoutes: Hono<{ Bindings: Env }>`; response `/api/admin/config` = `{ domain, recaptchaEnabled, devBypassEnabled }`. Task 5-6 thêm route vào `adminRoutes`.

- [ ] **Step 1: Viết test fail**

`tests/admin.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { SELF, env } from 'cloudflare:test';
import { setupDb } from './helpers/db';
import { requireAdmin } from '../src/lib/auth';
import type { Env } from '../src/env';

beforeEach(async () => {
  await setupDb();
});

function makeAdminApp(overrides: Partial<Env>): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', requireAdmin);
  app.get('/ping', (c) => c.json({ ok: true }));
  return app;
}

describe('requireAdmin middleware', () => {
  it('rejects when bypass off and no token', async () => {
    const app = makeAdminApp({});
    const res = await app.request('/ping', {}, { ...env, ADMIN_DEV_BYPASS: undefined });
    expect(res.status).toBe(401);
  });

  it('rejects when bypass off and ACCESS vars not configured', async () => {
    const app = makeAdminApp({});
    const res = await app.request('/ping', { headers: { 'cf-access-jwt-assertion': 'x.y.z' } }, { ...env, ADMIN_DEV_BYPASS: undefined });
    expect(res.status).toBe(401);
  });

  it('rejects when bypass off and token is invalid', async () => {
    const app = makeAdminApp({});
    const res = await app.request(
      '/ping',
      { headers: { 'cf-access-jwt-assertion': 'x.y.z' } },
      { ...env, ADMIN_DEV_BYPASS: undefined, ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com', ACCESS_APP_AUD: 'aud' },
    );
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/config', () => {
  it('returns read-only config via SELF (bypass mode in tests)', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/config');
    expect(res.status).toBe(200);
    const body = await res.json<{ domain: string; recaptchaEnabled: boolean; devBypassEnabled: boolean }>();
    expect(body.domain).toBe(env.DOMAIN);
    expect(body.devBypassEnabled).toBe(true);
  });
});
```

`vitest.config.ts` — thêm vào `miniflare.bindings`:
```ts
            // Cho phép test admin qua SELF mà không cần CF Access thật.
            ADMIN_DEV_BYPASS: 'true',
```

`.dev.vars.example` — thêm cuối file:
```
# Cloudflare Access — bắt buộc khi deploy (xem docs/deployment.md).
# Bỏ cài ADMIN_DEV_BYPASS=true khi dev local muốn bỏ qua verify.
ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
ACCESS_APP_AUD=your-access-application-audience-tag
ADMIN_DEV_BYPASS=true
```

- [ ] **Step 2: Chạy để thấy FAIL**

Run: `npm run test:worker -- tests/admin.test.ts`
Expected: FAIL — `requireAdmin is not a function`, không tìm thấy module.

- [ ] **Step 3: Implement**

`src/lib/auth.ts` — thêm import và hàm (cuối file):
```ts
import { verifyAccessJwt } from './access-jwt';

export async function requireAdmin(c: Context<{ Bindings: Env }>, next: () => Promise<void>): Promise<Response | void> {
  if (c.env.ADMIN_DEV_BYPASS === 'true') return next();
  const jwt = c.req.header('cf-access-jwt-assertion') ?? '';
  if (!jwt) throw new ApiError(401, 'UNAUTHORIZED', 'Missing admin credentials');
  const teamDomain = c.env.ACCESS_TEAM_DOMAIN;
  const audience = c.env.ACCESS_APP_AUD;
  if (!teamDomain || !audience) throw new ApiError(401, 'UNAUTHORIZED', 'Admin auth not configured');
  const claims = await verifyAccessJwt(jwt, { teamDomain, audience });
  if (!claims) throw new ApiError(401, 'UNAUTHORIZED', 'Invalid admin credentials');
  return next();
}
```

`src/routes/admin.ts`:
```ts
import { Hono } from 'hono';
import { requireAdmin } from '../lib/auth';
import type { Env } from '../env';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.use('*', requireAdmin);

adminRoutes.get('/config', (c) => {
  return c.json({
    domain: c.env.DOMAIN,
    recaptchaEnabled: Boolean(c.env.RECAPTCHA_SECRET_KEY && c.env.RECAPTCHA_SITE_KEY),
    devBypassEnabled: c.env.ADMIN_DEV_BYPASS === 'true',
  });
});
```

`src/index.ts` — thêm import và mount (sau `app.get('/api/config', ...)`, trước `app.all('*')`):
```ts
import { adminRoutes } from './routes/admin';
...
app.route('/api/admin', adminRoutes);
```

- [ ] **Step 4: Chạy lại — PASS**

Run: `npm run test:worker -- tests/admin.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Cập nhật docs + commit**

Thêm vào cuối `docs/deployment.md` mục hướng dẫn (bản rút gọn):
```markdown
## Cloudflare Access cho /admin

1. Trên CF Zero Trust: tạo Access application tựa `toolviet.net` với policy path `/admin*`.
2. Lấy Audience tag (AUD) của application + tên team domain (vd `toolviet.cloudflareaccess.com`).
3. Set secret: `wrangler secret put ACCESS_TEAM_DOMAIN` và `wrangler secret put ACCESS_APP_AUD`.
4. Chỉ set `ADMIN_DEV_BYPASS=true` ở .dev.vars local — KHÔNG đặt ở production.
```

```bash
git add src/lib/auth.ts src/routes/admin.ts src/index.ts tests/admin.test.ts vitest.config.ts .dev.vars.example docs/deployment.md
git commit -m "feat(admin): requireAdmin middleware + /api/admin/config mount"
```

---

### Task 4: Instrumentation sự kiện (mailbox route + cron)

**Files:**
- Modify: `src/routes/mailbox.ts`
- Modify: `src/scheduled.ts`
- Modify: `tests/api.mailbox.test.ts`
- Modify: `tests/scheduled.test.ts`

**Interfaces:**
- Consumes: `logEvent`, `pruneEvents` (Task 1).
- Produces: không có interface mới; hành vi — tạo mailbox ghi `mailbox_created`, bị chặn ghi `rate_limited`, recaptcha fail ghi `recaptcha_failed`, cron ghi `cron_cleanup` + prune 7 ngày. Task 5-6 đọc các event này.

- [ ] **Step 1: Viết test fail**

Thêm vào `tests/api.mailbox.test.ts` (đầu file import thêm):
```ts
import { logEvent } from '../src/db/queries';
```
Thêm describe cuối file:
```ts
describe('admin_events instrumentation', () => {
  it('records mailbox_created on successful create', async () => {
    await SELF.fetch('https://example.com/api/mailbox', { method: 'POST' });
    const rows = await env.DB.prepare(`SELECT * FROM admin_events WHERE type = 'mailbox_created'`).all<{ address: string }>();
    expect(rows.results.length).toBe(1);
    expect(rows.results[0].address).toMatch(new RegExp(`@${DOMAIN.replace(/\./g, '\\.')}$`));
  });

  it('records rate_limited when blocked', async () => {
    for (let i = 0; i < 20; i++) {
      await SELF.fetch('https://example.com/api/mailbox', { method: 'POST' });
    }
    await SELF.fetch('https://example.com/api/mailbox', { method: 'POST' });
    const rows = await env.DB.prepare(`SELECT * FROM admin_events WHERE type = 'rate_limited'`).all();
    expect(rows.results.length).toBe(1);
  });
});
```
Lưu ý: test này cần `beforeEach(setupDb)` đã có sẵn — resetDb giờ xoá cả `admin_events`.

Thêm vào `tests/scheduled.test.ts` — import thêm `logEvent`, `pruneEvents`:
```ts
import { createMailbox, getActiveMailbox, listMessages, logEvent, pruneEvents } from '../src/db/queries';
```
Thêm describe:
```ts
describe('scheduled admin bookkeeping', () => {
  it('writes a cron_cleanup event and prunes old events', async () => {
    const OLD = NOW - 8 * 24 * 60 * 60 * 1000;
    await logEvent(env.DB, { type: 'mailbox_created', ipHash: 'old-ip', createdAtMs: OLD });
    await logEvent(env.DB, { type: 'mailbox_created', ipHash: 'new-ip', createdAtMs: NOW });

    await scheduled({ noop() {} } as unknown as ScheduledController, env);

    const cleanup = await env.DB.prepare(`SELECT detail FROM admin_events WHERE type = 'cron_cleanup' ORDER BY id DESC LIMIT 1`).first<{ detail: string }>();
    expect(cleanup?.detail).toMatch(/^mailboxes=\d+ messages=\d+$/);
    const old = await env.DB.prepare(`SELECT COUNT(*) AS c FROM admin_events WHERE ip_hash = 'old-ip'`).first<{ c: number }>();
    expect(old?.c).toBe(0);
    const fresh = await env.DB.prepare(`SELECT COUNT(*) AS c FROM admin_events WHERE ip_hash = 'new-ip'`).first<{ c: number }>();
    expect(fresh?.c).toBe(1);
  });
});
```

- [ ] **Step 2: Chạy để thấy FAIL**

Run: `npm run test:worker`
Expected: FAIL — test instrumentation không thấy event (chưa implement).

- [ ] **Step 3: Implement**

`src/routes/mailbox.ts` — thêm `logEvent` vào import từ `../db/queries`. Sửa `POST /`:
- Di chuyển dòng hash IP lên trước verify (dòng hiện tại `const ipHash = await hashIp(ip, c.env.SALT_IP);` nằm sau verify):
```ts
  const ipHash = await hashIp(ip, c.env.SALT_IP);

  const body = (await c.req.json().catch(() => ({}))) as { custom?: unknown; recaptchaToken?: unknown };
  const recaptchaToken = typeof body.recaptchaToken === 'string' ? body.recaptchaToken : '';
  const verified = await verifyRecaptcha(c.env, recaptchaToken, ip);
  if (!verified) {
    await logEvent(c.env.DB, { type: 'recaptcha_failed', ipHash });
    throw new ApiError(403, 'RECAPTCHA_FAILED', 'Could not verify you are human');
  }

  const allowed = await checkAndRecordUsage(c.env.DB, ipHash, nowMs);
  if (!allowed) {
    await logEvent(c.env.DB, { type: 'rate_limited', ipHash, detail: 'per_hour_limit' });
    throw new ApiError(429, 'RATE_LIMITED', 'Too many mailboxes created this hour');
  }
```
(Xoá dòng `const ipHash = await hashIp(...)` cũ nằm sau verify để tránh khai báo trùng.)

- Sau `if (!created) throw ...`, trước `return c.json(...)`:
```ts
  await logEvent(c.env.DB, { type: 'mailbox_created', ipHash, address });
```

`src/scheduled.ts` — thay toàn bộ:
```ts
import { cleanupExpired, logEvent, pruneEvents } from './db/queries';
import type { Env } from './env';

const EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function scheduled(_controller: ScheduledController, env: Env): Promise<void> {
  const nowMs = Date.now();
  const cleanup = await cleanupExpired(env.DB, nowMs);
  try {
    await logEvent(env.DB, {
      type: 'cron_cleanup',
      detail: `mailboxes=${cleanup.deletedMailboxes} messages=${cleanup.deletedMessages}`,
    });
    await pruneEvents(env.DB, nowMs - EVENT_RETENTION_MS);
  } catch {
    // nhật ký admin không được làm hỏng cron cleanup chính
  }
}
```

- [ ] **Step 4: Chạy lại — PASS**

Run: `npm run test:worker`
Expected: PASS — toàn bộ worker tests.

- [ ] **Step 5: Commit**

```bash
git add src/routes/mailbox.ts src/scheduled.ts tests/api.mailbox.test.ts tests/scheduled.test.ts
git commit -m "feat(admin): instrument admin_events on create/block/cron"
```

---

### Task 5: Admin API — `/overview` + `/stats`

**Files:**
- Modify: `src/db/queries.ts` (thêm `getAdminOverview`, `getStatsSeries`)
- Modify: `src/env.ts` (thêm type `AdminOverview`, `StatsPoint`)
- Modify: `src/routes/admin.ts` (thêm 2 route)
- Modify: `tests/db.test.ts` (test queries)
- Modify: `tests/admin.test.ts` (test endpoints)

**Interfaces:**
- Consumes: `admin_events` (Task 1), `requireAdmin`/`adminRoutes` (Task 3).
- Produces: `getAdminOverview(db, nowMs): Promise<AdminOverview>`; `getStatsSeries(db, nowMs, rangeMs, bucketMs): Promise<StatsPoint[]>`; endpoints `GET /api/admin/overview`, `GET /api/admin/stats?range=24h|7d`.

`env.ts` — thêm (sau `AdminEventRow`):
```ts
export interface AdminOverview {
  activeMailboxes: number;
  messages24h: number;
  mailPerMinute: number;
  mailboxesCreated24h: number;
  rateLimited24h: number;
  rateLimited7d: number;
  recaptchaFailed24h: number;
  recaptchaFailed7d: number;
  lastCronRunAt: number | null;
  lastCronCleanup: { deletedMailboxes: number; deletedMessages: number } | null;
  serverTime: number;
}

export interface StatsPoint {
  t: number;
  messages: number;
  mailboxes: number;
  rateLimited: number;
  recaptchaFailed: number;
}
```

- [ ] **Step 1: Viết test fail**

Thêm vào `tests/db.test.ts` — import thêm `getAdminOverview`, `getStatsSeries` và type `AdminOverview`, `StatsPoint` từ `../src/env`. Thêm describe:
```ts
describe('admin overview & stats', () => {
  beforeEach(async () => {
    await createMailbox(db, 'live@tempmail.test', 'h', NOW - 1000, NOW + TTL);
    await createMailbox(db, 'old@tempmail.test', 'h', NOW - TTL, NOW - 1);
    await insertMessage(db, {
      id: 'm1', mailbox: 'live@tempmail.test', fromName: null, fromAddr: 's@x.com',
      subject: 'S', preview: 'p', htmlBody: null, textBody: 'b', attachmentsCount: 0, receivedAt: NOW - 5 * 60 * 1000,
    });
    await logEvent(db, { type: 'rate_limited', ipHash: 'h1', createdAtMs: NOW - 1000 });
  });

  it('getAdminOverview counts the right windows', async () => {
    const ov = await getAdminOverview(db, NOW);
    expect(ov.activeMailboxes).toBe(1);            // live còn hạn
    expect(ov.messages24h).toBe(1);
    expect(ov.mailboxesCreated24h).toBe(2);        // live + old đều tạo trong 24h
    expect(ov.rateLimited24h).toBe(1);
    expect(ov.rateLimited7d).toBe(1);
    expect(ov.recaptchaFailed24h).toBe(0);
    expect(ov.mailPerMinute).toBeCloseTo(1 / 1440, 4);
    expect(ov.lastCronRunAt).toBeNull();
  });

  it('getStatsSeries fills all buckets with zero gaps', async () => {
    const bucketMs = 15 * 60 * 1000;
    const points = await getStatsSeries(db, NOW, 24 * 60 * 60 * 1000, bucketMs);
    expect(points.length).toBe(96);
    const msgSum = points.reduce((s, p) => s + p.messages, 0);
    expect(msgSum).toBe(1);
    const last = points[points.length - 1];
    expect(last.t).toBe(Math.floor((NOW - 5 * 60 * 1000) / bucketMs) * bucketMs);
    expect(last.messages).toBe(1);
  });
});
```

Thêm vào `tests/admin.test.ts` — import thêm `createMailbox`, `insertMessage`, `logEvent` từ `../src/db/queries`. Thêm describe:
```ts
describe('GET /api/admin/overview & /stats', () => {
  it('overview returns KPI shape', async () => {
    await createMailbox(env.DB, `a@${env.DOMAIN}`, 'h', Date.now() - 1000, Date.now() + 60_000);
    const res = await SELF.fetch('https://example.com/api/admin/overview');
    expect(res.status).toBe(200);
    const body = await res.json<AdminOverview>();
    expect(body.activeMailboxes).toBe(1);
    expect(typeof body.mailPerMinute).toBe('number');
  });

  it('stats validates range param (7d vs 24h)', async () => {
    const r24 = await (await SELF.fetch('https://example.com/api/admin/stats?range=24h')).json<{ range: string; points: StatsPoint[] }>();
    expect(r24.range).toBe('24h');
    expect(r24.points.length).toBe(96);
    const r7 = await (await SELF.fetch('https://example.com/api/admin/stats?range=7d')).json<{ range: string; points: StatsPoint[] }>();
    expect(r7.range).toBe('7d');
    expect(r7.points.length).toBe(28);
  });
});
```
(Thêm `AdminOverview`, `StatsPoint` vào imports từ `../src/env` trong `tests/admin.test.ts`.)

- [ ] **Step 2: Chạy để thấy FAIL**

Run: `npm run test:worker`
Expected: FAIL — hàm/type chưa tồn tại.

- [ ] **Step 3: Implement**

`src/db/queries.ts` — thêm (cuối file; thêm `AdminOverview`, `StatsPoint`, `AdminEventRow`, `AdminEventType` vào import `../env`):
```ts
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
    bucketCount(db, 'SELECT ((received_at / ?) * ?) AS t, COUNT(*) AS c FROM messages WHERE received_at >= ? GROUP BY t', startMs, bucketMs),
    bucketCount(db, 'SELECT ((created_at / ?) * ?) AS t, COUNT(*) AS c FROM mailboxes WHERE created_at >= ? GROUP BY t', startMs, bucketMs),
    bucketCount(db, `SELECT ((created_at / ?) * ?) AS t, COUNT(*) AS c FROM admin_events WHERE type = 'rate_limited' AND created_at >= ? GROUP BY t`, startMs, bucketMs),
    bucketCount(db, `SELECT ((created_at / ?) * ?) AS t, COUNT(*) AS c FROM admin_events WHERE type = 'recaptcha_failed' AND created_at >= ? GROUP BY t`, startMs, bucketMs),
  ]);
  // Neo bucket tại biên `floor(nowMs/bucketMs)*bucketMs` (khớp với `((ts / ?) * ?)` trong SQL)
  // rồi lùi dần về quá khứ — nếu neo tại startMs sẽ lệch pha, mọi bucket SQL không khớp → toàn 0.
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
```

`src/routes/admin.ts` — import thêm từ queries:
```ts
import { getAdminOverview, getStatsSeries } from '../db/queries';
```
Thêm hằng và routes (đầu file sau `use`):
```ts
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

adminRoutes.get('/overview', async (c) => {
  return c.json(await getAdminOverview(c.env.DB, Date.now()));
});

adminRoutes.get('/stats', async (c) => {
  const is7d = c.req.query('range') === '7d';
  const rangeMs = is7d ? 7 * DAY_MS : DAY_MS;
  const bucketMs = is7d ? 6 * HOUR_MS : 15 * 60 * 1000;
  const points = await getStatsSeries(c.env.DB, Date.now(), rangeMs, bucketMs);
  return c.json({ range: is7d ? '7d' : '24h', points });
});
```

- [ ] **Step 4: Chạy lại — PASS**

Run: `npm run test:worker`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.ts src/env.ts src/routes/admin.ts tests/db.test.ts tests/admin.test.ts
git commit -m "feat(admin): add /overview and /stats endpoints"
```

---

### Task 6: Admin API — `/top`, `/events`, `/mailboxes`, `/messages`

**Files:**
- Modify: `src/db/queries.ts` (thêm `getTopSenders`, `getTopIpHashes`, `listMailboxes`, `listMessages`, `listEvents`)
- Modify: `src/env.ts` (thêm `AdminMailboxRow`, `AdminMessageRow`)
- Modify: `src/routes/admin.ts` (thêm 4 route + helper paging)
- Modify: `tests/admin.test.ts`

**Interfaces:**
- Consumes: `adminRoutes` (Task 3), queries (Task 1).
- Produces: `getTopSenders(db, nowMs, limit)` / `getTopIpHashes(db, nowMs, limit)` → `{ label, count }[]`; `listMailboxes(db, limit, offset)` → `{ items, total }`; `listMessages(db, limit, offset)` → `{ items, total }`; `listEvents(db, type, limit, offset)` → `{ items, total }`. Endpoint responses: `/top` = `{ by, items }`, `/events` = `{ events, total, limit, offset }`, `/mailboxes` = `{ mailboxes, total, limit, offset }`, `/messages` = `{ messages, total, limit, offset }`.

`env.ts` — thêm:
```ts
export interface AdminMailboxRow {
  address: string;
  created_at: number;
  expires_at: number;
}

export interface AdminMessageRow {
  id: string;
  mailbox: string;
  from_name: string | null;
  from_addr: string;
  subject: string | null;
  preview: string;
  received_at: number;
}
```

- [ ] **Step 1: Viết test fail**

Thêm vào `tests/admin.test.ts` — import thêm `insertMessage`, `logEvent`, `getTopSenders`... (thêm `createMailbox`, `insertMessage`, `logEvent` từ `../src/db/queries`; type `AdminMailboxRow`, `AdminMessageRow`, `AdminEventRow` từ `../src/env`). Thêm describe:
```ts
describe('GET /api/admin lists', () => {
  beforeEach(async () => {
    await createMailbox(env.DB, `a@${env.DOMAIN}`, 'h', Date.now() - 1000, Date.now() + 60_000);
    await insertMessage(env.DB, {
      id: 'msg1', mailbox: `a@${env.DOMAIN}`, fromName: 'Alice', fromAddr: 'alice@x.com',
      subject: 'Chào', preview: 'p', htmlBody: null, textBody: 'b', attachmentsCount: 0, receivedAt: Date.now(),
    });
    await logEvent(env.DB, { type: 'rate_limited', ipHash: 'h1', createdAtMs: Date.now() });
  });

  it('top senders ranks by count', async () => {
    const res = await (await SELF.fetch('https://example.com/api/admin/top?by=senders&limit=5')).json<{ by: string; items: { label: string; count: number }[] }>();
    expect(res.by).toBe('senders');
    expect(res.items[0]).toEqual({ label: 'alice@x.com', count: 1 });
  });

  it('top ips uses mailbox_created events', async () => {
    const res = await (await SELF.fetch('https://example.com/api/admin/top?by=ips&limit=5')).json<{ by: string; items: { label: string; count: number }[] }>();
    expect(res.items).toEqual([]); // chưa có event mailbox_created trong 24h
  });

  it('mailboxes list paginates and hides token_hash', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/mailboxes?limit=10&offset=0');
    expect(res.status).toBe(200);
    const body = await res.json<{ mailboxes: AdminMailboxRow[]; total: number; limit: number }>();
    expect(body.total).toBe(1);
    expect(body.mailboxes[0]).not.toHaveProperty('token_hash');
    expect(body.mailboxes[0].address).toBe(`a@${env.DOMAIN}`);
  });

  it('messages list returns preview only', async () => {
    const body = await (await SELF.fetch('https://example.com/api/admin/messages?limit=10')).json<{ messages: AdminMessageRow[]; total: number }>();
    expect(body.messages[0].from_addr).toBe('alice@x.com');
    expect(body.messages[0]).not.toHaveProperty('html_body');
  });

  it('events list filters by type', async () => {
    const body = await (await SELF.fetch('https://example.com/api/admin/events?type=rate_limited')).json<{ events: AdminEventRow[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.events[0].type).toBe('rate_limited');
    const none = await (await SELF.fetch('https://example.com/api/admin/events?type=recaptcha_failed')).json<{ events: AdminEventRow[]; total: number }>();
    expect(none.total).toBe(0);
  });

  it('clamps limit to 100 and validates offset', async () => {
    const body = await (await SELF.fetch('https://example.com/api/admin/mailboxes?limit=9999&offset=-5')).json<{ limit: number; offset: number }>();
    expect(body.limit).toBe(100);
    expect(body.offset).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy để thấy FAIL**

Run: `npm run test:worker -- tests/admin.test.ts`
Expected: FAIL — 404 endpoint / missing functions.

- [ ] **Step 3: Implement**

`src/db/queries.ts` — thêm (cuối file):
```ts
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

export async function listMessages(db: D1Database, limit: number, offset: number): Promise<{ items: AdminMessageRow[]; total: number }> {
  const [res, total] = await Promise.all([
    db.prepare('SELECT id, mailbox, from_name, from_addr, subject, preview, received_at FROM messages ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?').bind(limit, offset).all<AdminMessageRow>(),
    db.prepare('SELECT COUNT(*) AS c FROM messages').first<{ c: number }>(),
  ]);
  return { items: res.results, total: total?.c ?? 0 };
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
```

`src/routes/admin.ts` — import thêm:
```ts
import { getTopSenders, getTopIpHashes, listMailboxes, listMessages, listEvents } from '../db/queries';
import type { AdminEventType } from '../env';
```
Thêm helper + routes:
```ts
function parsePaging(c: Parameters<Parameters<typeof adminRoutes.get>[1]>[0]): { limit: number; offset: number } {
  const rawLimit = Number(c.req.query('limit'));
  const rawOffset = Number(c.req.query('offset'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}
```
> Ghi chú: nếu `parsePaging` khó viết đúng type, thay bằng type tường minh `(c: Context<{ Bindings: Env }>)` và import `Context` từ `hono` — dùng cách đó cho rõ ràng.

Thêm routes:
```ts
const EVENT_TYPES: readonly string[] = ['mailbox_created', 'rate_limited', 'recaptcha_failed', 'cron_cleanup'];

adminRoutes.get('/top', async (c) => {
  const by = c.req.query('by') === 'ips' ? 'ips' : 'senders';
  const rawLimit = Number(c.req.query('limit'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 10;
  const items = by === 'ips'
    ? await getTopIpHashes(c.env.DB, Date.now(), limit)
    : await getTopSenders(c.env.DB, Date.now(), limit);
  return c.json({ by, items });
});

adminRoutes.get('/events', async (c) => {
  const rawType = c.req.query('type');
  const type = rawType && EVENT_TYPES.includes(rawType) ? (rawType as AdminEventType) : null;
  const { limit, offset } = parsePaging(c);
  const data = await listEvents(c.env.DB, type, limit, offset);
  return c.json({ events: data.items, total: data.total, limit, offset });
});

adminRoutes.get('/mailboxes', async (c) => {
  const { limit, offset } = parsePaging(c);
  const data = await listMailboxes(c.env.DB, limit, offset);
  return c.json({ mailboxes: data.items, total: data.total, limit, offset });
});

adminRoutes.get('/messages', async (c) => {
  const { limit, offset } = parsePaging(c);
  const data = await listMessages(c.env.DB, limit, offset);
  return c.json({ messages: data.items, total: data.total, limit, offset });
});
```

- [ ] **Step 4: Chạy lại — PASS**

Run: `npm run test:worker`
Expected: PASS — toàn bộ worker tests.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.ts src/env.ts src/routes/admin.ts tests/admin.test.ts
git commit -m "feat(admin): add top/events/mailboxes/messages endpoints"
```

---

### Task 7: Frontend nền — deps, gate, main.ts, admin client, `AdminApp` shell

**Files:**
- Modify: `package.json` (`chart.js`, `vue-chartjs`)
- Create: `frontend/src/admin/gate.ts`, `frontend/src/admin/useAdminPolling.ts`, `frontend/src/api/admin.ts`, `frontend/src/admin/AdminApp.vue`, `frontend/src/styles/admin.css`
- Modify: `frontend/src/main.ts`, `frontend/src/env.d.ts` (nếu cần cho CSS import)
- Test: `frontend/src/admin/gate.spec.ts`, `frontend/src/admin/AdminApp.spec.ts`, `frontend/src/api/admin.spec.ts`

**Interfaces:**
- Consumes: `api` client (có sẵn `frontend/src/api/client.ts`).
- Produces: `isAdminPath(pathname): boolean`; `adminApi` (các method typed); `useAdminPolling<T>(fetcher, intervalMs)` → `{ data, loading, error, refresh }`; `AdminApp` mount được. Task 8-10 dùng `adminApi` + `useAdminPolling` + `AdminApp` (thêm view vào `AdminApp`).

- [ ] **Step 1: Cài dependency**

```bash
npm install chart.js vue-chartjs
```
Verify: `npm ls chart.js vue-chartjs` trả về bản đã cài.

- [ ] **Step 2: Viết test fail**

`frontend/src/admin/gate.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isAdminPath } from './gate';

describe('isAdminPath', () => {
  it('matches /admin and /admin/...', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/overview')).toBe(true);
  });
  it('does not match root or other paths', () => {
    expect(isAdminPath('/')).toBe(false);
    expect(isAdminPath('/inbox')).toBe(false);
  });
});
```

`frontend/src/api/admin.spec.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { adminApi } from './admin';

afterEach(() => vi.restoreAllMocks());

describe('adminApi', () => {
  it('fetches overview', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ activeMailboxes: 3 }), { status: 200 }),
    );
    const res = await adminApi.overview();
    expect((res as { activeMailboxes: number }).activeMailboxes).toBe(3);
    expect(fetch).toHaveBeenCalledWith('/api/admin/overview', expect.anything());
  });

  it('appends range and limit query params', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ range: '24h', points: [] }), { status: 200 }),
    );
    await adminApi.stats('24h');
    const url = (fetchMock.mock.calls[0][0] as string);
    expect(url).toContain('range=24h');
  });
});
```

`frontend/src/admin/AdminApp.spec.ts` — cần mock `vue-chartjs`/`chart.js` vì sau này `AdminApp` render charts; viết ngay cho đúng (mock để tránh lỗi canvas trong happy-dom):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-chartjs', () => ({
  Line: { template: '<div class="mock-line" />' },
  Bar: { template: '<div class="mock-bar" />' },
}));
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: class {}, LinearScale: class {}, PointElement: class {},
  LineElement: class {}, BarElement: class {}, Filler: class {},
  Tooltip: class {}, Legend: class {}, Title: class {},
}));

import AdminApp from './AdminApp.vue';

describe('AdminApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ domain: 'toolviet.net', recaptchaEnabled: true, devBypassEnabled: false }), { status: 200 }),
    );
  });

  it('renders the shell with Vietnamese nav', async () => {
    const wrapper = mount(AdminApp);
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.text()).toContain('Tổng quan');
    expect(wrapper.text()).toContain('Mailbox');
    expect(wrapper.text()).toContain('Messages');
    expect(wrapper.text()).toContain('Lạm dụng');
    expect(wrapper.text()).toContain('Cấu hình');
  });
});
```

- [ ] **Step 3: Chạy để thấy FAIL**

Run: `npm run test:frontend -- frontend/src/admin/gate.spec.ts frontend/src/api/admin.spec.ts frontend/src/admin/AdminApp.spec.ts`
Expected: FAIL — thiếu module/components.

- [ ] **Step 4: Implement**

`frontend/src/admin/gate.ts`:
```ts
export function isAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin');
}
```

`frontend/src/api/admin.ts`:
```ts
import { api } from './client';

export interface AdminOverview {
  activeMailboxes: number;
  messages24h: number;
  mailPerMinute: number;
  mailboxesCreated24h: number;
  rateLimited24h: number;
  rateLimited7d: number;
  recaptchaFailed24h: number;
  recaptchaFailed7d: number;
  lastCronRunAt: number | null;
  lastCronCleanup: { deletedMailboxes: number; deletedMessages: number } | null;
  serverTime: number;
}

export interface StatsPoint {
  t: number;
  messages: number;
  mailboxes: number;
  rateLimited: number;
  recaptchaFailed: number;
}

export interface AdminMailboxRow { address: string; created_at: number; expires_at: number }
export interface AdminMessageRow {
  id: string; mailbox: string; from_name: string | null; from_addr: string;
  subject: string | null; preview: string; received_at: number;
}
export interface AdminEventRow {
  id: number; type: string; ip_hash: string | null; address: string | null;
  detail: string | null; created_at: number;
}

export interface Paged { total: number; limit: number; offset: number }
export interface AdminMailboxesResponse extends Paged { mailboxes: AdminMailboxRow[] }
export interface AdminMessagesResponse extends Paged { messages: AdminMessageRow[] }
export interface AdminEventsResponse extends Paged { events: AdminEventRow[] }
export interface AdminConfig { domain: string; recaptchaEnabled: boolean; devBypassEnabled: boolean }

export const adminApi = {
  overview: () => api.get<AdminOverview>('/api/admin/overview'),
  stats: (range: '24h' | '7d') => api.get<{ range: string; points: StatsPoint[] }>(`/api/admin/stats?range=${range}`),
  top: (by: 'senders' | 'ips', limit = 10) =>
    api.get<{ by: string; items: { label: string; count: number }[] }>(`/api/admin/top?by=${by}&limit=${limit}`),
  events: (type: string | null, limit = 20, offset = 0) =>
    api.get<AdminEventsResponse>(`/api/admin/events?${type ? `type=${type}&` : ''}limit=${limit}&offset=${offset}`),
  mailboxes: (limit = 20, offset = 0) => api.get<AdminMailboxesResponse>(`/api/admin/mailboxes?limit=${limit}&offset=${offset}`),
  messages: (limit = 20, offset = 0) => api.get<AdminMessagesResponse>(`/api/admin/messages?limit=${limit}&offset=${offset}`),
  config: () => api.get<AdminConfig>('/api/admin/config'),
};
```

`frontend/src/admin/useAdminPolling.ts`:
```ts
import { ref, onMounted, onUnmounted } from 'vue';

export function useAdminPolling<T>(fetcher: () => Promise<T>, intervalMs = 30_000) {
  const data = ref<T | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let timer: number | undefined;
  let stopped = false;

  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      data.value = await fetcher();
      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Không thể tải dữ liệu';
    } finally {
      loading.value = false;
    }
  }

  function schedule(): void {
    if (stopped) return;
    timer = window.setTimeout(() => {
      if (document.hidden) {
        schedule();
        return;
      }
      void refresh().finally(schedule);
    }, intervalMs);
  }

  onMounted(() => {
    stopped = false;
    void refresh().finally(schedule);
  });

  onUnmounted(() => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  });

  return { data, loading, error, refresh };
}
```

`frontend/src/main.ts` — thay toàn bộ:
```ts
import { createApp } from 'vue';
import App from './App.vue';
import './styles/main.css';
import { isAdminPath } from './admin/gate';

if (isAdminPath(window.location.pathname)) {
  document.body.classList.add('admin');
  import('./admin/AdminApp.vue').then(({ default: AdminApp }) => createApp(AdminApp).mount('#app'));
} else {
  createApp(App).mount('#app');
}
```

`frontend/src/styles/admin.css`:
```css
body.admin #app {
  max-width: none;
  padding: 0;
}

.admin-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
}

.admin-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 10;
}

.admin-topbar__title { font-size: 1.1rem; font-weight: 700; margin: 0; }

.admin-body {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
}

.admin-sidebar {
  border-right: 1px solid var(--border);
  background: var(--surface);
  padding: 12px 8px;
  position: sticky;
  top: 0;
  align-self: start;
  height: calc(100vh - 57px);
  overflow-y: auto;
}

.admin-nav { display: flex; flex-direction: column; gap: 4px; }

.admin-nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--text-muted);
  font-weight: 500;
  min-height: 40px;
  width: 100%;
  text-align: left;
}
.admin-nav__item:hover { background: var(--bg); color: var(--text); }
.admin-nav__item--active { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }

.admin-main { padding: 20px; min-width: 0; }

.admin-grid { display: grid; gap: 16px; }
@media (min-width: 1200px) {
  .admin-grid--stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (max-width: 820px) {
  .admin-body { grid-template-columns: 1fr; }
  .admin-sidebar {
    position: static;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--border);
    display: none;
  }
  .admin-sidebar--open { display: block; }
}
```

`frontend/src/admin/AdminApp.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import MdiIcon from '../components/MdiIcon.vue';
import { mdiViewDashboard, mdiEmail, mdiEmailMultiple, mdiShieldAlert, mdiCog, mdiMenu, mdiRefresh } from '@mdi/js';
import OverviewView from './views/OverviewView.vue';
import MailboxView from './views/MailboxView.vue';
import MessagesView from './views/MessagesView.vue';
import AbuseView from './views/AbuseView.vue';
import ConfigView from './views/ConfigView.vue';
import '../styles/admin.css';

type ViewKey = 'overview' | 'mailboxes' | 'messages' | 'abuse' | 'config';

const active = ref<ViewKey>('overview');
const sidebarOpen = ref(false);
const refreshTick = ref(0);

const nav: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Tổng quan', icon: mdiViewDashboard },
  { key: 'mailboxes', label: 'Mailbox', icon: mdiEmail },
  { key: 'messages', label: 'Messages', icon: mdiEmailMultiple },
  { key: 'abuse', label: 'Lạm dụng', icon: mdiShieldAlert },
  { key: 'config', label: 'Cấu hình', icon: mdiCog },
];

function select(key: ViewKey) {
  active.value = key;
  sidebarOpen.value = false;
}
</script>

<template>
  <div class="admin-shell">
    <header class="admin-topbar">
      <button class="admin-topbar__menu" aria-label="Mở menu" @click="sidebarOpen = !sidebarOpen">
        <MdiIcon :path="mdiMenu" :size="22" />
      </button>
      <h1 class="admin-topbar__title">Quản trị Temp Mail</h1>
      <span class="admin-topbar__spacer"></span>
      <button class="btn-icon" aria-label="Làm mới dữ liệu" title="Làm mới" @click="refreshTick++">
        <MdiIcon :path="mdiRefresh" :size="20" />
      </button>
    </header>

    <div class="admin-body">
      <aside class="admin-sidebar" :class="{ 'admin-sidebar--open': sidebarOpen }">
        <nav class="admin-nav" aria-label="Điều hướng">
          <button
            v-for="item in nav"
            :key="item.key"
            class="admin-nav__item"
            :class="{ 'admin-nav__item--active': active === item.key }"
            :aria-current="active === item.key ? 'page' : undefined"
            @click="select(item.key)"
          >
            <MdiIcon :path="item.icon" :size="20" />
            {{ item.label }}
          </button>
        </nav>
      </aside>

      <main class="admin-main">
        <OverviewView v-if="active === 'overview'" :refresh-tick="refreshTick" />
        <MailboxView v-else-if="active === 'mailboxes'" :refresh-tick="refreshTick" />
        <MessagesView v-else-if="active === 'messages'" :refresh-tick="refreshTick" />
        <AbuseView v-else-if="active === 'abuse'" :refresh-tick="refreshTick" />
        <ConfigView v-else :refresh-tick="refreshTick" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-topbar__spacer { flex: 1; }
.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  color: var(--text-muted);
}
.btn-icon:hover { background: var(--bg); color: var(--text); }
@media (min-width: 821px) {
  .admin-topbar__menu { display: none; }
}
</style>
```

> Lưu ý: các view (`views/*.vue`) được import ở trên nhưng chưa tồn tại — Task 8-10 sẽ tạo. Để `AdminApp.spec.ts` chạy ngay trong Task 7, tạo **file view tạm đơn giản** trước (mỗi view render một `<section>` với title tiếng Việt). Task 8-10 thay nội dung thật. Cách khác (khuyến nghị): thực hiện Task 7-10 cùng nhịp, tạo đủ view trước khi chạy test. Khi làm theo thứ tự, đảm bảo `frontend/src/admin/views/OverviewView.vue`, `MailboxView.vue`, `MessagesView.vue`, `AbuseView.vue`, `ConfigView.vue` tồn tại (kể cả tạm) trước khi chạy `AdminApp.spec.ts`.

Ví dụ view tạm (tạo trước, `frontend/src/admin/views/OverviewView.vue`):
```vue
<template>
  <section class="admin-view">
    <h2>Tổng quan</h2>
    <slot />
  </section>
</template>
```
(Tạo tương tự 4 view còn lại với tiêu đề Mailbox / Messages / Lạm dụng / Cấu hình. Task 8-10 thay bằng nội dung thật.)

- [ ] **Step 5: Chạy lại — PASS**

Run: `npm run test:frontend`
Expected: PASS — gate + adminApi + AdminApp render shell.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json frontend/src/main.ts frontend/src/admin frontend/src/api/admin.ts frontend/src/styles/admin.css
git commit -m "feat(admin): admin shell + gate + polling + typed client"
```

---

### Task 8: `OverviewView` — KPI cards + charts + health

**Files:**
- Create: `frontend/src/admin/charts.ts`, `frontend/src/admin/StatCard.vue`, `frontend/src/admin/TimeSeriesChart.vue`, `frontend/src/admin/HealthPanel.vue`, `frontend/src/admin/views/OverviewView.vue`
- Modify: `frontend/src/lib/format.ts` (thêm `formatDateTimeVN`)
- Test: `frontend/src/lib/format.spec.ts`, `frontend/src/admin/views/OverviewView.spec.ts`

**Interfaces:**
- Consumes: `adminApi`, `useAdminPolling` (Task 7); `MdiIcon` (có sẵn).
- Produces: `formatDateTimeVN(ms): string`; `TimeSeriesChart` (props: `points: StatsPoint[]`, `range`), `StatCard` (props: `label`, `value`, `hint?`, `icon`), `HealthPanel` (props: `overview: AdminOverview | null`, `config: AdminConfig | null`), `OverviewView` (props: `refreshTick: number`). Task 9-10 dùng `formatDateTimeVN` + `TimeSeriesChart`.

- [ ] **Step 1: Viết test fail**

`frontend/src/lib/format.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatDateTimeVN } from './format';

describe('formatDateTimeVN', () => {
  it('formats a timestamp as Vietnamese short date+time', () => {
    const s = formatDateTimeVN(new Date(2026, 7, 24, 14, 32).getTime());
    expect(s).toContain('24/8/2026');
    expect(s).toContain('14:32');
  });
});
```

`frontend/src/admin/views/OverviewView.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-chartjs', () => ({
  Line: { template: '<div class="mock-line" />' },
  Bar: { template: '<div class="mock-bar" />' },
}));
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: class {}, LinearScale: class {}, PointElement: class {},
  LineElement: class {}, BarElement: class {}, Filler: class {},
  Tooltip: class {}, Legend: class {}, Title: class {},
}));

import OverviewView from './OverviewView.vue';
import type { AdminOverview } from '../../api/admin';

const overview: AdminOverview = {
  activeMailboxes: 12, messages24h: 340, mailPerMinute: 0.24, mailboxesCreated24h: 5,
  rateLimited24h: 3, rateLimited7d: 30, recaptchaFailed24h: 1, recaptchaFailed7d: 8,
  lastCronRunAt: Date.now() - 60_000,
  lastCronCleanup: { deletedMailboxes: 2, deletedMessages: 10 },
  serverTime: Date.now(),
};

describe('OverviewView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/overview')) return new Response(JSON.stringify(overview), { status: 200 });
      if (url.includes('/stats')) return new Response(JSON.stringify({ range: '24h', points: [] }), { status: 200 });
      if (url.includes('/config')) return new Response(JSON.stringify({ domain: 'toolviet.net', recaptchaEnabled: true, devBypassEnabled: false }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
  });

  it('shows KPI values and cron health', async () => {
    const wrapper = mount(OverviewView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.text()).toContain('12');
    expect(wrapper.text()).toContain('Mailbox đang hoạt động');
    expect(wrapper.text()).toContain('cron cuối');
  });
});
```

- [ ] **Step 2: Chạy để thấy FAIL**

Run: `npm run test:frontend`
Expected: FAIL — thiếu component/module.

- [ ] **Step 3: Implement**

`frontend/src/lib/format.ts` — thêm (cuối file):
```ts
export function formatDateTimeVN(ms: number): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(ms);
}
```

`frontend/src/admin/charts.ts`:
```ts
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Filler, Tooltip, Legend, Title,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend, Title);

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#6b7380';
}

export function chartTheme() {
  return { text: cssVar('--text'), muted: cssVar('--text-muted'), border: cssVar('--border') };
}
```

`frontend/src/admin/StatCard.vue`:
```vue
<script setup lang="ts">
import MdiIcon from '../components/MdiIcon.vue';

defineProps<{ label: string; value: string | number; hint?: string; icon: string }>();
</script>

<template>
  <article class="stat card">
    <div class="stat__icon"><MdiIcon :path="icon" :size="22" /></div>
    <div class="stat__body">
      <p class="stat__label">{{ label }}</p>
      <p class="stat__value">{{ value }}</p>
      <p v-if="hint" class="stat__hint">{{ hint }}</p>
    </div>
  </article>
</template>

<style scoped>
.stat { display: flex; gap: 14px; padding: 18px; }
.stat__icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border-radius: 10px; flex: none;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}
.stat__body { min-width: 0; }
.stat__label { margin: 0; font-size: 0.85rem; color: var(--text-muted); }
.stat__value { margin: 2px 0 0; font-size: 1.6rem; font-weight: 700; line-height: 1.2; }
.stat__hint { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-muted); }
</style>
```

`frontend/src/admin/TimeSeriesChart.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import { chartTheme } from './charts';
import type { StatsPoint } from '../api/admin';

const props = defineProps<{ points: StatsPoint[]; range: '24h' | '7d' }>();

const labels = computed(() =>
  props.points.map((p) => new Date(p.t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
);

const chartData = computed(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Messages', data: props.points.map((p) => p.messages), borderColor: '#2f6bff', backgroundColor: 'rgba(47,107,255,0.15)', fill: true, tension: 0.35, pointRadius: 0 },
    { label: 'Mailbox tạo mới', data: props.points.map((p) => p.mailboxes), borderColor: '#30a46c', backgroundColor: 'rgba(48,164,108,0.15)', fill: true, tension: 0.35, pointRadius: 0 },
  ],
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { labels: { color: chartTheme().text, boxWidth: 14, boxHeight: 14 } },
    tooltip: { backgroundColor: chartTheme().text, titleColor: chartTheme().border, bodyColor: chartTheme().border },
  },
  scales: {
    x: { ticks: { color: chartTheme().muted, maxTicksLimit: 8, maxRotation: 0 }, grid: { color: chartTheme().border } },
    y: { beginAtZero: true, ticks: { color: chartTheme().muted }, grid: { color: chartTheme().border } },
  },
}));
</script>

<template>
  <div class="chart-box">
    <Line :data="chartData" :options="options" />
  </div>
</template>

<style scoped>
.chart-box { position: relative; height: 280px; }
</style>
```

`frontend/src/admin/HealthPanel.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { formatDateTimeVN } from '../lib/format';
import type { AdminOverview, AdminConfig } from '../api/admin';

const props = defineProps<{ overview: AdminOverview | null; config: AdminConfig | null }>();

const lastRun = computed(() => (props.overview?.lastCronRunAt ? formatDateTimeVN(props.overview.lastCronRunAt) : 'Chưa có dữ liệu'));
</script>

<template>
  <section class="card health">
    <h2 class="health__title">Sức khỏe hệ thống</h2>
    <dl class="health__grid">
      <div><dt>Lần chạy cron cuối</dt><dd>{{ lastRun }}</dd></div>
      <div><dt>Mailbox đã dọn</dt><dd>{{ overview?.lastCronCleanup?.deletedMailboxes ?? '—' }}</dd></div>
      <div><dt>Messages đã dọn</dt><dd>{{ overview?.lastCronCleanup?.deletedMessages ?? '—' }}</dd></div>
      <div><dt>Domain</dt><dd>{{ config?.domain ?? '—' }}</dd></div>
      <div><dt>reCAPTCHA</dt><dd>{{ config?.recaptchaEnabled ? 'Bật' : 'Tắt' }}</dd></div>
    </dl>
  </section>
</template>

<style scoped>
.health { padding: 18px; }
.health__title { margin: 0 0 12px; font-size: 1rem; }
.health__grid { display: grid; gap: 8px 24px; margin: 0; }
.health__grid > div { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--border); padding: 6px 0; }
.health__grid dt { color: var(--text-muted); font-size: 0.9rem; }
.health__grid dd { margin: 0; font-weight: 600; font-size: 0.9rem; }
</style>
```

`frontend/src/admin/views/OverviewView.vue` — thay view tạm:
```vue
<script setup lang="ts">
import { watch, ref } from 'vue';
import { mdiInbox, mdiEmailFast, mdiEmailPlus, mdiShieldOff } from '@mdi/js';
import StatCard from '../StatCard.vue';
import TimeSeriesChart from '../TimeSeriesChart.vue';
import HealthPanel from '../HealthPanel.vue';
import { useAdminPolling } from '../useAdminPolling';
import { adminApi } from '../../api/admin';
import type { AdminConfig } from '../../api/admin';

const props = defineProps<{ refreshTick: number }>();

const overview = useAdminPolling(() => adminApi.overview());
const stats = useAdminPolling(() => adminApi.stats('24h'));
const config = useAdminPolling(() => adminApi.config());

watch(() => props.refreshTick, () => {
  void overview.refresh();
  void stats.refresh();
  void config.refresh();
});
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Tổng quan</h2>

    <div v-if="overview.error.value" class="admin-error">Không tải được dữ liệu: {{ overview.error.value }}</div>

    <div class="admin-grid admin-grid--stats">
      <StatCard label="Mailbox đang hoạt động" :value="overview.data.value?.activeMailboxes ?? '…'" :icon="mdiInbox" />
      <StatCard label="Messages (24h)" :value="overview.data.value?.messages24h ?? '…'" :hint="`${overview.data.value?.mailPerMinute ?? 0} mail/phút`" :icon="mdiEmailFast" />
      <StatCard label="Mailbox tạo mới (24h)" :value="overview.data.value?.mailboxesCreated24h ?? '…'" :icon="mdiEmailPlus" />
      <StatCard label="Bị chặn rate-limit (24h)" :value="overview.data.value?.rateLimited24h ?? '…'" :icon="mdiShieldOff" />
    </div>

    <div class="admin-grid admin-grid--wide">
      <article class="card admin-panel">
        <div class="admin-panel__head">
          <h3 class="admin-panel__title">Messages & Mailbox theo thời gian (24h)</h3>
        </div>
        <TimeSeriesChart :points="stats.data.value?.points ?? []" range="24h" />
      </article>
      <HealthPanel :overview="overview.data.value" :config="config.data.value" />
    </div>
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-grid--wide { grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1200px) {
  .admin-grid--wide { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
}
.admin-panel { padding: 18px; }
.admin-panel__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.admin-panel__title { margin: 0; font-size: 1rem; }
.admin-error {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid var(--danger);
  color: var(--danger);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
}
</style>

- [ ] **Step 4: Chạy lại — PASS**

Run: `npm run test:frontend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/format.ts frontend/src/lib/format.spec.ts frontend/src/admin
git commit -m "feat(admin): overview view with KPI, charts, health panel"
```

---

### Task 9: `DataTable` + `MailboxView` + `MessagesView`

**Files:**
- Create: `frontend/src/admin/DataTable.vue`, `frontend/src/admin/views/MailboxView.vue`, `frontend/src/admin/views/MessagesView.vue`
- Test: `frontend/src/admin/views/MailboxView.spec.ts`

**Interfaces:**
- Consumes: `adminApi`, `useAdminPolling` (Task 7), `formatDateTimeVN` (Task 8).
- Produces: `DataTable` (props: `columns: { key: string; label: string; render?: (row: unknown) => string }[]`, `rows: unknown[]`, `total: number`, `limit`, `offset`, events `update:offset`, `update:limit`); `MailboxView`/`MessagesView` (props `refreshTick`). Task 10 dùng `DataTable` cho event feed.

- [ ] **Step 1: Viết test fail**

`frontend/src/admin/views/MailboxView.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

import MailboxView from './MailboxView.vue';

const mailboxes = {
  mailboxes: [{ address: 'a@toolviet.net', created_at: 1_700_000_000_000, expires_at: 1_700_000_600_000 }],
  total: 1, limit: 20, offset: 0,
};

describe('MailboxView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(mailboxes), { status: 200 }));
  });

  it('renders mailbox rows', async () => {
    const wrapper = mount(MailboxView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.text()).toContain('a@toolviet.net');
    expect(wrapper.text()).toContain('Tổng: 1');
  });
});
```

- [ ] **Step 2: Chạy để thấy FAIL**

Run: `npm run test:frontend -- frontend/src/admin/views/MailboxView.spec.ts`
Expected: FAIL — thiếu module.

- [ ] **Step 3: Implement**

`frontend/src/admin/DataTable.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';

export interface Column {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => string;
}

const props = defineProps<{
  columns: Column[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}>();

const emit = defineEmits<{ 'update:offset': [value: number]; 'update:limit': [value: number] }>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.limit)));
const currentPage = computed(() => Math.floor(props.offset / props.limit) + 1);

function go(page: number): void {
  emit('update:offset', (page - 1) * props.limit);
}
</script>

<template>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i">
          <td v-for="col in columns" :key="col.key">{{ col.render ? col.render(row) : String(row[col.key] ?? '') }}</td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="columns.length" class="data-table__empty">Không có dữ liệu</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="table-pager">
    <span>Tổng: {{ total }}</span>
    <button :disabled="currentPage <= 1" @click="go(currentPage - 1)">Trước</button>
    <span>Trang {{ currentPage }} / {{ totalPages }}</span>
    <button :disabled="currentPage >= totalPages" @click="go(currentPage + 1)">Sau</button>
  </div>
</template>

<style scoped>
.table-wrap { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.data-table th, .data-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.data-table th { color: var(--text-muted); font-weight: 600; white-space: nowrap; }
.data-table td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
.data-table__empty { text-align: center; color: var(--text-muted); padding: 24px; }
.table-pager { display: flex; align-items: center; gap: 12px; padding-top: 12px; justify-content: flex-end; font-size: 0.85rem; }
.table-pager button {
  min-height: 32px; min-width: 32px; padding: 0 10px;
  border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text);
}
.table-pager button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
```

`frontend/src/admin/views/MailboxView.vue` — thay view tạm:
```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatDateTimeVN } from '../../lib/format';
import { useAdminPolling } from '../useAdminPolling';
import DataTable, { type Column } from '../DataTable.vue';
import { adminApi } from '../../api/admin';

const props = defineProps<{ refreshTick: number }>();

const limit = ref(20);
const offset = ref(0);
const page = useAdminPolling(() => adminApi.mailboxes(limit.value, offset.value));

watch(() => props.refreshTick, () => void page.refresh());
watch([limit, offset], () => void page.refresh());

const columns: Column[] = [
  { key: 'address', label: 'Địa chỉ' },
  { key: 'created_at', label: 'Tạo lúc', render: (r) => formatDateTimeVN(r.created_at as number) },
  { key: 'expires_at', label: 'Hết hạn', render: (r) => formatDateTimeVN(r.expires_at as number) },
];
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Mailbox</h2>
    <article class="card admin-panel">
      <DataTable
        :columns="columns"
        :rows="(page.data.value?.mailboxes ?? []) as Record<string, unknown>[]"
        :total="page.data.value?.total ?? 0"
        :limit="limit"
        :offset="offset"
        @update:offset="(v) => (offset = v)"
        @update:limit="(v) => (limit = v)"
      />
    </article>
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-panel { padding: 18px; }
</style>
```

`frontend/src/admin/views/MessagesView.vue` — thay view tạm:
```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatDateTimeVN } from '../../lib/format';
import { useAdminPolling } from '../useAdminPolling';
import DataTable, { type Column } from '../DataTable.vue';
import { adminApi } from '../../api/admin';

const props = defineProps<{ refreshTick: number }>();

const limit = ref(20);
const offset = ref(0);
const page = useAdminPolling(() => adminApi.messages(limit.value, offset.value));

watch(() => props.refreshTick, () => void page.refresh());
watch([limit, offset], () => void page.refresh());

const columns: Column[] = [
  { key: 'from_addr', label: 'Người gửi' },
  { key: 'subject', label: 'Tiêu đề' },
  { key: 'mailbox', label: 'Mailbox' },
  { key: 'received_at', label: 'Nhận lúc', render: (r) => formatDateTimeVN(r.received_at as number) },
];
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Messages</h2>
    <article class="card admin-panel">
      <DataTable
        :columns="columns"
        :rows="(page.data.value?.messages ?? []) as Record<string, unknown>[]"
        :total="page.data.value?.total ?? 0"
        :limit="limit"
        :offset="offset"
        @update:offset="(v) => (offset = v)"
        @update:limit="(v) => (limit = v)"
      />
    </article>
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-panel { padding: 18px; }
</style>
```

- [ ] **Step 4: Chạy lại — PASS**

Run: `npm run test:frontend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/admin/DataTable.vue frontend/src/admin/views/MailboxView.vue frontend/src/admin/views/MessagesView.vue frontend/src/admin/views/MailboxView.spec.ts
git commit -m "feat(admin): mailbox & messages views with paginated table"
```

---

### Task 10: `AbuseView` + `ConfigView`

**Files:**
- Create: `frontend/src/admin/TopBarChart.vue`, `frontend/src/admin/views/AbuseView.vue`, `frontend/src/admin/views/ConfigView.vue`
- Test: `frontend/src/admin/views/AbuseView.spec.ts`

**Interfaces:**
- Consumes: `adminApi`, `useAdminPolling` (Task 7), `TimeSeriesChart` (Task 8), `DataTable` (Task 9).
- Produces: `TopBarChart` (props: `items: { label: string; count: number }[]`, `title: string`); `AbuseView`/`ConfigView` (props `refreshTick`).

- [ ] **Step 1: Viết test fail**

`frontend/src/admin/views/AbuseView.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-chartjs', () => ({
  Line: { template: '<div class="mock-line" />' },
  Bar: { template: '<div class="mock-bar" />' },
}));
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: class {}, LinearScale: class {}, PointElement: class {},
  LineElement: class {}, BarElement: class {}, Filler: class {},
  Tooltip: class {}, Legend: class {}, Title: class {},
}));

import AbuseView from './AbuseView.vue';

const events = {
  events: [{ id: 1, type: 'rate_limited', ip_hash: 'abcd1234', address: null, detail: null, created_at: 1_700_000_000_000 }],
  total: 1, limit: 20, offset: 0,
};

describe('AbuseView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/top')) return new Response(JSON.stringify({ by: 'senders', items: [{ label: 'spam@x.com', count: 5 }] }), { status: 200 });
      if (String(url).includes('/events')) return new Response(JSON.stringify(events), { status: 200 });
      if (String(url).includes('/overview')) return new Response(JSON.stringify({}), { status: 200 });
      return new Response('{}', { status: 200 });
    });
  });

  it('renders top senders and event feed', async () => {
    const wrapper = mount(AbuseView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.text()).toContain('spam@x.com');
    expect(wrapper.text()).toContain('rate_limited');
  });
});
```

- [ ] **Step 2: Chạy để thấy FAIL**

Run: `npm run test:frontend -- frontend/src/admin/views/AbuseView.spec.ts`
Expected: FAIL — thiếu module.

- [ ] **Step 3: Implement**

`frontend/src/admin/TopBarChart.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import { chartTheme } from './charts';

const props = defineProps<{ title: string; items: { label: string; count: number }[] }>();

const labels = computed(() => props.items.map((i) => i.label.length > 24 ? `${i.label.slice(0, 24)}…` : i.label));
const chartData = computed(() => ({
  labels: labels.value,
  datasets: [{ label: 'Số lần', data: props.items.map((i) => i.count), backgroundColor: 'rgba(245,165,36,0.75)', borderColor: '#f5a524', borderWidth: 1 }],
}));

const options = computed(() => ({
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: chartTheme().text, titleColor: chartTheme().border, bodyColor: chartTheme().border } },
  scales: {
    x: { beginAtZero: true, ticks: { color: chartTheme().muted, precision: 0 }, grid: { color: chartTheme().border } },
    y: { ticks: { color: chartTheme().muted }, grid: { display: false } },
  },
}));
</script>

<template>
  <article class="card admin-panel">
    <h3 class="admin-panel__title">{{ title }}</h3>
    <div class="bar-box">
      <Bar :data="chartData" :options="options" />
    </div>
  </article>
</template>

<style scoped>
.admin-panel { padding: 18px; }
.admin-panel__title { margin: 0 0 12px; font-size: 1rem; }
.bar-box { position: relative; height: 260px; }
</style>
```

`frontend/src/admin/views/AbuseView.vue` — thay view tạm:
```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { mdiShieldOff, mdiShieldAlert } from '@mdi/js';
import StatCard from '../StatCard.vue';
import TopBarChart from '../TopBarChart.vue';
import TimeSeriesChart from '../TimeSeriesChart.vue';
import DataTable, { type Column } from '../DataTable.vue';
import { useAdminPolling } from '../useAdminPolling';
import { adminApi } from '../../api/admin';
import { formatDateTimeVN } from '../../lib/format';

const props = defineProps<{ refreshTick: number }>();

const senders = useAdminPolling(() => adminApi.top('senders', 10));
const ips = useAdminPolling(() => adminApi.top('ips', 10));
const overview = useAdminPolling(() => adminApi.overview());
const series = useAdminPolling(() => adminApi.stats('24h'));
const events = useAdminPolling(() => adminApi.events(null, 20, 0));

watch(() => props.refreshTick, () => {
  void senders.refresh();
  void ips.refresh();
  void overview.refresh();
  void series.refresh();
  void events.refresh();
});

const columns: Column[] = [
  { key: 'type', label: 'Loại' },
  { key: 'ip_hash', label: 'IP (hash)', render: (r) => (r.ip_hash as string | null)?.slice(0, 12) ?? '—' },
  { key: 'address', label: 'Mailbox', render: (r) => (r.address as string | null) ?? '—' },
  { key: 'created_at', label: 'Thời điểm', render: (r) => formatDateTimeVN(r.created_at as number) },
];
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Lạm dụng</h2>

    <div class="admin-grid admin-grid--stats">
      <StatCard label="Bị chặn rate-limit (24h)" :value="overview.data.value?.rateLimited24h ?? '…'" :icon="mdiShieldOff" />
      <StatCard label="reCAPTCHA fail (24h)" :value="overview.data.value?.recaptchaFailed24h ?? '…'" :icon="mdiShieldAlert" />
    </div>

    <div class="admin-grid admin-grid--charts">
      <TopBarChart title="Top người gửi (24h)" :items="senders.data.value?.items ?? []" />
      <TopBarChart title="Top IP tạo mailbox (24h)" :items="ips.data.value?.items ?? []" />
    </div>

    <article class="card admin-panel">
      <h3 class="admin-panel__title">Rate-limit & reCAPTCHA fail theo thời gian (24h)</h3>
      <TimeSeriesChart :points="series.data.value?.points ?? []" range="24h" />
    </article>

    <article class="card admin-panel">
      <h3 class="admin-panel__title">Sự kiện gần đây</h3>
      <DataTable
        :columns="columns"
        :rows="(events.data.value?.events ?? []) as Record<string, unknown>[]"
        :total="events.data.value?.total ?? 0"
        :limit="20"
        :offset="0"
        @update:offset="() => void events.refresh()"
        @update:limit="() => void events.refresh()"
      />
    </article>
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-grid--charts { grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1200px) { .admin-grid--charts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.admin-panel { padding: 18px; }
.admin-panel__title { margin: 0 0 12px; font-size: 1rem; }
.admin-grid { margin-bottom: 16px; }
</style>

`frontend/src/admin/views/ConfigView.vue` — thay view tạm:
```vue
<script setup lang="ts">
import { watch } from 'vue';
import { useAdminPolling } from '../useAdminPolling';
import { adminApi } from '../../api/admin';

const props = defineProps<{ refreshTick: number }>();
const config = useAdminPolling(() => adminApi.config());

watch(() => props.refreshTick, () => void config.refresh());
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Cấu hình</h2>
    <article class="card admin-panel">
      <h3 class="admin-panel__title">Cấu hình hệ thống (chỉ đọc)</h3>
      <dl class="config-list">
        <div><dt>Domain</dt><dd>{{ config.data.value?.domain ?? '…' }}</dd></div>
        <div><dt>reCAPTCHA</dt><dd>{{ config.data.value?.recaptchaEnabled ? 'Bật' : 'Tắt' }}</dd></div>
        <div>
          <dt>Bypass xác thực (dev)</dt>
          <dd class="config-list__warn" :class="{ 'config-list__on': config.data.value?.devBypassEnabled }">
            {{ config.data.value?.devBypassEnabled ? 'ĐANG BẬT — cảnh báo' : 'Tắt' }}
          </dd>
        </div>
      </dl>
    </article>
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-panel { padding: 18px; }
.admin-panel__title { margin: 0 0 12px; font-size: 1rem; }
.config-list { display: grid; gap: 10px; margin: 0; }
.config-list > div { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--border); padding: 8px 0; }
.config-list dt { color: var(--text-muted); }
.config-list dd { margin: 0; font-weight: 600; }
.config-list__on { color: var(--danger); }
</style>
```

- [ ] **Step 4: Chạy lại — PASS**

Run: `npm run test:frontend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/admin/TopBarChart.vue frontend/src/admin/views/AbuseView.vue frontend/src/admin/views/ConfigView.vue frontend/src/admin/views/AbuseView.spec.ts
git commit -m "feat(admin): abuse monitoring + config views"
```

---

### Task 11: Hoàn thiện styling + responsive + a11y + verify toàn bộ

**Files:**
- Modify: `frontend/src/styles/admin.css` (tinh chỉnh), `frontend/src/admin/AdminApp.vue` (nếu cần focus/aria), `frontend/src/api/admin.ts` (không đổi), `src/env.ts` (không đổi)
- No new logic — chỉ verification + tinh chỉnh nhỏ.

**Interfaces:** không đổi.

- [ ] **Step 1: Chạy typecheck worker + frontend**

Run: `npx tsc --noEmit`
Expected: PASS (đã có tiền lệ `bb9ba17` "make worker-side typecheck pass").
Nếu lỗi type ở file mới, sửa. Đặc biệt: `parsePaging` trong `admin.ts` — nếu type `Parameters<...>` khó, thay bằng:
```ts
import { Hono } from 'hono';
import type { Context } from 'hono';
function parsePaging(c: Context<{ Bindings: Env }>): { limit: number; offset: number } {
  const rawLimit = Number(c.req.query('limit'));
  const rawOffset = Number(c.req.query('offset'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}
```
Run: `npm run build:frontend` — PASS (vite build + vue-tsc nếu cấu hình).

- [ ] **Step 2: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS — toàn bộ worker + frontend tests.

- [ ] **Step 3: Kiểm tra a11y cơ bản (manual review)**

- Mỗi `button` trong sidebar có text/aria-label; `aria-current="page"` cho nav active.
- Focus trap không bắt buộc (không có modal admin).
- Color contrast: dùng CSS vars sẵn; kiểm tra tông tối (`prefers-color-scheme: dark`) — chart theme đọc `--text`/`--border` từ CSS var nên tự đổi màu.
- `prefers-reduced-motion` đã có sẵn trong `main.css`.
- Nếu phát hiện vấn đề, sửa inline trong `admin.css`/component rồi chạy lại test tương ứng.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(admin): final polish, typecheck, and full test pass"
```

- [ ] **Step 5: (Tùy chọn) Chạy `npm run dev` và mở `/admin` local để xem shell**

```bash
npm run dev
```
Mở `http://localhost:8787/admin` — với `ADMIN_DEV_BYPASS=true` ở `.dev.vars`, dashboard hiển thị dữ liệu local. Kiểm tra sidebar, nav, các view không có lỗi console.

---

## Self-Review

**Spec coverage:**
- Xác thực CF Access JWT → Task 2 + 3. ✅
- Migration `admin_events` + instrumentation (mailbox_created/rate_limited/recaptcha_failed/cron_cleanup) + prune 7 ngày → Task 1 + 4. ✅
- Endpoints overview/stats/top/events/mailboxes/messages/config → Task 3 (config), 5 (overview/stats), 6 (top/events/mailboxes/messages). ✅
- Frontend `/admin` path branch + AdminApp shell + sidebar/topbar + auto-refresh 30s → Task 7. ✅
- KPI + health, charts, bảng, abuse → Task 8 (KPI+health+chart), 9 (mailbox/messages tables), 10 (abuse+config). ✅
- Tiếng Việt, format VN, responsive, dark mode, no vue-router, read-only, không leak secret → Global Constraints + các task. ✅
- `formatDateTimeVN` → Task 8. ✅
- Env vars + docs deployment → Task 3. ✅

**Placeholder scan:** không có "TBD/TODO"; mọi bước đều có code hoặc lệnh cụ thể. Hai chỗ có ghi chú triển khai (icon MDI hardcode, type `parsePaging`) đều kèm hướng dẫn xử lý thay thế.

**Type consistency:**
- `logEvent`/`pruneEvents` signatures Task 1 → dùng Task 4, 5. ✅
- `verifyAccessJwt(jwt, { teamDomain, audience })` Task 2 → Task 3 dùng đúng. ✅
- `adminApi.stats('24h')` / `top('senders', 10)` / `events(type, limit, offset)` Task 7 → dùng Task 8-10. ✅
- `useAdminPolling<T>` → `{ data, loading, error, refresh }`; các view dùng `data.value?.x`. ✅
- `DataTable` props/events Task 9 → dùng Task 10. ✅
- `AdminEventType`/`AdminEventRow`/`AdminOverview`/`StatsPoint`/`AdminMailboxRow`/`AdminMessageRow` env.ts → queries + routes + admin client dùng khớp tên field (`created_at`, `ip_hash`, `received_at`...). ✅
