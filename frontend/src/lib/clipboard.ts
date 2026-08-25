const TIMEOUT_MS = 1500;

function copyViaExecCommand(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}

/**
 * Copy text to the clipboard with a timeout + execCommand fallback.
 * The async Clipboard API can hang (e.g. while the document is unfocused),
 * so we never wait on it longer than TIMEOUT_MS before falling back.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Clipboard API timed out')), TIMEOUT_MS),
        ),
      ]);
      return;
    } catch {
      // fall through to the execCommand fallback
    }
  }
  if (!copyViaExecCommand(text)) throw new Error('Copy failed');
}
