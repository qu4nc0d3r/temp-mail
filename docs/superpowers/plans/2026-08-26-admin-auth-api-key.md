# Admin Auth: API Key + Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cloudflare Access JWT admin auth (paid) with a self-hosted Admin API key + HMAC session token (free), including a Vietnamese login screen.

**Architecture:** `POST /api/admin/login` verifies an `ADMIN_API_KEY` env secret (constant-time compare) and issues an HMAC-SHA256-signed session token (2h expiry, Web Crypto, no new deps). `requireAdmin` verifies the Bearer session. Frontend stores the token in `sessionStorage` via a reactive module, shows a login screen when absent, sends `Authorization: Bearer` on every admin API call, and swaps back to login on 401.

**Tech Stack:** Cloudflare Worker + Hono + D1 + Vue 3, Web Crypto HMAC.

**Spec:** `docs/superpowers/specs/2026-08-26-admin-dashboard-design.md` (section 1 replaced by this change).

## Global Constraints

- No new dependencies.
- UI copy stays Vietnamese.
- Auth must fail closed: missing env `ADMIN_API_KEY`, missing/malformed/expired session → 401. `ADMIN_DEV_BYPASS === 'true'` is the ONLY bypass.
- Session TTL = 2 hours. Signature key = the `ADMIN_API_KEY` value (rotating the key revokes all sessions).
- `verifyAdminSession` never throws — malformed input returns false.
- No secrets in `wrangler.toml [vars]`; `ADMIN_API_KEY` is set via `wrangler secret put`.
- Never leak the API key or session material in logs/errors.

---

### Task 1: Backend — admin-session + requireAdmin rewrite + /login

**Files:**
- Create: `src/lib/admin-session.ts`
- Modify: `src/lib/auth.ts`, `src/routes/admin.ts`, `src/env.ts`, `tests/env.d.ts`, `vitest.config.ts`, `tests/admin.test.ts`
- Delete: `src/lib/access-jwt.ts`, `tests/access-jwt.test.ts`

**Interfaces:**
- Produces: `createAdminSession(secret, nowMs) → { token, expiresAt }`, `verifyAdminSession(token, secret, nowMs) → boolean`, `constantTimeEqual(a, b) → boolean`, `ADMIN_SESSION_TTL_MS = 2h` (from `src/lib/admin-session.ts`). `POST /api/admin/login` → `{ token, expiresAt, serverTime }` (from `src/routes/admin.ts`). Task 2 consumes `adminApi.login` + the Bearer session.

- [ ] **Step 1: Write the failing tests**

Rewrite the `requireAdmin middleware` describe in `tests/admin.test.ts` (keep the `makeAdminApp` fixture and the SELF-based `/config`, `/overview`, `/stats`, lists describes as-is):

