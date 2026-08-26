const BOLT_PATH = 'M11,15H6L13,1V9H18L11,23V15Z';

/** SVG favicon: nền bo góc + bolt trắng, thêm badge đỏ khi có mail chưa đọc (count > 9 → "9+"). */
export function buildFaviconSvg(count: number): string {
  const badge =
    count > 0
      ? `<circle cx="16" cy="8" r="5.5" fill="#e5484d"/><text x="16" y="8" text-anchor="middle" dominant-baseline="central" font-family="Arial,sans-serif" font-size="7" font-weight="bold" fill="#ffffff">${count > 9 ? '9+' : count}</text>`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5" fill="#2f6bff"/><path d="${BOLT_PATH}" fill="#ffffff"/>${badge}</svg>`;
}

function setFaviconUrl(url: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

/** Cập nhật favicon theo số mail chưa đọc. count = 0 → không badge. */
export function updateFavicon(count: number): void {
  setFaviconUrl(`data:image/svg+xml,${encodeURIComponent(buildFaviconSvg(count))}`);
}
