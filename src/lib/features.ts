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
