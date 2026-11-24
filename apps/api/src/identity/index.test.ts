import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIdentityApp } from './index.ts';
import type { IdentityEnv } from './index.ts';
const actor='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000090';
const fixture={login:'teste.novo',nome:'Pessoa sintética',email:'novo@example.invalid',perfil:'ESTOQUISTA',unidades:['1'],status:'ATIVO',revisao:null,motivo:'Teste de cadastro'};
const env:IdentityEnv={SUPABASE_URL:'https://vpowsedoajpdbeckimuv.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_FICTICIO',SUPABASE_ADMIN_KEY:'sb_secret_FICTICIO',AUTH_LOGIN_DIRECTORY:'{"admin":"legado@example.invalid"}',MANUAL_INVITES_ENABLED:'true'};
function harness({denied=false,completed=false,revoked=false,exists=false,pending=true}={}){
 const actions:string[]=[],paths:string[]=[];
 const app=createIdentityApp(async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));paths.push(url.pathname);
  if(url.pathname==='/auth/v1/user')return Response.json({id:actor,aud:'authenticated',is_anonymous:false});
  if(url.pathname==='/auth/v1/admin/users'){if(exists)return Response.json({msg:'private duplicate',code:'email_exists'},{status:422});return Response.json({id:target,email:fixture.email});}
  if(url.pathname==='/auth/v1/admin/generate_link')return Response.json({id:target,email:fixture.email,hashed_token:'token-sintetico-12345678901234567890',action_link:'https://unused.example.invalid',verification_type:'recovery'});
  if(url.pathname==='/auth/v1/token')return Response.json({access_token:'access-fixture',refresh_token:'refresh-fixture',token_type:'bearer',expires_in:3600,user:{id:target,email:fixture.email,aud:'authenticated'}});
  assert.equal(url.pathname,'/rest/v1/rpc/admin_usuarios_servico');
  const value=JSON.parse(String(init?.body));actions.push(value.p_acao);
  if(denied||revoked&&value.p_acao==='concluir')return Response.json({code:'PT403',message:'private denial'},{status:403});
  if(value.p_acao==='resolver')return Response.json({email:fixture.email,primeiro_acesso:pending});
  if(value.p_acao==='validar_login')return Response.json({permitido:true});
  if(value.p_acao==='autorizar')return Response.json({permitido:true});
  if(value.p_acao==='listar')return Response.json({usuarios:[],unidades:[],perfis:[],total:0,pode_criar:true});
  if(value.p_acao==='reemitir_dados'||value.p_acao==='reemitir_registrar')return Response.json({usuario_id:target,email:fixture.email});
  if(value.p_acao==='preparar')return Response.json({operacao:'operacao-fixture',auth_id:null,estado:completed?'CONCLUIDO':'PREPARADO'});
  if(value.p_acao==='auth_criada')return Response.json({registrado:true});
  if(value.p_acao==='concluir')return Response.json({criado:true,usuario_id:target});
  throw Error('Unexpected operation');
 });
 return {app,actions,paths};
}
const request=(path='/admin/usuarios',value:unknown=fixture,token=true)=>new Request('https://identity.internal'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer token-fixture'}:{})},body:JSON.stringify(value)});

test('situação privada: ator autenticado e RPC fixa, sem chamadas Auth Admin',async()=>{
 const calls:string[]=[],input={status:'INATIVO',revisao:'1',motivo:'Revisão sintética'};const app=createIdentityApp(async(resource,init)=>{const path=new URL(resource instanceof Request?resource.url:String(resource)).pathname;calls.push(path);if(path==='/auth/v1/user')return Response.json({id:actor,aud:'authenticated',is_anonymous:false});assert.equal(path,'/rest/v1/rpc/admin_usuario_situacao');assert.deepEqual(JSON.parse(String(init?.body)),{p_ator:actor,p_alvo:target,p_dados:input});return Response.json({id:target,nome:'Pessoa',status:'INATIVO',revisao:'2',proprio:false,primeiro_acesso:false,pode_alterar:true});});const response=await app.fetch(new Request(`https://identity.internal/admin/usuarios/${target}/situacao`,{method:'PATCH',headers:{Authorization:'Bearer token','Content-Type':'application/json'},body:JSON.stringify(input)}),{...env,MANUAL_INVITES_ENABLED:'false'});assert.equal(response.status,200);assert.deepEqual(calls,['/auth/v1/user','/rest/v1/rpc/admin_usuario_situacao']);
});
test('situação privada: capability/conflito e payload indevido não expõem SQL ou executam Auth Admin',async()=>{
 for(const code of['PT403','PT409','PT412']){const app=createIdentityApp(async(resource)=>new URL(resource instanceof Request?resource.url:String(resource)).pathname==='/auth/v1/user'?Response.json({id:actor,aud:'authenticated',is_anonymous:false}):Response.json({code,message:'private SQL details'},{status:400}));const response=await app.fetch(new Request(`https://identity.internal/admin/usuarios/${target}/situacao`,{headers:{Authorization:'Bearer token'}}),env);assert.equal(response.status,({PT403:403,PT409:409,PT412:412}as Record<string,number>)[code]);assert.equal((await response.text()).includes('SQL'),false);}
 const h=harness();const response=await h.app.fetch(new Request(`https://identity.internal/admin/usuarios/${target}/situacao`,{method:'PATCH',headers:{Authorization:'Bearer token','Content-Type':'application/json'},body:JSON.stringify({status:'INATIVO',revisao:'1',motivo:'Teste',ator_id:target})}),env);assert.equal(response.status,422);assert.deepEqual(h.paths,['/auth/v1/user']);
});
test('edição privada: identidade validada e rota fixa, sem Auth Admin ou dependência de convites',async()=>{
 const calls:string[]=[],input={nome:'Nome corrigido',perfil:'ESTOQUISTA',unidades:['2'],revisao:'1',motivo:'Correção sintética'};
 const app=createIdentityApp(async(resource,init)=>{const path=new URL(resource instanceof Request?resource.url:String(resource)).pathname;calls.push(path);if(path==='/auth/v1/user')return Response.json({id:actor,aud:'authenticated',is_anonymous:false});assert.equal(path,'/rest/v1/rpc/admin_usuario_edicao');const value=JSON.parse(String(init?.body));assert.equal(value.p_ator,actor);assert.equal(value.p_alvo,target);assert.deepEqual(value.p_dados,input);return Response.json({id:target,nome:input.nome,perfil:'ESTOQUISTA',status:'ATIVO',primeiro_acesso:false,unidades:['2'],revisao:'2',proprio:false,pode_editar:true});});
 const response=await app.fetch(new Request(`https://identity.internal/admin/usuarios/${target}`,{method:'PATCH',headers:{Authorization:'Bearer token','Content-Type':'application/json'},body:JSON.stringify(input)}),{...env,MANUAL_INVITES_ENABLED:'false'});assert.equal(response.status,200);assert.equal((await response.json()).revisao,'2');assert.deepEqual(calls,['/auth/v1/user','/rest/v1/rpc/admin_usuario_edicao']);
});
test('edição privada: payload indevido e negação/conflito não alteram Auth nem expõem erro SQL',async()=>{
 for(const code of['PT403','PT412']){const app=createIdentityApp(async(resource)=>{const path=new URL(resource instanceof Request?resource.url:String(resource)).pathname;if(path==='/auth/v1/user')return Response.json({id:actor,aud:'authenticated',is_anonymous:false});return Response.json({code,message:'private SQL details'},{status:400});});const response=await app.fetch(new Request(`https://identity.internal/admin/usuarios/${target}`,{headers:{Authorization:'Bearer token'}}),env);assert.equal(response.status,code==='PT403'?403:412);assert.equal((await response.text()).includes('SQL'),false);}
 const h=harness();const response=await h.app.fetch(new Request(`https://identity.internal/admin/usuarios/${target}`,{method:'PATCH',headers:{Authorization:'Bearer token','Content-Type':'application/json'},body:JSON.stringify({nome:'Nome',perfil:'ADMIN',unidades:['1'],revisao:'1',motivo:'Teste',ator_id:target})}),env);assert.equal(response.status,422);assert.deepEqual(h.paths,['/auth/v1/user']);
});
test('RF-008 bloqueia concessão de reabertura inválida antes de criar a conta Auth', async () => {
  const h = harness();
  const value = { ...fixture, acessos_periodo: [{ unidade_id: '1', fechar: false, reabrir: true }] };
  assert.equal((await h.app.fetch(request('/admin/usuarios', value), env)).status, 422);
  assert.deepEqual(h.actions, ['autorizar']);
  assert.ok(!h.paths.includes('/auth/v1/admin/users'));
});

test('identidade privada: cadastro novo entrega link só após conclusão e não envia email/senha',async()=>{
 const h=harness();const response=await h.app.fetch(request(),env);assert.equal(response.status,201);assert.equal(response.headers.get('Cache-Control'),'no-store');
 const result=await response.json();assert.match(result.acesso,/#definir-senha=token-sintetico/);assert.equal(JSON.stringify(result).includes(fixture.email),false);
 assert.deepEqual(h.actions,['autorizar','preparar','auth_criada','concluir']);assert.equal(h.paths.some(p=>/invite|recover$/.test(p)),false);
});
test('identidade privada: falta de sessão/capacidade não cria Auth nem gera link',async()=>{
 const h=harness({denied:true});assert.equal((await h.app.fetch(request('/admin/usuarios',fixture,false),env)).status,401);
 const r=await h.app.fetch(request(),env);assert.equal(r.status,403);assert.equal((await r.text()).includes('private denial'),false);
 assert.equal(h.paths.some(p=>p.includes('/admin/users')||p.includes('generate_link')),false);
});
test('identidade privada: repetição concluída não cria conta ou redefine senha/link',async()=>{
 const h=harness({completed:true});const r=await h.app.fetch(request(),env);assert.deepEqual(await r.json(),{criado:false,acesso:null});assert.deepEqual(h.actions,['autorizar','preparar']);assert.equal(h.paths.some(p=>p.includes('/admin/')),false);
});
test('identidade privada: email já existente interrompe; revogação final não entrega segredo',async()=>{
 const conflict=harness({exists:true});assert.equal((await conflict.app.fetch(request(),env)).status,409);assert.equal(conflict.paths.some(p=>p.includes('generate_link')),false);
 const revoked=harness({revoked:true});const r=await revoked.app.fetch(request(),env);assert.equal(r.status,403);assert.equal((await r.text()).includes('token-sintetico'),false);
});
test('identidade privada: login novo valida senha forte antes de ativar e devolve somente sessão',async()=>{
 const h=harness();const r=await h.app.fetch(request('/login',{login:fixture.login,password:'Senha123!'},false),env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{access_token:'access-fixture',refresh_token:'refresh-fixture'});assert.deepEqual(h.actions,['resolver','validar_login']);
 const weak=harness();assert.equal((await weak.app.fetch(request('/login',{login:fixture.login,password:'abcdef12'},false),env)).status,401);assert.deepEqual(weak.actions,['resolver']);
});
test('identidade privada: campos extras, payload grande e flag desligada negam provisionamento',async()=>{
 for(const value of [{...fixture,password:'nao-usar'},{...fixture,perfil:'SUPERADMIN'},{...fixture,unidades:[]}]){const h=harness();assert.equal((await h.app.fetch(request('/admin/usuarios',value),env)).status,422);assert.deepEqual(h.actions,['autorizar']);}
 const h=harness();assert.equal((await h.app.fetch(request('/admin/usuarios',{...fixture,nome:'a'.repeat(33000)}),env)).status,413);
 assert.equal((await h.app.fetch(request(),{...env,MANUAL_INVITES_ENABLED:'false'})).status,503);
});
test('identidade privada: reemissão explícita revalida elegibilidade antes de devolver link',async()=>{
 const h=harness();const r=await h.app.fetch(request(`/admin/usuarios/${target}/primeiro-acesso`,{}),env);assert.equal(r.status,200);assert.match((await r.json()).acesso,/#definir-senha=/);assert.deepEqual(h.actions,['autorizar','reemitir_dados','reemitir_registrar']);assert.equal(h.paths.includes('/auth/v1/admin/users'),false);
 const forbidden=harness({denied:true});assert.equal((await forbidden.app.fetch(request(`/admin/usuarios/${actor}/primeiro-acesso`,{}),env)).status,403);assert.equal(forbidden.paths.some(p=>p.includes('generate_link')),false);
});
test('identidade privada: ensaio opt-in com administrador sintético não habilita cadastro de pessoas',async()=>{
 const isolated={...env,MANUAL_INVITES_ENABLED:'false',SYNTHETIC_ADMIN_ID:actor};const h=harness();assert.equal((await h.app.fetch(request(),isolated)).status,403);assert.deepEqual(h.actions,['autorizar']);
 const other=harness();assert.equal((await other.app.fetch(request(),{...isolated,SYNTHETIC_ADMIN_ID:target})).status,503);
});
