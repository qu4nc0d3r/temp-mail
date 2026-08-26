import { describe, it, expect, vi, afterEach } from 'vitest';
import { adminApi } from './admin';

afterEach(() => vi.restoreAllMocks());

describe('adminApi', () => {
  it('fetches overview', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ activeMailboxes: 3 }), { status: 200 }),
    );
    const res = await adminApi.overview();
    expect((res as { activeMailboxes: number }).activeMailboxes).toBe(3);
    expect(fetch).toHaveBeenCalledWith('/api/admin/overview', expect.anything());
  });

  it('appends range and limit query params', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ range: '24h', points: [] }), { status: 200 }),
    );
    await adminApi.stats('24h');
    const url = (fetchMock.mock.calls[0][0] as string);
    expect(url).toContain('range=24h');
  });
});
