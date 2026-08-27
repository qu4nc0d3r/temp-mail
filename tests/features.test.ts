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
