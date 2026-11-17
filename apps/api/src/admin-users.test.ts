import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminProfileCodes, validateAdminUserSave } from '@erp/contracts';
import { createApp } from './index.ts';
import { createLoginRepository } from './repositories/supabase-login.ts';

const draft = () => ({ login: ' OPERADOR.RP1 ', nome: ' Operador sintético ', email: ' OPERADOR@EXAMPLE.INVALID ',
  perfil: 'ESTOQUISTA', unidades: ['1', '2'], status: 'ATIVO', revisao: null, motivo: ' Cadastro sintético ' });
test('admin API: sem sessão/serviço nega, proxy fixa destino e mantém segredo fora do Worker comum',async()=>{
 const app=createApp();assert.equal((await app.fetch(new Request('https://erp.test/api/admin/usuarios'))).status,401);
 const auth={Authorization:'Bearer fixture'};assert.equal((await app.fetch(new Request('https://erp.test/api/admin/usuarios',{headers:auth}))).status,503);
 let calls=0;const response=await app.fetch(new Request('https://erp.test/api/admin/usuarios?q=teste',{headers:auth}),{IDENTITY_SERVICE:{fetch:async request=>{calls++;assert.equal(request.url,'https://identity.internal/admin/usuarios?q=teste');assert.equal(request.headers.get('Authorization'),'Bearer fixture');return Response.json({usuarios:[]},{headers:{'Cache-Control':'no-store'}});}}});
 assert.equal(response.status,200);assert.equal(calls,1);assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.equal((await app.fetch(new Request('https://erp.test/api/admin/usuarios',{method:'DELETE',headers:auth}))).status,405);
});
test('login API: serviço privado recebe credenciais e a resposta pública contém apenas tokens',async()=>{
 const repo=createLoginRepository({SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',AUTH_LOGIN_DIRECTORY:'{"admin":"fixture@example.invalid"}',IDENTITY_SERVICE:{fetch:async request=>{assert.equal(request.url,'https://identity.internal/login');assert.deepEqual(await request.json(),{login:'admin',password:'existente'});return Response.json({access_token:'access',refresh_token:'refresh',email:'nao-expor@example.invalid'});}}});
 assert.deepEqual(await repo.signIn('admin','existente'),{access_token:'access',refresh_token:'refresh'});
});

test('admin: cadastro normaliza identidade e copia unidades sem alterar o rascunho', () => {
  const input = draft(), before = structuredClone(input), result = validateAdminUserSave(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw Error('Expected valid draft');
  assert.deepEqual(result.value, { login: 'operador.rp1', nome: 'Operador sintético', email: 'operador@example.invalid',
    perfil: 'ESTOQUISTA', unidades: ['1', '2'], status: 'ATIVO', revisao: null, motivo: 'Cadastro sintético' });
  result.value.unidades.push('3');
  assert.deepEqual(input, before);
});

test('admin: aceita os oito perfis do DRS e os três estados sem inventar capacidade', () => {
  assert.equal(adminProfileCodes.length, 8);
  for (const perfil of adminProfileCodes) for (const status of ['ATIVO', 'INATIVO', 'BLOQUEADO']) {
    assert.equal(validateAdminUserSave({ ...draft(), perfil, status, revisao: '9007199254740993' }).ok, true);
  }
  for (const perfil of ['SUPERADMIN', 'admin', 'CONFIGURACAO_EDITAR', ['ADMIN'], null]) {
    const result = validateAdminUserSave({ ...draft(), perfil });
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.field, 'perfil');
  }
});

test('admin: rejeita mass assignment de senha, identidade Auth, permissões e metadados', () => {
  for (const key of ['senha', 'password', 'senha_hash', 'id', 'auth_user_id', 'permissoes', 'user_metadata', 'service_role']) {
    const result = validateAdminUserSave({ ...draft(), [key]: 'nao-aceitar' });
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.field, 'formulario');
  }
  for (const value of [null, [], 'admin', 1, { ...draft(), motivo: undefined }]) assert.equal(validateAdminUserSave(value).ok, false);
  for (const key of Object.keys(draft())) {
    const input: Record<string, unknown> = draft(); delete input[key];
    assert.equal(validateAdminUserSave(input).ok, false);
  }
});

test('admin: vínculos exigem IDs bigint exatos, não vazios, sem repetição ou curinga', () => {
  for (const unidades of [[], ['1', '1'], [1], ['0'], ['-1'], ['1.0'], ['01'], ['*'], ['9223372036854775808'], '1', null]) {
    const result = validateAdminUserSave({ ...draft(), unidades });
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.field, 'unidades');
  }
  assert.equal(validateAdminUserSave({ ...draft(), unidades: ['9223372036854775807'] }).ok, true);
});

test('admin: valida login existente, identificação, email e limites sem usar dados pessoais', () => {
  const cases: [string, unknown][] = [
    ['login', 'ab'], ['login', 'a'.repeat(41)], ['login', 'pessoa@example.invalid'], ['login', 'usuário'],
    ['login', 'admin\n'], ['login', '_admin'], ['nome', '   '], ['nome', '\u00a0'], ['nome', 'a'.repeat(201)], ['nome', 'Nome\u0000'],
    ['email', 'a@b'], ['email', 'a..b@example.invalid'], ['email', '.a@example.invalid'], ['email', 'a@-example.invalid'],
    ['email', 'a@ex ample.invalid'], ['email', 'a@example.invalid\r\nBcc:x@example.invalid'], ['email', 'a@@example.invalid'],
    ['email', `${'a'.repeat(65)}@example.invalid`], ['status', 'PENDENTE'], ['status', null],
    ['revisao', 1], ['revisao', '0'], ['revisao', '9223372036854775808'], ['motivo', ' a '], ['motivo', 'a'.repeat(501)], ['motivo', 'abc\t'],
  ];
  for (const [field, value] of cases) {
    const result = validateAdminUserSave({ ...draft(), [field]: value });
    assert.equal(result.ok, false, `${field}: ${String(value)}`);
    if (!result.ok) assert.equal(result.field, field);
  }
  for (const login of ['a-b', 'a_b', 'a.b', '1rp', 'a'.repeat(40)]) assert.equal(validateAdminUserSave({ ...draft(), login }).ok, true);
  assert.equal(validateAdminUserSave({ ...draft(), email: 'operador+rp1@example.invalid', nome: 'a'.repeat(200), motivo: 'a'.repeat(500) }).ok, true);
});

test('admin: erros de validação não devolvem valores submetidos', () => {
  const result = validateAdminUserSave({ ...draft(), password: 'segredo-sintetico-nao-devolver' });
  assert.equal(JSON.stringify(result).includes('segredo-sintetico'), false);
  assert.equal(JSON.stringify(result).includes('operador@'), false);
});