```ts
import { createAdminSession } from '../src/lib/admin-session';

// replace the ACCESS vars in the imports comment if present; keep others

describe('requireAdmin middleware', () => {
  it('rejects when bypass off and no bearer token', async () => {
    const app = makeAdminApp({});
    const res = await app.request('/ping', {}, { ...env, ADMIN_DEV_BYPASS: undefined });
    expect(res.status).toBe(401);
  });

  it('rejects when bypass off and ADMIN_API_KEY not configured', async () => {
    const app = makeAdminApp({});
    // env từ cloudflare:test đã có ADMIN_API_KEY (miniflare bindings) — phải override về undefined.
    const res = await app.request('/ping', { headers: { authorization: 'Bearer x.y.z' } }, { ...env, ADMIN_DEV_BYPASS: undefined, ADMIN_API_KEY: undefined });
    expect(res.status).toBe(401);
  });

  it('rejects when bypass off and token is invalid', async () => {
    const app = makeAdminApp({});
    const res = await app.request('/ping', { headers: { authorization: 'Bearer garbage.token.here' } }, { ...env, ADMIN_DEV_BYPASS: undefined, ADMIN_API_KEY: 'test-key' });
    expect(res.status).toBe(401);
  });

  it('rejects when bypass off and session is expired', async () => {
    const app = makeAdminApp({});
    const { token } = await createAdminSession('test-key', Date.now() - 3 * 60 * 60 * 1000);
    const res = await app.request('/ping', { headers: { authorization: `Bearer ${token}` } }, { ...env, ADMIN_DEV_BYPASS: undefined, ADMIN_API_KEY: 'test-key' });
    expect(res.status).toBe(401);
  });

  it('accepts a valid session', async () => {
    const app = makeAdminApp({});
    const { token } = await createAdminSession('test-key', Date.now());
    const res = await app.request('/ping', { headers: { authorization: `Bearer ${token}` } }, { ...env, ADMIN_DEV_BYPASS: undefined, ADMIN_API_KEY: 'test-key' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/login', () => {
  it('rejects wrong key', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });

  it('issues a session for the correct key', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'test-admin-api-key' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ token: string; expiresAt: number }>();
    expect(typeof body.token).toBe('string');
    expect(body.token.split('.')).toHaveLength(2);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects non-string or empty key body', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 123 }),
    });
    expect(res.status).toBe(401);
  });
});
```

Add to `vitest.config.ts` `miniflare.bindings`: `ADMIN_API_KEY: 'test-admin-api-key',` (keep `ADMIN_DEV_BYPASS: 'true'` — SELF tests stay bypassed; the login route does NOT bypass and uses this key).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:worker -- tests/admin.test.ts`
Expected: FAIL — login route missing (404), middleware assertions fail (401 not produced as expected), `createAdminSession` module not found.

- [ ] **Step 3: Implement**

`src/lib/admin-session.ts` (new):

```ts
import { generateId } from './token';

export const ADMIN_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

interface AdminSessionPayload {
  exp: number;
  nonce: string;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function createAdminSession(secret: string, nowMs: number): Promise<{ token: string; expiresAt: number }> {
  const exp = nowMs + ADMIN_SESSION_TTL_MS;
  const payload = JSON.stringify({ exp, nonce: generateId() });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64)));
  return { token: `${payloadB64}.${toBase64Url(sig)}`, expiresAt: exp };
}

export async function verifyAdminSession(token: string, secret: string, nowMs: number): Promise<boolean> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0 || dot === token.length - 1) return false;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let sig: Uint8Array;
  try { sig = fromBase64Url(sigB64); } catch { return false; }
  const key = await hmacKey(secret);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64)));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig[i] ^ expected[i];
  if (diff !== 0) return false;
  let payload: AdminSessionPayload;
  try { payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as AdminSessionPayload; } catch { return false; }
  return typeof payload.exp === 'number' && Number.isFinite(payload.exp) && payload.exp > nowMs;
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

`src/lib/auth.ts` — replace the `requireAdmin` function (keep `authenticate` and the mailbox imports/hashToken untouched; remove `verifyAccessJwt` import, add `verifyAdminSession`):

```ts
import { verifyAdminSession } from './admin-session';
// remove: import { verifyAccessJwt } from './access-jwt';

export async function requireAdmin(c: Context<{ Bindings: Env }>, next: () => Promise<void>): Promise<Response | void> {
  if (c.env.ADMIN_DEV_BYPASS === 'true') return next();
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Missing admin credentials');
  const apiKey = c.env.ADMIN_API_KEY;
  if (!apiKey) throw new ApiError(401, 'UNAUTHORIZED', 'Admin auth not configured');
  // verifyAdminSession never throws (malformed/expired → false) → fail-closed 401.
  const ok = await verifyAdminSession(token, apiKey, Date.now());
  if (!ok) throw new ApiError(401, 'UNAUTHORIZED', 'Invalid admin credentials');
  return next();
}
```

`src/routes/admin.ts` — add imports and the `/login` route BEFORE `adminRoutes.use('*', requireAdmin)`:

