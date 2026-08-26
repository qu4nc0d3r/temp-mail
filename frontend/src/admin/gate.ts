export function isAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin');
}
