import { api, ApiClientError } from './client';
import { adminSession, setAdminToken } from '../admin/session';

export interface AdminOverview {
  activeMailboxes: number;
  messages24h: number;
  mailPerMinute: number;
  mailboxesCreated24h: number;
  rateLimited24h: number;
  rateLimited7d: number;
  recaptchaFailed24h: number;
  recaptchaFailed7d: number;
  lastCronRunAt: number | null;
  lastCronCleanup: { deletedMailboxes: number; deletedMessages: number } | null;
  serverTime: number;
}

export interface StatsPoint {
  t: number;
  messages: number;
  mailboxes: number;
  rateLimited: number;
  recaptchaFailed: number;
}

export interface AdminMailboxRow { address: string; created_at: number; expires_at: number }
export interface AdminMessageRow {
  id: string; mailbox: string; from_name: string | null; from_addr: string;
  subject: string | null; preview: string; received_at: number;
}
export interface AdminEventRow {
  id: number; type: string; ip_hash: string | null; address: string | null;
  detail: string | null; created_at: number;
}

export interface Paged { total: number; limit: number; offset: number }
export interface AdminMailboxesResponse extends Paged { mailboxes: AdminMailboxRow[] }
export interface AdminMessagesResponse extends Paged { messages: AdminMessageRow[] }
export interface AdminEventsResponse extends Paged { events: AdminEventRow[] }
export interface AdminConfig { domain: string; recaptchaEnabled: boolean; devBypassEnabled: boolean }

async function guard<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    // Session hết hạn/sai → quay về màn hình đăng nhập.
    if (e instanceof ApiClientError && e.status === 401) setAdminToken(null);
    throw e;
  }
}

export const adminApi = {
  login: async (apiKey: string) => {
    const res = await api.post<{ token: string; expiresAt: number; serverTime: number }>('/api/admin/login', { apiKey });
    setAdminToken(res.token);
    return res;
  },
  logout: () => setAdminToken(null),
  overview: () => guard(api.get<AdminOverview>('/api/admin/overview', { token: adminSession.value })),
  stats: (range: '24h' | '7d') =>
    guard(api.get<{ range: string; points: StatsPoint[] }>(`/api/admin/stats?range=${range}`, { token: adminSession.value })),
  top: (by: 'senders' | 'ips', limit = 10) =>
    guard(api.get<{ by: string; items: { label: string; count: number }[] }>(`/api/admin/top?by=${by}&limit=${limit}`, { token: adminSession.value })),
  events: (type: string | null, limit = 20, offset = 0) =>
    guard(api.get<AdminEventsResponse>(`/api/admin/events?${type ? `type=${type}&` : ''}limit=${limit}&offset=${offset}`, { token: adminSession.value })),
  mailboxes: (limit = 20, offset = 0) =>
    guard(api.get<AdminMailboxesResponse>(`/api/admin/mailboxes?limit=${limit}&offset=${offset}`, { token: adminSession.value })),
  messages: (limit = 20, offset = 0) =>
    guard(api.get<AdminMessagesResponse>(`/api/admin/messages?limit=${limit}&offset=${offset}`, { token: adminSession.value })),
  config: () => guard(api.get<AdminConfig>('/api/admin/config', { token: adminSession.value })),
};
