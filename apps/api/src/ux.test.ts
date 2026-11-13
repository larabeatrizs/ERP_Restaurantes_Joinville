import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validPassword, stockTotalCents, filterBalances, balancesCsv } from '@erp/contracts';
import type { StockBalance } from '@erp/contracts';
import { createApp } from './index.ts';
import { createLoginRepository } from './repositories/supabase-login.ts';
import { ApiError } from './errors.ts';
import { normalizeLogin } from '@erp/contracts';
test('senha aceita oito caracteres com qualquer caixa e exige número e símbolo', () => {
  for (const password of ['abcdef1!', 'ABCDEF1!', 'Abcdef1!', 'SenhaMaisLonga123!']) assert.equal(validPassword(password), true);
  for (const password of ['abcde1!', 'abcdefgh', 'abcdef12', '1234567!', 'abcdefg!', 'abcdef1 ', 'áéíóú123']) assert.equal(validPassword(password), false);
});
test('resumo monetário usa precisão decimal e arredonda apenas o total exibido', () => {
  assert.equal(stockTotalCents([{ quantidade: '20', valor_unitario: '2.75' }]), 5500n);
  assert.equal(stockTotalCents([{ quantidade: '0.000001', valor_unitario: '0.000001' }]), 0n);
  assert.equal(stockTotalCents([{ quantidade: '1', valor_unitario: '0.005' }]), 1n);
  assert.equal(stockTotalCents([{ quantidade: '1', valor_unitario: '0.004999' }]), 0n);
  assert.equal(stockTotalCents([{ quantidade: '1', valor_unitario: '0.004' }, { quantidade: '1', valor_unitario: '0.004' }]), 1n);
});
test('saldo: pesquisa normalizada e CSV preservam unidade, precisão e segurança de fórmulas', () => {
  const row: StockBalance = { produto_id: '1', produto: '=Arroz', unidade_medida: 'KG', lote_id: '2', lote: 'L-1', validade: '2027-01-02', camara_id: '3', local: 'Câmara fria', quantidade: '7.000001', valor_unitario: '2.123456' };
  assert.equal(filterBalances([row], 'CAMARA').length, 1); assert.equal(filterBalances([row], 'L-1').length, 1); assert.equal(filterBalances([row], 'feijao').length, 0);
  const csv = balancesCsv([row], 'Unidade A'); assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes("\"'=Arroz\"")); assert.ok(csv.includes('7,000001')); assert.ok(csv.includes('Unidade A')); assert.ok(csv.includes('02/01/2027'));
});
test('identidade exige autenticação e devolve somente o nome fornecido pelo repository', async () => {
  let identityCalls = 0;
  const app = createApp(() => ({ authenticate: async () => {}, repository: {
    identity: async () => { identityCalls++; return { nome: 'Pessoa de teste' }; }, listUnits: async () => [], read: async () => { throw Error('Unused'); }, update: async () => { throw Error('Unused'); },
  } }));
  assert.equal((await app.fetch(new Request('https://erp.test/api/me'))).status, 401); assert.equal(identityCalls, 0);
  const response = await app.fetch(new Request('https://erp.test/api/me', { headers: { Authorization: 'Bearer ficticio' } })); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { nome: 'Pessoa de teste' });
});

test('login normaliza nome e valida payload estrito sem aceitar email ou metadados de perfil', async () => {
  const calls: unknown[] = [];
  const app = createApp(undefined, undefined, undefined, () => ({ signIn: async (login, password) => { calls.push({login,password}); return {access_token:'access-ficticio',refresh_token:'refresh-ficticio'}; } }));
  const request = (body: unknown) => new Request('https://erp.test/api/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(normalizeLogin(' ADMIN '), 'admin'); assert.equal(normalizeLogin('usuario@example.invalid'), null);
  const response = await app.fetch(request({login:' ADMIN ',password:'senha-existente'}));
  assert.equal(response.status,200); assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await response.json(),{access_token:'access-ficticio',refresh_token:'refresh-ficticio'});
  assert.deepEqual(calls,[{login:'admin',password:'senha-existente'}]);
  for(const body of [{login:'usuario@example.invalid',password:'segredo'},{login:'admin',password:''},{login:'admin',password:'x',perfil:'ADMIN'}]) assert.equal((await app.fetch(request(body))).status,422);
  assert.equal(calls.length,1);
  const wrongMethod = await app.fetch(new Request('https://erp.test/api/auth/login'));
  assert.equal(wrongMethod.status,405); assert.equal(wrongMethod.headers.get('Allow'),'POST');
});

test('adaptador de login resolve diretório privado e entrega apenas tokens, sem email ou chave administrativa', async () => {
  let called = false;
  const env = {SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ficticio',AUTH_LOGIN_DIRECTORY:JSON.stringify({admin:'conta@example.invalid'})};
  const repository = createLoginRepository(env,async(input,init)=>{
    const url=new URL(String(input)); assert.equal(url.pathname,'/auth/v1/token'); assert.equal(url.searchParams.get('grant_type'),'password');
    assert.equal(new Headers(init?.headers).get('apikey'),env.SUPABASE_PUBLISHABLE_KEY);
    assert.deepEqual(JSON.parse(String(init?.body)),{email:'conta@example.invalid',password:'sem-mudar-senha'}); called=true;
    return Response.json({access_token:'access',refresh_token:'refresh',user:{email:'conta@example.invalid'},weak_password:{reasons:[]}});
  });
  assert.deepEqual(await repository.signIn('admin','sem-mudar-senha'),{access_token:'access',refresh_token:'refresh'}); assert.equal(called,true);
  assert.throws(()=>createLoginRepository({...env,SUPABASE_PUBLISHABLE_KEY:'sb_secret_proibida'}),ApiError);
  assert.throws(()=>createLoginRepository({...env,AUTH_LOGIN_DIRECTORY:'{"email-invalido":"x"}'}),ApiError);
});

test('login desconhecido e senha inválida retornam a mesma negação; falhas internas não expõem resposta do provedor', async () => {
  const env={SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ficticio',AUTH_LOGIN_DIRECTORY:'{"admin":"conta@example.invalid"}'};
  const problems: {status:number;code:string;message:string}[]=[];
  for(const login of ['admin','desconhecido']) {
    let contacted=false;
    const repository=createLoginRepository(env,async()=>{contacted=true;return Response.json({msg:'Email interno privado'},{status:400});});
    await assert.rejects(()=>repository.signIn(login,'errada'),(error: unknown)=>{assert.ok(error instanceof ApiError);problems.push({status:error.status,code:error.code,message:error.message});return error.status===401;});
    assert.equal(contacted,true);
  }
  assert.deepEqual(problems[0],problems[1]);
  const impossible=createLoginRepository(env,async()=>Response.json({access_token:'x',refresh_token:'y'}));
  await assert.rejects(()=>impossible.signIn('desconhecido','x'),(error: unknown)=>error instanceof ApiError&&error.status===401);
  for(const status of [429,500]) {
    const repo=createLoginRepository(env,async()=>Response.json({msg:'Detalhe interno'},{status}));
    await assert.rejects(()=>repo.signIn('admin','x'),(error: unknown)=>error instanceof ApiError&&error.status===(status===429?429:503)&&!error.message.includes('interno'));
  }
});
