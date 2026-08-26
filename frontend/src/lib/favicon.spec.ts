import { describe, it, expect, beforeEach } from 'vitest';
import { buildFaviconSvg, updateFavicon } from './favicon';

describe('favicon', () => {
  beforeEach(() => {
    document.head.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove());
  });

  it('builds a base icon without a badge when count is 0', () => {
    const svg = buildFaviconSvg(0);
    expect(svg).toContain('#2f6bff');
    expect(svg).toContain('2f6bff');
    expect(svg).not.toContain('e5484d');
  });

  it('adds a red badge with the count', () => {
    const svg = buildFaviconSvg(3);
    expect(svg).toContain('#e5484d');
    expect(svg).toContain('>3<');
  });

  it('caps the badge at 9+', () => {
    const svg = buildFaviconSvg(12);
    expect(svg).toContain('9+');
    expect(svg).not.toContain('>12<');
  });

  it('updateFavicon sets a data-URL icon link', () => {
    updateFavicon(2);
    const link = document.querySelector('link[rel="icon"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toMatch(/^data:image\/svg\+xml,/);
    expect(link?.getAttribute('href')).toContain('2f6bff');
  });

  it('updateFavicon replaces an existing icon link', () => {
    updateFavicon(2);
    updateFavicon(5);
    const links = document.querySelectorAll('link[rel="icon"]');
    expect(links).toHaveLength(1);
  });
});
