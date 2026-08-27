// `env` từ cloudflare:test / cloudflare:workers được type là Cloudflare.Env, mà
// interface đó mặc định RỖNG trong @cloudflare/workers-types — project phải tự khai
// báo bổ sung. Test env (do vitest-pool-workers cung cấp) thoả mãn Env của app
// (wrangler.toml [vars] + D1 + ASSETS) và thêm binding miniflare TEST_MIGRATIONS.
// (Giữ đồng bộ với src/env.ts khi thêm binding mới.)
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    DOMAIN: string;
    SALT_TOKEN: string;
    SALT_IP: string;
    RECAPTCHA_SITE_KEY?: string;
    RECAPTCHA_SECRET_KEY?: string;
    RECAPTCHA_THRESHOLD?: string;
    ADMIN_API_KEY?: string;
    ADMIN_DEV_BYPASS?: string;
    TEST_MIGRATIONS: import('@cloudflare/vitest-pool-workers').D1Migration[];
  }
}
