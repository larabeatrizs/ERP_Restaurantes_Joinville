import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { type StagingEnv } from './staging.ts';

const apiOnly: StagingEnv = {
  ASSETS: { async fetch() { throw new Error('A API não deve cair no fallback HTML.'); } },
};

test('navegação para API desconhecida preserva 404 JSON em vez do fallback da SPA', async () => {
  for (const path of ['/api', '/api/inexistente']) {
    const response = await worker.fetch(new Request(`https://erp.test${path}`, {
      headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' },
    }), apiOnly);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('Content-Type') ?? '', /application\/json/);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  }
});

test('rota protegida na origem compartilhada continua exigindo Bearer', async () => {
  const response = await worker.fetch(new Request('https://erp.test/api/unidades'), apiOnly);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('método não permitido preserva status e Allow sem servir a SPA', async () => {
  const response = await worker.fetch(new Request('https://erp.test/api/health', { method: 'POST' }), apiOnly);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, HEAD');
});

test('View delega a requisição ao binding de assets sem confundir prefixo da API', async () => {
  for (const path of ['/', '/configuracoes', '/aplicacao']) {
    const request = new Request(`https://erp.test${path}`);
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: { async fetch(received) {
        calls += 1;
        assert.equal(received, request);
        return new Response('<html lang="pt-BR"></html>', { headers: { 'Content-Type': 'text/html', ETag: '"asset"' } });
      } },
    });
    assert.equal(calls, 1);
    assert.equal(response.headers.get('ETag'), '"asset"');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(await response.text(), '<html lang="pt-BR"></html>');
  }
});

test('HEAD desconhecido preserva 404 sem corpo no wrapper de publicação', async () => {
  const response = await worker.fetch(new Request('https://erp.test/api/inexistente', { method: 'HEAD' }), apiOnly);
  assert.equal(response.status, 404);
  assert.equal(await response.text(), '');
});
