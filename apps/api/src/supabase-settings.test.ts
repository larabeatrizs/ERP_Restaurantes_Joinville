import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSupabaseSession } from './repositories/supabase-settings.ts';
import { ApiError } from './errors.ts';
import { createApp } from './index.ts';

const env = { SUPABASE_URL: 'https://staging-ficticio.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ficticia' };
const row = { unidade_id: '1', revisao: '2', modo_saida: 'POSTERIOR', margem_percentual: '5.00', dias_alerta_validade: 7, prazo_amostra_horas: 72, periodicidade_inventario_dias: 7, referencia_preco: 'MENOR_COTACAO', alerta_email_habilitado: false };
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'ficticio@example.test', created_at: '2026-11-06T00:00:00Z', app_metadata: {}, user_metadata: {} };

function transport(options: { authStatus?: number; databaseCode?: string; databaseStatus?: number; badRow?: boolean; anonymous?: boolean } = {}) {
  const requests: { url: URL; headers: Headers; body: unknown }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    requests.push({ url, headers, body: typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : null });
    if (url.pathname === '/auth/v1/user') {
      return Response.json(options.authStatus ? { msg: 'Detalhe interno não deve vazar' } : { ...user, is_anonymous: options.anonymous ?? false }, { status: options.authStatus ?? 200 });
    }
    if (options.databaseCode) return Response.json({ code: options.databaseCode, message: 'SQL e detalhe interno' }, { status: options.databaseStatus ?? 400 });
    if (url.pathname.endsWith('/unidade')) return Response.json([{ id: '1', codigo: 'TESTE_A', nome: 'Unidade fictícia A' }]);
    if (url.pathname.endsWith('/perfil_permissao')) return Response.json([{ permissao: 'CONFIGURACAO_EDITAR' }]);
    if (url.pathname.includes('/rpc/')) return Response.json({ ...row, revisao: '3' });
    if (options.badRow) return Response.json({ ...row, revisao: 9007199254740992 });
    // maybeSingle usa Accept JSON e o SDK converte array com uma linha.
    return Response.json([row]);
  };
  return { requests, fetcher };
}

test('SDK valida usuário e encaminha Bearer/publicável ao schema erp, sem sessão administrativa', async () => {
  const { fetcher, requests } = transport();
  const session = createSupabaseSession(env, 'bearer-ficticio-a', fetcher);
  await session.authenticate();
  const result = await session.repository.read('1');
  assert.equal(result.pode_editar, true);
  assert.equal(result.configuracao.revisao, '2');
  assert.equal(requests[0]?.url.pathname, '/auth/v1/user');
  for (const request of requests) {
    assert.equal(request.headers.get('Authorization'), 'Bearer bearer-ficticio-a');
    assert.equal(request.headers.get('apikey'), env.SUPABASE_PUBLISHABLE_KEY);
  }
  const query = requests.find((request) => request.url.pathname.endsWith('/parametro_unidade'));
  assert.equal(query?.headers.get('Accept-Profile'), 'erp');
  assert.equal(query?.url.searchParams.get('unidade_id'), 'eq.1');
  assert.match(query?.url.searchParams.get('select') ?? '', /revisao::text/);
});
test('RPC usa revisão e unidade string e não usa update direto', async () => {
  const { fetcher, requests } = transport();
  const session = createSupabaseSession(env, 'bearer-ficticio-a', fetcher);
  await session.authenticate();
  const result = await session.repository.update('1', '2', { campos: { margem_percentual: '0' }, motivo: ' Teste de ajuste ' });
  assert.equal(result.revisao, '3');
  const rpc = requests.find((request) => request.url.pathname.endsWith('/rpc/atualizar_configuracao'));
  assert.equal(rpc?.headers.get('Content-Profile'), 'erp');
  assert.deepEqual(rpc?.body, { p_unidade: '1', p_revisao: '2', p_campos: { margem_percentual: '0' }, p_motivo: 'Teste de ajuste' });
});
test('listagem consulta unidades ativas com RLS e IDs textuais', async () => {
  const { fetcher, requests } = transport();
  const session = createSupabaseSession(env, 'ficticio', fetcher);
  assert.deepEqual(await session.repository.listUnits(), [{ id: '1', codigo: 'TESTE_A', nome: 'Unidade fictícia A' }]);
  assert.equal(requests[0]?.url.searchParams.get('status'), 'eq.ATIVO');
  assert.equal(requests[0]?.headers.get('Accept-Profile'), 'erp');
});
test('erros de sessão são 401 e falha de Auth é 503', async () => {
  for (const status of [401, 403, 500]) {
    const { fetcher } = transport({ authStatus: status });
    const session = createSupabaseSession(env, 'bearer-invalido', fetcher);
    await assert.rejects(() => session.authenticate(), (error: unknown) => error instanceof ApiError && error.status === (status >= 500 ? 503 : 401));
  }
  const { fetcher } = transport({ anonymous: true });
  await assert.rejects(() => createSupabaseSession(env, 'anonimo', fetcher).authenticate(),
    (error: unknown) => error instanceof ApiError && error.status === 401);
});

