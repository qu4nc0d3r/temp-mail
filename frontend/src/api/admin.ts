import { api } from './client';

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

export const adminApi = {
  overview: () => api.get<AdminOverview>('/api/admin/overview'),
  stats: (range: '24h' | '7d') => api.get<{ range: string; points: StatsPoint[] }>(`/api/admin/stats?range=${range}`),
  top: (by: 'senders' | 'ips', limit = 10) =>
    api.get<{ by: string; items: { label: string; count: number }[] }>(`/api/admin/top?by=${by}&limit=${limit}`),
  events: (type: string | null, limit = 20, offset = 0) =>
    api.get<AdminEventsResponse>(`/api/admin/events?${type ? `type=${type}&` : ''}limit=${limit}&offset=${offset}`),
  mailboxes: (limit = 20, offset = 0) => api.get<AdminMailboxesResponse>(`/api/admin/mailboxes?limit=${limit}&offset=${offset}`),
  messages: (limit = 20, offset = 0) => api.get<AdminMessagesResponse>(`/api/admin/messages?limit=${limit}&offset=${offset}`),
  config: () => api.get<AdminConfig>('/api/admin/config'),
};
