import { isRecord, normalizeLogin } from '@erp/contracts';
import { ApiError } from '../errors.ts';
import type { RuntimeEnv } from './settings-repository.ts';
import type { LoginRepository } from './login-repository.ts';

const denied = () => new ApiError(401, 'INVALID_LOGIN', 'Não foi possível entrar. Verifique seus dados ou procure a administração.');
const unavailable = () => new ApiError(503, 'SERVICE_UNAVAILABLE', 'Serviço temporariamente indisponível.');

/** Adaptador transitório: diretório privado em Worker Secret, sem consulta pública ou chave administrativa.
 * A futura administração substitui o diretório sem alterar View/Controller. Não armazena senhas.
 */
export function createLoginRepository(env: RuntimeEnv, fetcher: typeof fetch = fetch): LoginRepository {
  let url: URL, directory: Record<string, unknown>;
  try {
    url = new URL(env.SUPABASE_URL ?? '');
    const parsed: unknown = JSON.parse(env.AUTH_LOGIN_DIRECTORY ?? '');
    if (!isRecord(parsed) || Object.keys(parsed).length === 0 || Object.keys(parsed).length > 5000) throw Error('Invalid directory');
    for (const [login, email] of Object.entries(parsed)) {
      if (normalizeLogin(login) !== login || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw Error('Invalid directory entry');
    }
    directory = parsed;
  } catch { throw unavailable(); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash || !env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) throw unavailable();
  return {
    async signIn(login, password) {
      const known = Object.hasOwn(directory, login);
      // Usuário desconhecido também passa pelo provedor; nunca retorna email, usuário ou causa individual.
      const email = known ? directory[login] as string : 'username-unavailable@example.invalid';
      let response: Response;
      try {
        response = await fetcher(new URL('/auth/v1/token?grant_type=password', url), {
          method: 'POST', headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY!, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(10000),
        });
      } catch { throw unavailable(); }
      if (response.status === 429) throw new ApiError(429, 'LOGIN_RATE_LIMIT', 'Aguarde antes de tentar entrar novamente.');
      if (response.status >= 500) throw unavailable();
      if (!response.ok) throw denied();
      let data: unknown;
      try { data = await response.json(); } catch { throw unavailable(); }
      if (!known) throw denied();
      if (!isRecord(data) || typeof data.access_token !== 'string' || !data.access_token || typeof data.refresh_token !== 'string' || !data.refresh_token) throw unavailable();
      return { access_token: data.access_token, refresh_token: data.refresh_token };
    },
  };
}
