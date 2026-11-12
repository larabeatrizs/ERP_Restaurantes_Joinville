export function normalizeLogin(value: string): string | null {
  const login = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(login) ? login : null;
}
