import PostalMime from 'postal-mime';
import type { EmailMessage } from 'cloudflare:email';
import { getActiveMailbox, insertMessage } from './db/queries';
import { generateId } from './lib/token';
import { makePreview, stripHtml } from './lib/text';
import type { Env } from './env';

export async function email(message: EmailMessage, env: Env): Promise<void> {
  const nowMs = Date.now();
  const rawTo: unknown = message.to;
  const to =
    typeof rawTo === 'string'
      ? rawTo
      : Array.isArray(rawTo)
        ? (rawTo[0] as { address?: string } | undefined)?.address ?? ''
        : '';
  const address = to.toLowerCase();

  const mailbox = await getActiveMailbox(env.DB, address, nowMs);
  if (!mailbox) return; // nuốt im lặng: không báo bounce

  const parsed = await new PostalMime().parse(message.raw);
  const text = parsed.text ?? stripHtml(parsed.html ?? '');

  await insertMessage(env.DB, {
    id: generateId(),
    mailbox: address,
    fromName: parsed.from?.name ?? null,
    fromAddr: parsed.from?.address ?? '',
    subject: parsed.subject ?? null,
    preview: makePreview(text),
    htmlBody: parsed.html ?? null,
    textBody: parsed.text ?? null,
    attachmentsCount: parsed.attachments?.length ?? 0,
    receivedAt: nowMs,
  });
}