```ts
import { ApiError } from '../lib/errors';
import { createAdminSession, constantTimeEqual } from '../lib/admin-session';
// ... existing imports ...

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.post('/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { apiKey?: unknown };
  const apiKey = c.env.ADMIN_API_KEY;
  if (!apiKey) throw new ApiError(401, 'UNAUTHORIZED', 'Admin auth not configured');
  const nowMs = Date.now();
  if (typeof body.apiKey !== 'string' || !constantTimeEqual(body.apiKey, apiKey)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials');
  }
  const { token, expiresAt } = await createAdminSession(apiKey, nowMs);
  return c.json({ token, expiresAt, serverTime: nowMs });
});

adminRoutes.use('*', requireAdmin);
// ... rest unchanged ...
```

`src/env.ts` — replace the two ACCESS_* optional fields with:
```ts
ADMIN_API_KEY?: string;
```
(keep `ADMIN_DEV_BYPASS?: string;`). Do the same replacement in `tests/env.d.ts`.

Delete `src/lib/access-jwt.ts` and `tests/access-jwt.test.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:worker`
Expected: PASS (all suites, 80 + the new login/middleware tests). Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src tests vitest.config.ts
git rm src/lib/access-jwt.ts tests/access-jwt.test.ts
git commit -m "feat(admin): self-hosted API-key auth with HMAC sessions (replaces CF Access)"
```

---

### Task 2: Frontend — login screen + Bearer sessions

**Files:**
- Create: `frontend/src/admin/session.ts`, `frontend/src/admin/AdminLogin.vue`, `frontend/src/admin/AdminLogin.spec.ts`
- Modify: `frontend/src/api/admin.ts`, `frontend/src/admin/AdminApp.vue`, `frontend/src/admin/AdminApp.spec.ts`

**Interfaces:**
- Consumes: `createAdminSession` session tokens from the `/login` route (Task 1); `api.get/post` with `{ token }` option.
- Produces: `adminSession` (reactive `shallowRef<string | null>`), `getAdminToken()`, `setAdminToken(token|null)`, `adminApi.login(apiKey)`, `adminApi.logout()` — Task 3 uses none directly.

- [ ] **Step 1: Write the failing tests**

`frontend/src/admin/AdminLogin.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AdminLogin from './AdminLogin.vue';
import { getAdminToken, setAdminToken } from './session';

describe('AdminLogin', () => {
  beforeEach(() => {
    setAdminToken(null);
    vi.restoreAllMocks();
  });

  it('hiển thị form đăng nhập', () => {
    const wrapper = mount(AdminLogin);
    expect(wrapper.text()).toContain('Khóa quản trị');
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
  });

  it('đăng nhập sai hiển thị lỗi', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }), {
        status: 401, headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;
    const wrapper = mount(AdminLogin);
    await wrapper.find('input').setValue('sai-khoa');
    await wrapper.find('form').trigger('submit');
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.text()).toContain('Sai khóa quản trị');
  });

  it('đăng nhập đúng set session', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'tk', expiresAt: Date.now() + 7200_000, serverTime: Date.now() }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;
    const wrapper = mount(AdminLogin);
    await wrapper.find('input').setValue('dung-khoa');
    await wrapper.find('form').trigger('submit');
    await new Promise((r) => setTimeout(r, 20));
    expect(getAdminToken()).toBe('tk');
  });
});
```

Update `frontend/src/admin/AdminApp.spec.ts` — seed the session before each test so the shell renders (and add a login-gate case). Add to the top:

```ts
import { setAdminToken } from './session';
// in beforeEach (before mounting): setAdminToken('test-session');
```

Add one test:
```ts
it('hiển thị màn hình đăng nhập khi chưa có session', () => {
  setAdminToken(null);
  const wrapper = mount(AdminApp);
  expect(wrapper.text()).toContain('Khóa quản trị');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:frontend`
Expected: FAIL — `session.ts` module not found; AdminApp.spec shell assertions fail (login shown instead).

- [ ] **Step 3: Implement**

`frontend/src/admin/session.ts`:

```ts
import { shallowRef } from 'vue';

const SESSION_KEY = 'tm-admin-session';

export const adminSession = shallowRef<string | null>(sessionStorage.getItem(SESSION_KEY));

export function getAdminToken(): string | null {
  return adminSession.value;
}

export function setAdminToken(token: string | null): void {
  if (token === null) sessionStorage.removeItem(SESSION_KEY);
  else sessionStorage.setItem(SESSION_KEY, token);
  adminSession.value = token;
}
```

`frontend/src/api/admin.ts` — add the session import + login/logout + token on every protected call (keep all interfaces and response shapes identical):

```ts
import { api, ApiClientError } from './client';
import { adminSession, setAdminToken } from '../admin/session';
// ... interfaces unchanged ...

async function guard<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    // Session hết hạn/sai → quay về màn hình đăng nhập.
    if (e instanceof ApiClientError && e.status === 401) setAdminToken(null);
    throw e;
  }
}

