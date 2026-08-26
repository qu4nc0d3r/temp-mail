import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notifyNewMail } from './notify';

interface Stub {
  requestPermission: ReturnType<typeof vi.fn>;
  instances: { title: string; body?: string; tag?: string }[];
  setPermission: (p: NotificationPermission) => void;
}

let originalNotification: unknown;
let originalVisibility: string;

beforeEach(() => {
  originalNotification = (globalThis as Record<string, unknown>).Notification;
  originalVisibility = document.visibilityState;
});

afterEach(() => {
  if (originalNotification === undefined) delete (globalThis as Record<string, unknown>).Notification;
  else (globalThis as Record<string, unknown>).Notification = originalNotification;
  Object.defineProperty(document, 'visibilityState', { value: originalVisibility, configurable: true });
  vi.restoreAllMocks();
});

function stubNotification(permission: NotificationPermission): Stub {
  const instances: Stub['instances'] = [];
  const requestPermission = vi.fn();
  class FakeNotification {
    static permission = permission;
    static requestPermission = requestPermission;
    title: string;
    options: { body?: string; tag?: string };
    constructor(title: string, options: { body?: string; tag?: string } = {}) {
      this.title = title;
      this.options = options;
      instances.push({ title, body: options.body, tag: options.tag });
    }
  }
  (globalThis as Record<string, unknown>).Notification = FakeNotification;
  return {
    requestPermission,
    instances,
    setPermission: (p) => { FakeNotification.permission = p; },
  };
}

function setVisibility(v: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
}

describe('notifyNewMail', () => {
  it('does nothing while the tab is visible', async () => {
    const stub = stubNotification('granted');
    setVisibility('visible');
    await notifyNewMail('Hello', 1);
    expect(stub.instances).toHaveLength(0);
  });

  it('shows a notification when hidden and permission granted', async () => {
    const stub = stubNotification('granted');
    setVisibility('hidden');
    await notifyNewMail('GitHub code', 1);
    expect(stub.instances).toHaveLength(1);
    expect(stub.instances[0].title).toContain('Temp Mail');
    expect(stub.instances[0].body).toBe('GitHub code');
    expect(stub.instances[0].tag).toBe('temp-mail');
  });

  it('summarizes extra messages', async () => {
    const stub = stubNotification('granted');
    setVisibility('hidden');
    await notifyNewMail('Hello', 3);
    expect(stub.instances[0].body).toBe('Hello +2 more');
  });

  it('requests permission when default and notifies once granted', async () => {
    const stub = stubNotification('default');
    stub.requestPermission.mockImplementation(async () => { stub.setPermission('granted'); return 'granted'; });
    setVisibility('hidden');
    await notifyNewMail('Hi', 1);
    expect(stub.requestPermission).toHaveBeenCalledTimes(1);
    expect(stub.instances).toHaveLength(1);
  });

  it('does not notify when permission is denied', async () => {
    const stub = stubNotification('denied');
    setVisibility('hidden');
    await notifyNewMail('Hi', 1);
    expect(stub.instances).toHaveLength(0);
    expect(stub.requestPermission).not.toHaveBeenCalled();
  });

  it('is a no-op when Notification is undefined', async () => {
    delete (globalThis as Record<string, unknown>).Notification;
    setVisibility('hidden');
    await expect(notifyNewMail('Hi', 1)).resolves.toBeUndefined();
  });
});
