import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, ApiClientError } from './client';

afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  it('injects bearer token and parses json', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const res = await api.get<{ ok: boolean }>('/api/health', { token: 'abc' });
    expect(res).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer abc');
  });

  it('throws ApiClientError with code on error json', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many' } }), { status: 429 }),
    );
    await expect(api.post('/api/mailbox', { custom: 'x' })).rejects.toMatchObject({
      status: 429, code: 'RATE_LIMITED',
    });
  });

  it('throws generic error when response is not json', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }));
    await expect(api.get('/x')).rejects.toBeInstanceOf(ApiClientError);
  });
});
