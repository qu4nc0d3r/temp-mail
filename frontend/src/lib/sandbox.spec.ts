import { describe, it, expect } from 'vitest';
import { buildSrcdoc } from './sandbox';

describe('buildSrcdoc', () => {
  it('wraps html in sandboxed doc with csp', () => {
    const doc = buildSrcdoc('<p>hi</p>');
    expect(doc).toContain("content=\"default-src 'none'");
    expect(doc).toContain('<p>hi</p>');
  });
});