export const adminApi = {
  login: async (apiKey: string) => {
    const res = await api.post<{ token: string; expiresAt: number; serverTime: number }>('/api/admin/login', { apiKey });
    setAdminToken(res.token);
    return res;
  },
  logout: () => setAdminToken(null),
  overview: () => guard(api.get<AdminOverview>('/api/admin/overview', { token: adminSession.value })),
  stats: (range: '24h' | '7d') =>
    guard(api.get<{ range: string; points: StatsPoint[] }>(`/api/admin/stats?range=${range}`, { token: adminSession.value })),
  top: (by: 'senders' | 'ips', limit = 10) =>
    guard(api.get<{ by: string; items: { label: string; count: number }[] }>(`/api/admin/top?by=${by}&limit=${limit}`, { token: adminSession.value })),
  events: (type: string | null, limit = 20, offset = 0) =>
    guard(api.get<AdminEventsResponse>(`/api/admin/events?${type ? `type=${type}&` : ''}limit=${limit}&offset=${offset}`, { token: adminSession.value })),
  mailboxes: (limit = 20, offset = 0) =>
    guard(api.get<AdminMailboxesResponse>(`/api/admin/mailboxes?limit=${limit}&offset=${offset}`, { token: adminSession.value })),
  messages: (limit = 20, offset = 0) =>
    guard(api.get<AdminMessagesResponse>(`/api/admin/messages?limit=${limit}&offset=${offset}`, { token: adminSession.value })),
  config: () => guard(api.get<AdminConfig>('/api/admin/config', { token: adminSession.value })),
};
```

`frontend/src/admin/AdminLogin.vue` (new — Vietnamese form, use MdiIcon, keep copy exact):

```vue
<script setup lang="ts">
import { ref } from 'vue';
import MdiIcon from '../components/MdiIcon.vue';
import { mdiLock, mdiLogin } from '@mdi/js';
import { adminApi } from '../api/admin';
import { ApiClientError } from '../api/client';

const apiKey = ref('');
const error = ref<string | null>(null);
const loading = ref(false);

