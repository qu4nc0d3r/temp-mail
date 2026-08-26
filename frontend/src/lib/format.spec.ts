import { describe, it, expect } from 'vitest';
import { formatDateTimeVN } from './format';

describe('formatDateTimeVN', () => {
  it('formats a timestamp as Vietnamese short date+time', () => {
    const s = formatDateTimeVN(new Date(2026, 7, 24, 14, 32).getTime());
    expect(s).toContain('24/8/2026');
    expect(s).toContain('14:32');
  });

  it('returns an em dash for null/undefined instead of the current instant', () => {
    expect(formatDateTimeVN(null)).toBe('—');
    expect(formatDateTimeVN(undefined)).toBe('—');
  });
});
