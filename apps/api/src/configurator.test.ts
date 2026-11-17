import assert from 'node:assert/strict';
import { test } from 'node:test';
import configurator from './configurator.ts';
import staging from './staging.ts';
import type { StagingEnv } from './staging.ts';

const env: StagingEnv = { ASSETS: { async fetch() { throw Error('API não pode servir HTML.'); } } };
test('ERP bloqueia toda administração mesmo com Bearer ou cabeçalho Host/Origin forjado', async () => {
  let calls = 0;
  for (const method of ['GET','POST','PATCH','HEAD','OPTIONS']) for (const path of ['/api/admin','/api/admin/usuarios','/api/admin/usuarios/00000000-0000-4000-8000-000000000001','/api/admin/usuarios/00000000-0000-4000-8000-000000000001/situacao','/api/admin/usuarios/00000000-0000-4000-8000-000000000001/primeiro-acesso','/api/admin/desconhecida']) {
    const response = await staging.fetch(new Request(`https://erp.test${path}`, { method, headers: { Authorization: 'Bearer valido', Host: 'configurador.test', Origin: 'https://configurador.test' } }), { ...env, IDENTITY_SERVICE: { async fetch() { calls++; return new Response('vazou'); } } });
    assert.equal(response.status,404); assert.equal(response.headers.get('Cache-Control'),'no-store');
    if (method === 'HEAD') assert.equal(await response.text(),'');
  }
  assert.equal(calls,0);
});
test('Configurador recusa APIs operacionais e desconhecidas em todos os métodos', async () => {
  for (const method of ['GET','POST','PATCH','DELETE','HEAD']) for (const path of ['/api/unidades','/api/unidades/1/configuracoes','/api/unidades/1/estoque/saldos','/api/unidades/1/produtos','/api/health','/api/admin/inexistente']) {
    assert.equal((await configurator.fetch(new Request(`https://config.test${path}`,{method,headers:{Authorization:'Bearer valido'}}),env)).status,404);
  }
});
test('Configurador exige sessão e mantém serviço privilegiado privado', async () => {
  for (const path of ['/api/me','/api/admin/usuarios']) assert.equal((await configurator.fetch(new Request(`https://config.test${path}`),env)).status,401);
  let forwarded = false;
  const response = await configurator.fetch(new Request('https://config.test/api/admin/usuarios',{headers:{Authorization:'Bearer session'}}),{...env,IDENTITY_SERVICE:{async fetch(request){forwarded=true;assert.equal(new URL(request.url).host,'identity.internal');assert.equal(request.headers.get('Authorization'),'Bearer session');return Response.json({error:{code:'FORBIDDEN'}},{status:403,headers:{'Cache-Control':'no-store'}});}}});
  assert.equal(forwarded,true); assert.equal(response.status,403);
});
test('HTML, arquivos e fallback do Configurador recebem noindex sem sugerir sigilo', async () => {
  for (const path of ['/','/assets/app.js','/usuarios']) {
    const response=await configurator.fetch(new Request(`https://config.test${path}`),{ASSETS:{async fetch(){return new Response('asset');}}});
    assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow');assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');assert.equal(response.headers.get('X-Frame-Options'),'DENY');
  }
});
