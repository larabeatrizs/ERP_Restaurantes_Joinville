import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Configuration, ConfigurationPatch } from '@erp/contracts';
import { createApp } from './index.ts';
import { ApiError } from './errors.ts';
import type { SettingsRepository } from './repositories/settings-repository.ts';

const config: Configuration = {
  unidade_id: '1', revisao: '2', modo_saida: 'POSTERIOR', margem_percentual: '5.00',
  dias_alerta_validade: 7, prazo_amostra_horas: 72, periodicidade_inventario_dias: 7,
  referencia_preco: 'MENOR_COTACAO', alerta_email_habilitado: false,
};
const route = 'https://erp.test/api/unidades/1/configuracoes';
const validPatch: ConfigurationPatch = { campos: { margem_percentual: '0', alerta_email_habilitado: false }, motivo: 'Ajuste de teste' };

function fixture(options: { authError?: Error; repositoryError?: Error } = {}) {
  const received: { token?: string; unit?: string; revision?: string; patch?: ConfigurationPatch; writes: number } = { writes: 0 };
  const repository: SettingsRepository = {
    async read(unit) {
      received.unit = unit;
      if (options.repositoryError) throw options.repositoryError;
      return { configuracao: { ...config, unidade_id: unit }, pode_editar: true };
    },
    async update(unit, revision, patch) {
      received.writes++;
      received.unit = unit;
      received.revision = revision;
      received.patch = patch;
      if (options.repositoryError) throw options.repositoryError;
      return { ...config, ...patch.campos, revisao: '3' };
    },
  };
  return {
    received,
    app: createApp((_env, token) => {
      received.token = token;
      return { repository, async authenticate() { if (options.authError) throw options.authError; } };
    }),
  };
}
function patchRequest(body: unknown = validPatch, headers: Record<string, string> = {}) {
  return new Request(route, { method: 'PATCH', headers: {
    Authorization: 'Bearer token-ficticio', 'Content-Type': 'application/json', 'If-Match': '"cfg-1-2"', ...headers,
  }, body: JSON.stringify(body) });
}

test('GET exige Bearer antes de consultar o repositório', async () => {
  const { app, received } = fixture();
  const response = await app.fetch(new Request(route));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
  assert.equal(received.unit, undefined);
});
test('autenticação rejeitada não consulta configurações', async () => {
  const { app, received } = fixture({ authError: new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida.') });
  assert.equal((await app.fetch(new Request(route, { headers: { Authorization: 'Bearer invalido' } }))).status, 401);
  assert.equal(received.unit, undefined);
});
test('GET retorna configuração, capacidade e ETag sem cache', async () => {
  const { app, received } = fixture();
  const response = await app.fetch(new Request(route, { headers: { Authorization: 'Bearer token-ficticio' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('ETag'), '"cfg-1-2"');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(received.token, 'token-ficticio');
  assert.deepEqual(await response.json(), { configuracao: config, pode_editar: true });
});
test('PATCH encaminha revisão como string e preserva zero/falso', async () => {
  const { app, received } = fixture();
  const response = await app.fetch(patchRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('ETag'), '"cfg-1-3"');
  assert.equal(received.revision, '2');
  assert.deepEqual(received.patch, validPatch);
  assert.equal((await response.json()).configuracao.alerta_email_habilitado, false);
});
test('If-Match ausente gera 428 sem escrever', async () => {
  const { app, received } = fixture();
  const request = patchRequest();
  request.headers.delete('If-Match');
  assert.equal((await app.fetch(request)).status, 428);
  assert.equal(received.writes, 0);
});
test('ETag fraca, wildcard, lista ou de outra unidade não escreve', async () => {
  for (const tag of ['W/"cfg-1-2"', '*', '"cfg-1-2", "cfg-1-3"', '"cfg-2-2"']) {
    const { app, received } = fixture();
    const response = await app.fetch(patchRequest(validPatch, { 'If-Match': tag }));
    assert.equal(response.status, tag === '"cfg-2-2"' ? 412 : 400);
    assert.equal(received.writes, 0);
  }
});
test('IDs bigint não são arredondados e limites inválidos são rejeitados', async () => {
  const { app, received } = fixture();
  const big = '9223372036854775807';
  const response = await app.fetch(new Request(route.replace('/1/', `/${big}/`), { headers: { Authorization: 'Bearer ficticio' } }));
  assert.equal(response.status, 200);
  assert.equal(received.unit, big);
  for (const id of ['0', '-1', '1.5', '01', '9223372036854775808']) {
    assert.equal((await app.fetch(new Request(route.replace('/1/', `/${id}/`), { headers: { Authorization: 'Bearer ficticio' } }))).status, 400);
  }
});
test('payload estrito rejeita campos de autoria, flags não implementadas e tipos errados', async () => {
  for (const body of [
    {}, null, { ...validPatch, ator: 'outro' },
    { campos: { revisao: '99' }, motivo: 'Tentativa' },
    { campos: { exige_aprovacao_perda: false }, motivo: 'Tentativa' },
    { campos: { margem_percentual: 5 }, motivo: 'Tentativa' },
    { campos: { alerta_email_habilitado: 'false' }, motivo: 'Tentativa' },
    { campos: {}, motivo: 'Tentativa' }, { ...validPatch, motivo: 'a' },
  ]) {
    const { app, received } = fixture();
    assert.equal((await app.fetch(patchRequest(body))).status, 422);
    assert.equal(received.writes, 0);
  }
});
test('Content-Type, JSON inválido e tamanho real do corpo são verificados', async () => {
  const { app } = fixture();
  assert.equal((await app.fetch(patchRequest(validPatch, { 'Content-Type': 'text/plain' }))).status, 415);
  const malformed = patchRequest();
  const response = await app.fetch(new Request(malformed, { body: '{' }));
  assert.equal(response.status, 400);
  assert.equal((await app.fetch(patchRequest({ ...validPatch, motivo: 'x'.repeat(17000) }, { 'Content-Length': '0' }))).status, 413);
});
test('conflitos e negações do serviço preservam status e não expõem erros internos', async () => {
  for (const status of [403, 404, 412, 422, 503]) {
    const { app } = fixture({ repositoryError: new ApiError(status, 'TEST_ERROR', 'Falha sanitizada.') });
    assert.equal((await app.fetch(patchRequest())).status, status);
  }
  const { app } = fixture({ repositoryError: new Error('SQL secreto token-nao-expor https://interno') });
  const response = await app.fetch(patchRequest());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /SQL|token-nao-expor|interno/);
});
test('backend sem configuração não permite falsa autenticação e liveness continua público', async () => {
  const app = createApp();
  assert.equal((await app.fetch(new Request(route, { headers: { Authorization: 'Bearer ficticio' } }))).status, 503);
  assert.equal((await app.fetch(new Request('https://erp.test/api/health'))).status, 200);
});
test('métodos não suportados declaram Allow sem liberar CORS', async () => {
  const { app } = fixture();
  const response = await app.fetch(new Request(route, { method: 'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, PATCH');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  const head = await app.fetch(new Request(route, { method: 'HEAD' }));
  assert.equal(head.status, 405);
  assert.equal(await head.text(), '');
});
