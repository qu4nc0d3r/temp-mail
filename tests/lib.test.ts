import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { generateToken, generateId, hashToken, hashIp } from '../src/lib/token';
import { validateLocalPart, RESERVED_NAMES } from '../src/lib/validate';
import { makePreview, stripHtml } from '../src/lib/text';

describe('health', () => {
  it('returns ok', async () => {
    const res = await SELF.fetch('https://example.com/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('token', () => {
  it('generateToken is 64 hex chars and unique-ish', async () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('hashToken is deterministic and salted', async () => {
    expect(await hashToken('abc', 's')).toBe(await hashToken('abc', 's'));
    expect(await hashToken('abc', 's')).not.toBe(await hashToken('abc', 't'));
  });

  it('hashIp differs by ip', async () => {
    expect(await hashIp('1.2.3.4', 'salt')).not.toBe(await hashIp('5.6.7.8', 'salt'));
  });

  it('generateId is 16 hex chars', () => {
    expect(generateId()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('validateLocalPart', () => {
  it('accepts valid lowercase names', () => {
    expect(validateLocalPart('john')).toEqual({ ok: true, value: 'john' });
    expect(validateLocalPart('JOHN.SMITH_2')).toEqual({ ok: true, value: 'john.smith_2' });
  });

  it('rejects too short / too long', () => {
    expect(validateLocalPart('ab').ok).toBe(false);
    expect(validateLocalPart('a'.repeat(31)).ok).toBe(false);
  });

  it('rejects invalid characters', () => {
    expect(validateLocalPart('john@x').ok).toBe(false);
    expect(validateLocalPart('john smith').ok).toBe(false);
    expect(validateLocalPart('john+tag').ok).toBe(false);
  });

  it('rejects reserved names', () => {
    for (const name of RESERVED_NAMES) {
      expect(validateLocalPart(name).ok).toBe(false);
    }
  });
});

describe('text', () => {
  it('makePreview collapses whitespace and truncates', () => {
    expect(makePreview('  hello\n  world ')).toBe('hello world');
    expect(makePreview('x'.repeat(300)).length).toBe(200);
  });

  it('stripHtml removes tags and decodes entities', () => {
    const out = stripHtml('<p>Hello <b>world</b></p> &amp; more');
    expect(out).toContain('Hello');
    expect(out).toContain('world');
    expect(out).toContain('&');
    expect(out).not.toContain('<');
  });
});
