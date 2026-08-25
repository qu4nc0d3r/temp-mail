export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  DOMAIN: string;
  SALT_TOKEN: string;
  SALT_IP: string;
  RECAPTCHA_SITE_KEY?: string;
  RECAPTCHA_SECRET_KEY?: string;
  RECAPTCHA_THRESHOLD?: string;
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
