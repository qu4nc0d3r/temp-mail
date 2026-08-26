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
    expect(isAdminPath('/administrator')).toBe(false);
    expect(isAdminPath('/administer')).toBe(false);
  });
});
