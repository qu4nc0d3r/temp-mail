import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useToast } from './useToast';

describe('useToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a toast and auto-dismisses after 4s', () => {
    const { toasts, show } = useToast();
    show('success', 'Mail arrived!');
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0].message).toBe('Mail arrived!');
    vi.advanceTimersByTime(4000);
    expect(toasts.value).toHaveLength(0);
  });

  it('manual dismiss removes the matching toast', () => {
    const { toasts, show, dismiss } = useToast();
    show('error', 'x');
    show('warning', 'y');
    dismiss(toasts.value[0].id);
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0].message).toBe('y');
  });

  it('caps concurrent toasts at 5', () => {
    const { toasts, info } = useToast();
    for (let i = 0; i < 7; i++) info(`t${i}`);
    expect(toasts.value).toHaveLength(5);
  });
});