test('token que expira entre Auth e Data API continua sendo tratado como sessão inválida', async () => {
  const { fetcher } = transport({ databaseCode: 'JWT_EXPIRED', databaseStatus: 401 });
  const session = createSupabaseSession(env, 'token-expirando', fetcher);
  await session.authenticate();
  await assert.rejects(() => session.repository.read('1'),
    (error: unknown) => error instanceof ApiError && error.status === 401);
});
test('SQLSTATE é traduzido sem devolver mensagem SQL', async () => {
  for (const [code, status] of [['PT412', 412], ['PT428', 428], ['PT422', 422], ['42501', 403], ['PT404', 404], ['XX000', 503]] as const) {
    const { fetcher } = transport({ databaseCode: code });
    const session = createSupabaseSession(env, 'bearer-ficticio', fetcher);
    await assert.rejects(() => session.repository.update('1', '2', { campos: { margem_percentual: '0' }, motivo: 'Teste' }),
      (error: unknown) => error instanceof ApiError && error.status === status && !error.message.includes('SQL'));
  }
});
test('clientes não compartilham Bearer entre requisições', async () => {
  const { fetcher, requests } = transport();
  await Promise.all(['token-a', 'token-b'].map((token) => createSupabaseSession(env, token, fetcher).authenticate()));
  assert.deepEqual(requests.map((request) => request.headers.get('Authorization')).sort(), ['Bearer token-a', 'Bearer token-b']);
});
test('URL inválida ou chave administrativa é recusada e bigint numérico não é arredondado', async () => {
  for (const settings of [{ ...env, SUPABASE_URL: 'http://inseguro.test' }, { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_ficticio' }]) {
    assert.throws(() => createSupabaseSession(settings, 'token'), (error: unknown) => error instanceof ApiError && error.status === 503);
  }
  const { fetcher } = transport({ badRow: true });
  await assert.rejects(() => createSupabaseSession(env, 'token', fetcher).repository.read('1'),
    (error: unknown) => error instanceof ApiError && error.status === 503);
});

test('rotas HTTP integram autenticação do SDK e RPC com transporte simulado', async () => {
  const { fetcher, requests } = transport();
  const app = createApp((settings, token) => createSupabaseSession(settings, token, fetcher));
  const url = 'https://erp.test/api/unidades/1/configuracoes';
  const read = await app.fetch(new Request(url, { headers: { Authorization: 'Bearer sessao-ficticia' } }), env);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('ETag'), '"cfg-1-2"');
  const update = await app.fetch(new Request(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer sessao-ficticia', 'Content-Type': 'application/json', 'If-Match': read.headers.get('ETag') ?? '' },
    body: JSON.stringify({ campos: { margem_percentual: '0' }, motivo: 'Integração simulada' }),
  }), env);
  assert.equal(update.status, 200);
  assert.equal(update.headers.get('ETag'), '"cfg-1-3"');
  assert.equal(requests.filter((request) => request.url.pathname === '/auth/v1/user').length, 2);
  assert.equal(requests.filter((request) => request.url.pathname.endsWith('/rpc/atualizar_configuracao')).length, 1);
});
