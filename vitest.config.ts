import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Force reCAPTCHA off in tests regardless of .dev.vars so the
            // existing mailbox integration tests keep passing without tokens.
            RECAPTCHA_SECRET_KEY: '',
            RECAPTCHA_SITE_KEY: 'test-site-key',
            RECAPTCHA_THRESHOLD: '0.5',
            // Cho phép test admin qua SELF mà không cần CF Access thật.
            ADMIN_DEV_BYPASS: 'true',
          },
        },
      }),
    ],
    test: {
      include: ['tests/**/*.test.ts'],
    },
  };
});
