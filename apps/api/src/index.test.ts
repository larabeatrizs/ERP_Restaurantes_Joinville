import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './index.ts';

test('health público informa apenas liveness, sem cache e sem dados de ambiente', async () => {
  const response = worker.fetch(new Request('https://erp.test/api/health'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', service: 'erp-api', version: '0.1.0' });
});

test('HEAD preserva status e headers e não devolve corpo', async () => {
  const response = worker.fetch(new Request('https://erp.test/api/health', { method: 'HEAD' }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type') ?? '', /application\/json/);
  assert.equal(await response.text(), '');
});

test('método de escrita no health é negado com Allow', async () => {
  const response = worker.fetch(new Request('https://erp.test/api/health', { method: 'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, HEAD');
  assert.deepEqual(await response.json(), {
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' },
  });
});

test('rota desconhecida não retorna falso sucesso', async () => {
  const response = worker.fetch(new Request('https://erp.test/api/usuarios'));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'NOT_FOUND');
});

test('HEAD de rota desconhecida mantém 404 sem corpo', async () => {
  const response = worker.fetch(new Request('https://erp.test/inexistente', { method: 'HEAD' }));
  assert.equal(response.status, 404);
  assert.equal(await response.text(), '');
});
