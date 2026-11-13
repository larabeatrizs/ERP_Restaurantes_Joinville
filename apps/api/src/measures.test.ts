import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measuresCsv } from '@erp/contracts';
import { createApp } from './index.ts';
import { measureSession } from './repositories/supabase-measures.ts';
import type { MeasureSessionFactory } from './repositories/measure-repository.ts';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
const input = { sigla: 'G', descricao: 'Grama', grandeza: 'MASSA' as const, fator_base: '0.001' };
const row = { ...input, id: '9007199254740993', revisao: '9007199254740995', status: 'ATIVO' as const, pode_excluir: true };
const list = { medidas: [row], total: 1, capacidades: { editar: true, ciclo_vida: false } };
function setup() {
  const calls: unknown[][] = [];
  const factory: MeasureSessionFactory = () => ({ authenticate: async () => { calls.push(['auth']); }, repository: {
    list: async (...args) => { calls.push(['list', ...args]); return list; },
    save: async (...args) => { calls.push(['save', ...args]); return row; },
    status: async (...args) => { calls.push(['status', ...args]); return row; },
    remove: async (...args) => { calls.push(['remove', ...args]); },
  } });
  const app = createApp(undefined, undefined, undefined, undefined, factory);
  const request = (route = '', method = 'GET', body?: unknown, authorized = true) => app.fetch(new Request('https://erp.test/api/unidades/1/medidas' + route, {
    method, headers: { ...(authorized ? { Authorization: 'Bearer synthetic' } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
  return { calls, request };
}
test('medidas HTTP: autentica, pagina/ordena e mantém bigint sem arredondar', async () => {
  const { request, calls } = setup(); const response = await request('?q=cafe&status=INATIVO&ordem=desc&offset=50');
  assert.equal(response.status, 200); assert.equal((await response.json()).medidas[0].id, row.id);
  assert.deepEqual(calls, [['auth'], ['list', '1', { q: 'cafe', status: 'INATIVO', ordem: 'desc', offset: 50 }, false]]);
});
test('medidas HTTP: campos estritos/erros por campo e revisão obrigatória', async () => {
  const { request, calls } = setup();
  for (const extra of [{ fator_base: 0.001 }, { fator_base: '0' }, { fator_base: '-1' }, { fator_base: '0.0000001' }, { grandeza: ['MASSA'] }, { sigla: '' }, { descricao: '' }, { status: 'INATIVO' }, { ator_id: 'outra pessoa' }]) assert.equal((await request('', 'POST', { ...input, ...extra })).status, 422);
  const invalid = await request('', 'POST', { ...input, descricao: '' }); assert.ok((await invalid.json()).error.fields.descricao);
  assert.equal((await request('/' + row.id, 'PATCH', input)).status, 422);
  assert.equal((await request('', 'POST', input)).status, 201);
  assert.equal((await request('/' + row.id, 'PATCH', { ...input, revisao: row.revisao })).status, 200);
  assert.equal(calls.filter(call => call[0] === 'save').length, 2);
});
test('medidas HTTP: status/exclusão são ações distintas e filtros desconhecidos negados', async () => {
  const { request, calls } = setup();
  assert.equal((await request('/' + row.id + '/status', 'POST', { status: 'INATIVO', revisao: row.revisao })).status, 200);
  assert.equal((await request('/' + row.id, 'DELETE', { revisao: row.revisao })).status, 200);
  for (const route of ['?q=a&q=b', '?ordem=SQL', '?status=TODOS', '?offset=-1', '?offset=2147483648', '?tabela=erp.usuario']) assert.equal((await request(route)).status, 400);
  assert.equal((await request('', 'GET', undefined, false)).status, 401);
  assert.equal((await request('/abc', 'PATCH', { ...input, revisao: '1' })).status, 400);
  const head = await request('', 'HEAD'); assert.equal(head.status, 405); assert.equal(await head.text(), '');
  assert.ok(calls.some(call => call[0] === 'status')); assert.ok(calls.some(call => call[0] === 'remove'));
});
test('medidas CSV: todos resultados filtrados, fator/null, aspas e fórmulas neutralizadas', async () => {
  const { request, calls } = setup(); const response = await request('/exportar?q=arroz&ordem=desc'); assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type')!, /text\/csv/); assert.match(await response.text(), /"0,001"/);
  assert.equal(calls[1]?.[0], 'list'); assert.equal(calls[1]?.[3], true);
  assert.equal((await request('/exportar?offset=1')).status, 400);
  const csv = measuresCsv([{ ...row, descricao: '  =HYPERLINK("x")' }, { ...row, descricao: '@SUM(1)', fator_base: null }]);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes("\"'  =HYPERLINK(\"\"x\"\")\"")); assert.ok(csv.includes("\"'@SUM(1)\""));
});
test('medidas SDK: Auth antes da RPC; sessão/publicável/RLS e payload exato', async () => {
  const calls: { path: string; headers: Headers; body: unknown }[] = [];
  const fetcher: typeof fetch = async (target, init) => {
    const url = new URL(String(target)); calls.push({ path: url.pathname, headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : null });
    return url.pathname === '/auth/v1/user' ? Response.json({ id: '10000000-0000-4000-8000-000000000001', aud: 'authenticated', is_anonymous: false }) : Response.json(list);
  };
  const app = createApp(undefined, undefined, undefined, undefined, (runtime, token) => measureSession(runtime, token, fetcher));
  const response = await app.fetch(new Request('https://erp.test/api/unidades/1/medidas', { headers: { Authorization: 'Bearer synthetic' } }), env);
  assert.equal(response.status, 200); assert.deepEqual(calls.map(c => c.path), ['/auth/v1/user', '/rest/v1/rpc/medida_operacao']);
  assert.equal(calls[1]?.headers.get('Content-Profile'), 'erp'); assert.equal(calls[1]?.headers.get('Authorization'), 'Bearer synthetic'); assert.equal(calls[1]?.headers.get('apikey'), env.SUPABASE_PUBLISHABLE_KEY);
});
test('medidas SDK: erros seguros e resposta inválida não expõem SQL', async () => {
  for (const [code, status] of [['PT403', 403], ['PT404', 404], ['PT409', 409], ['PT412', 412], ['PT422', 422], ['PT413', 413], ['P0001', 503]] as const) {
    const app = createApp(undefined, undefined, undefined, undefined, (runtime, token) => measureSession(runtime, token, async target => String(target).includes('/auth/v1/user') ? Response.json({ id: '10000000-0000-4000-8000-000000000001', aud: 'authenticated' }) : Response.json({ code, message: 'SQL SECRET detail' }, { status: 400 })));
    const response = await app.fetch(new Request('https://erp.test/api/unidades/1/medidas', { headers: { Authorization: 'Bearer synthetic' } }), env);
    assert.equal(response.status, status); assert.ok(!(await response.text()).includes('SECRET'));
  }
});
test('medidas SDK: DTO inválido é recusado e propriedades internas não são publicadas', async () => {
 for (const invalid of [false, true]) {
  const result={...list, segredo:'interno',capacidades:{...list.capacidades,interno:true},medidas:[{...row,id:invalid?42:row.id,segredo:'interno'}]};
  const app=createApp(undefined, undefined, undefined, undefined, (runtime,token)=>measureSession(runtime,token,async target=>String(target).includes('/auth/v1/user')?Response.json({id:'10000000-0000-4000-8000-000000000001',aud:'authenticated'}):Response.json(result)));
  const response=await app.fetch(new Request('https://erp.test/api/unidades/1/medidas',{headers:{Authorization:'Bearer synthetic'}}),env);
  assert.equal(response.status,invalid?503:200);assert.ok(!(await response.text()).includes('interno'));
 }
});
test('medidas SDK: identidade anônima não consulta RPC e credencial administrativa é recusada', async () => {
 let calls=0;const app=createApp(undefined, undefined, undefined, undefined, (runtime,token)=>measureSession(runtime,token,async()=>{calls++;return Response.json({id:'10000000-0000-4000-8000-000000000001',aud:'authenticated',is_anonymous:true});}));
 const response=await app.fetch(new Request('https://erp.test/api/unidades/1/medidas',{headers:{Authorization:'Bearer synthetic'}}),env);assert.equal(response.status,401);assert.equal(calls,1);
 assert.throws(()=>measureSession({...env,SUPABASE_PUBLISHABLE_KEY:'sb_secret_ficticia'},'synthetic'),/indisponível/);
});
