export interface Env {
  ADMIN_API_KEY?: string;
  ADMIN_DEV_BYPASS?: string;
  DB: D1Database;
  ASSETS: Fetcher;
  DOMAIN: string;
  SALT_TOKEN: string;
  SALT_IP: string;
  RECAPTCHA_SITE_KEY?: string;
  RECAPTCHA_SECRET_KEY?: string;
  RECAPTCHA_THRESHOLD?: string;
}

export type AdminEventType = 'mailbox_created' | 'rate_limited' | 'recaptcha_failed' | 'cron_cleanup';

export interface AdminEventRow {
  id: number;
  type: AdminEventType;
  ip_hash: string | null;
  address: string | null;
  detail: string | null;
  created_at: number;
}

export interface AdminMailboxRow {
  address: string;
  created_at: number;
  expires_at: number;
}

export interface AdminMessageRow {
  id: string;
  mailbox: string;
  from_name: string | null;
  from_addr: string;
  subject: string | null;
  preview: string;
  received_at: number;
}

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

export interface MailboxRecord {
  address: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
}

export interface MessageSummary {
  id: string;
  from_name: string | null;
  from_addr: string;
  subject: string | null;
  preview: string;
  received_at: number;
}

export interface MessageDetail extends MessageSummary {
  html_body: string | null;
  text_body: string | null;
  attachments_count: number;
}

export interface NewMessage {
  id: string;
  mailbox: string;
  fromName: string | null;
  fromAddr: string;
  subject: string | null;
  preview: string;
  htmlBody: string | null;
  textBody: string | null;
  attachmentsCount: number;
  receivedAt: number;
}