async function onSubmit() {
  error.value = null;
  if (!apiKey.value) { error.value = 'Nhập khóa quản trị'; return; }
  loading.value = true;
  try {
    await adminApi.login(apiKey.value);
    // Thành công: adminApi.login set adminSession → AdminApp tự chuyển sang dashboard.
  } catch (e) {
    error.value = e instanceof ApiClientError && e.status === 401
      ? 'Sai khóa quản trị'
      : 'Không kết nối được máy chủ';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login-wrap">
    <form class="card login" @submit.prevent="onSubmit">
      <h1 class="login__title"><MdiIcon :path="mdiLock" :size="24" /> Quản trị Temp Mail</h1>
      <p class="login__hint">Nhập khóa quản trị để vào bảng điều khiển.</p>
      <label class="login__label" for="apikey">Khóa quản trị</label>
      <input
        id="apikey"
        v-model="apiKey"
        class="login__input"
        type="password"
        autocomplete="current-password"
        :disabled="loading"
        placeholder="••••••••"
      />
      <p v-if="error" class="login__error" role="alert">{{ error }}</p>
      <button class="login__submit" type="submit" :disabled="loading">
        <MdiIcon :path="mdiLogin" :size="18" /> {{ loading ? 'Đang đăng nhập…' : 'Đăng nhập' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.login { width: 100%; max-width: 380px; padding: 28px; }
.login__title { margin: 0 0 8px; font-size: 1.2rem; display: flex; align-items: center; gap: 8px; }
.login__hint { margin: 0 0 20px; color: var(--text-muted); font-size: 0.9rem; }
.login__label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.9rem; }
.login__input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border, #d0d5dd); background: var(--bg-card, #fff); color: var(--text, #111); }
.login__error { color: var(--danger); font-size: 0.9rem; margin: 12px 0 0; }
.login__submit { display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin-top: 16px; width: 100%; background: var(--accent); color: #fff; padding: 10px 16px; border-radius: 8px; font-weight: 600; }
.login__submit:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
```

`frontend/src/admin/AdminApp.vue` — add the login gate + logout:
- `import { adminSession } from './session';` and `import { adminApi } from '../api/admin';` and `import AdminLogin from './AdminLogin.vue';` and add `mdiLogout` to the `@mdi/js` import.
- Template: wrap the shell in `v-if="adminSession === null"` → render `<AdminLogin />`, `v-else` → the existing `.admin-shell` div.
- Topbar: add a logout button after the refresh button:
```vue
<button class="btn-icon" aria-label="Đăng xuất" title="Đăng xuất" @click="adminApi.logout()">
  <MdiIcon :path="mdiLogout" :size="20" />
</button>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:frontend` then `npx vue-tsc --noEmit`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/admin frontend/src/api/admin.ts
git commit -m "feat(admin): login screen + bearer sessions on admin API"
```

---

### Task 3: Config, docs, full verify, deploy

**Files:**
- Modify: `.dev.vars.example`, `docs/deployment.md`

- [ ] **Step 1: Update config + docs**

`.dev.vars.example` — replace the two ACCESS_* lines with:
```
ADMIN_API_KEY=change-me-local-admin-key
```
(keep `ADMIN_DEV_BYPASS=true`).

`docs/deployment.md` — replace the `## Cloudflare Access cho /admin` section with:

```md
## Xác thực admin (Admin API key)

1. Tạo khóa mạnh: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Set secret (KHÔNG đặt trong wrangler.toml `[vars]`):
   `npx wrangler secret put ADMIN_API_KEY`
3. Truy cập `https://<domain>/admin` → nhập khóa → được cấp session 2 giờ
   (HMAC-SHA256, tự lưu trong sessionStorage). Đăng xuất hoặc hết hạn → nhập lại.
4. Chỉ set `ADMIN_DEV_BYPASS=true` ở .dev.vars local — KHÔNG đặt ở production.
   Nếu lỡ bật ở production, dashboard hiển thị cảnh báo đỏ trên trang Tổng quan.
```

- [ ] **Step 2: Full verification**

Run: `npm test` (worker + frontend), `npx tsc --noEmit`, `npx vue-tsc --noEmit`, `npm run build:frontend`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .dev.vars.example docs/deployment.md
git commit -m "docs(admin): API-key auth instructions replace Cloudflare Access"
```

- [ ] **Step 4: Deploy (controller-driven, not in the plan agent)**

Push branch → open PR → merge → `wrangler d1 migrations apply temp-mail --remote` (no new migration) → `npm run deploy` → `wrangler secret put ADMIN_API_KEY` (generate a strong key, set it, show the admin once).
