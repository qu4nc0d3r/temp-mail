import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { setupDb } from './helpers/db';
import { email } from '../src/email';
import { createMailbox, listMessages } from '../src/db/queries';

const NOW = Date.now();

function mimeStream(mailbox: string, overrides?: Partial<{ from: string; subject: string; text: string }>): ReadableStream {
  const from = overrides?.from ?? 'Alice Example <alice@example.com>';
  const subject = overrides?.subject ?? '=?UTF-8?Q?Hello_=C4=90=C3=A0_=C3=A0?=';
  const text = overrides?.text ?? 'Plain body line';
  const raw = [
    `From: ${from}`,
    `To: ${mailbox}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    text,
  ].join('\r\n');
  return new Blob([raw]).stream();
}

function fakeMessage(mailbox: string, overrides?: { from?: string; subject?: string; text?: string }): ForwardableEmailMessage {
  return {
    to: mailbox,
    from: 'sender@example.com',
    raw: mimeStream(mailbox, overrides),
  } as unknown as ForwardableEmailMessage;
}

beforeEach(async () => {
  await setupDb();
});

describe('email handler', () => {
  it('stores incoming mail for an active mailbox', async () => {
    const addr = `in@${env.DOMAIN}`;
    await createMailbox(env.DB, addr, 'h', NOW, NOW + 10 * 60 * 1000);
    await email(fakeMessage(addr, { text: 'Hello  world\n second line' }), env);
    const messages = await listMessages(env.DB, addr, NOW + 1000);
    expect(messages).toHaveLength(1);
    expect(messages[0].from_addr).toBe('alice@example.com');
    expect(messages[0].from_name).toBe('Alice Example');
    expect(messages[0].subject).toBe('Hello Đà à');
    expect(messages[0].preview).toBe('Hello world second line');
  });

  it('silently drops mail for unknown or expired mailbox', async () => {
    const addr = `ghost@${env.DOMAIN}`;
    await email(fakeMessage(addr), env);
    expect(await listMessages(env.DB, addr, NOW)).toEqual([]);

    const expired = `old@${env.DOMAIN}`;
    await createMailbox(env.DB, expired, 'h', NOW - 20 * 60 * 1000, NOW - 10 * 60 * 1000);
    await email(fakeMessage(expired), env);
    expect(await listMessages(env.DB, expired, NOW)).toEqual([]);
  });

  it('handles html mail with attachments count', async () => {
    const addr = `html@${env.DOMAIN}`;
    await createMailbox(env.DB, addr, 'h', NOW, NOW + 10 * 60 * 1000);
    const raw = [
      'From: Bob <bob@example.com>',
      `To: ${addr}`,
      'Subject: Html mail',
      'Content-Type: multipart/mixed; boundary=abc',
      '',
      '--abc',
      'Content-Type: text/html; charset=UTF-8',
      '',
      '<html><body><p>Hi <b>there</b></p></body></html>',
      '--abc',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'plain text',
      '--abc--',
    ].join('\r\n');
    const msg = { to: addr, from: 'bob@example.com', raw: new Blob([raw]).stream() } as unknown as ForwardableEmailMessage;
    await email(msg, env);
    const messages = await listMessages(env.DB, addr, NOW + 1000);
    expect(messages).toHaveLength(1);
  });
});
