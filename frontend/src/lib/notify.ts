/**
 * Hiện browser notification khi có mail mới mà tab đang ẩn. Tab đang mở thì
 * chấm xanh + title là đủ, không làm phiền. Xin quyền lười biếng: chỉ prompt
 * lần đầu khi có mail thật sự tới; nếu bị từ chối thì im lặng bỏ qua.
 */
export async function notifyNewMail(subject: string, total: number): Promise<void> {
  try {
    if (typeof Notification === 'undefined') return;
    if (document.visibilityState === 'visible') return;

    if (Notification.permission !== 'granted') {
      if (Notification.permission === 'denied') return;
      const result = await Notification.requestPermission();
      if (result !== 'granted') return;
    }

    const body = total > 1 ? `${subject} +${total - 1} more` : subject;
    new Notification('New mail in Temp Mail', { body, tag: 'temp-mail' });
  } catch {
    // requestPermission có thể reject (iOS Safari, insecure context, thiếu user gesture)
    // và new Notification() có thể throw — nuốt im lặng, không để unhandled rejection
  }
}
