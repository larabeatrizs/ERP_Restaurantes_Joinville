import { isRecord } from '@erp/contracts';
export async function signIn(login: string, password: string): Promise<{ access_token: string; refresh_token: string }> {
  const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password }), cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error('Login unavailable');
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string') throw Error('Invalid session');
  return { access_token: value.access_token, refresh_token: value.refresh_token };
}
