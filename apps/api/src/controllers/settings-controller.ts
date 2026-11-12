import { isConfigurationPatch, isPositiveBigint } from '@erp/contracts';
import { ApiError } from '../errors.ts';
import { SettingsService } from '../services/settings-service.ts';
import type { RuntimeEnv, SessionFactory } from '../repositories/settings-repository.ts';

const etag = (unit: string, revision: string) => `"cfg-${unit}-${revision}"`;
export async function identityController(request: Request, env: RuntimeEnv, factory: SessionFactory): Promise<Response> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Informe uma sessão válida.');
  const session = factory(env, token); await session.authenticate();
  if (!session.repository.identity) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Identificação temporariamente indisponível.');
  return Response.json(await session.repository.identity(), { headers: { 'Cache-Control': 'no-store' } });
}
async function jsonBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
  }
  if (!request.body) throw new ApiError(400, 'INVALID_JSON', 'Informe um objeto JSON.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let body = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'O conteúdo excede 16 KiB.');
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_JSON', 'JSON inválido.');
  } finally { reader.releaseLock(); }
}

export async function settingsController(request: Request, env: RuntimeEnv, unit: string, factory: SessionFactory): Promise<Response> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Informe uma sessão válida.');
  if (!isPositiveBigint(unit)) throw new ApiError(400, 'INVALID_UNIT', 'Unidade inválida.');
  const session = factory(env, token);
  await session.authenticate();
  const service = new SettingsService(session.repository);
  if (request.method === 'GET') {
    const result = await service.read(unit);
    return Response.json(result, { headers: { ETag: etag(unit, result.configuracao.revisao), 'Cache-Control': 'no-store, no-transform' } });
  }
  const match = request.headers.get('If-Match');
  if (match === null) throw new ApiError(428, 'PRECONDITION_REQUIRED', 'Informe If-Match com a revisão lida.');
  const revision = /^"cfg-([1-9]\d{0,18})-([1-9]\d{0,18})"$/.exec(match);
  if (!revision?.[1] || !revision[2] || !isPositiveBigint(revision[1]) || !isPositiveBigint(revision[2])) {
    throw new ApiError(400, 'INVALID_ETAG', 'Informe uma ETag forte válida.');
  }
  if (revision[1] !== unit) throw new ApiError(412, 'PRECONDITION_FAILED', 'A revisão pertence a outra unidade.');
  const patch = await jsonBody(request);
  if (!isConfigurationPatch(patch)) throw new ApiError(422, 'INVALID_CONFIGURATION', 'Campos ou motivo inválidos.');
  const configuration = await service.update(unit, revision[2], patch);
  return Response.json({ configuracao: configuration }, {
    headers: { ETag: etag(unit, configuration.revisao), 'Cache-Control': 'no-store, no-transform' },
  });
}

export async function unitsController(request: Request, env: RuntimeEnv, factory: SessionFactory): Promise<Response> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Informe uma sessão válida.');
  const session = factory(env, token);
  await session.authenticate();
  return Response.json({ unidades: await session.repository.listUnits() }, { headers: { 'Cache-Control': 'no-store' } });
}
