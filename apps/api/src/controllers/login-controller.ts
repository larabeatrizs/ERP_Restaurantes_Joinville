import { hasExactFields, isRecord, normalizeLogin } from '@erp/contracts';
import { readJson } from './read-json.ts';
import { ApiError } from '../errors.ts';
import type { RuntimeEnv } from '../repositories/settings-repository.ts';
import type { LoginFactory } from '../repositories/login-repository.ts';

export async function loginController(request: Request, env: RuntimeEnv, factory: LoginFactory): Promise<Response> {
  const value = await readJson(request);
  if (!isRecord(value) || !hasExactFields(value, ['login', 'password']) || typeof value.login !== 'string' || typeof value.password !== 'string' || value.password.length < 1 || value.password.length > 1024) throw new ApiError(422, 'INVALID_LOGIN_INPUT', 'Informe seu nome de usuário e senha.');
  const login = normalizeLogin(value.login);
  if (!login) throw new ApiError(422, 'INVALID_LOGIN_INPUT', 'Informe seu nome de usuário e senha.');
  const tokens = await factory(env).signIn(login, value.password);
  return Response.json(tokens, { headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } });
}
