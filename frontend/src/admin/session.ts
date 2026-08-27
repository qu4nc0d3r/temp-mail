import { shallowRef } from 'vue';

const SESSION_KEY = 'tm-admin-session';

export const adminSession = shallowRef<string | null>(sessionStorage.getItem(SESSION_KEY));

export function getAdminToken(): string | null {
  return adminSession.value;
}

export function setAdminToken(token: string | null): void {
  if (token === null) sessionStorage.removeItem(SESSION_KEY);
  else sessionStorage.setItem(SESSION_KEY, token);
  adminSession.value = token;
}
