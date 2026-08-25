export function buildSrcdoc(html: string): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\'">',
    '</head><body>',
    html,
    '</body></html>',
  ].join('');
}
